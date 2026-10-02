<?php
// Gemeinsame Funktionen: Konfiguration, Datenbank, JSON-Antworten, Authentifizierung.

declare(strict_types=1);

const SB_VERSION = '0.1.0';
const SB_TYPES = ['projects', 'manholes', 'inspections'];

function sb_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $file = getenv('SB_CONFIG') ?: __DIR__ . '/../config.php';
        if (!is_file($file)) {
            sb_fail(503, 'Server noch nicht eingerichtet (config.php fehlt).');
        }
        $cfg = require $file;
    }
    return $cfg;
}

function sb_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = sb_config();
        $pdo = new PDO($c['db_dsn'], $c['db_user'] ?? null, $c['db_pass'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if (sb_driver() === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA journal_mode = WAL');
        }
    }
    return $pdo;
}

function sb_driver(): string
{
    return str_starts_with(sb_config()['db_dsn'], 'sqlite:') ? 'sqlite' : 'mysql';
}

function sb_json($data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sb_fail(int $status, string $message): never
{
    sb_json(['error' => $message], $status);
}

function sb_input(int $maxBytes = 25_000_000): array
{
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        sb_fail(413, 'Anfrage zu groß.');
    }
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        sb_fail(400, 'Ungültiges JSON.');
    }
    return $data;
}

function sb_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = sb_config()['cors_origins'] ?? [];
    if ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token');
        header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
        header('Access-Control-Max-Age: 600');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function sb_now(): int
{
    return (int) round(microtime(true) * 1000);
}

/** Fortlaufende Revision (portabel für MySQL und SQLite). */
function sb_next_rev(): int
{
    $db = sb_db();
    $db->exec(sb_driver() === 'sqlite' ? 'INSERT INTO sb_revs DEFAULT VALUES' : 'INSERT INTO sb_revs () VALUES ()');
    return (int) $db->lastInsertId();
}

function sb_valid_id(string $id): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_-]{8,64}$/', $id);
}

// ---------------------------------------------------------------- Authentifizierung

function sb_token(): string
{
    $t = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($t === '' && preg_match('/^Bearer\s+(\S+)$/', $_SERVER['HTTP_AUTHORIZATION'] ?? '', $m)) {
        $t = $m[1];
    }
    return $t;
}

/** Liefert den angemeldeten Benutzer oder bricht mit 401 ab. */
function sb_user(): array
{
    $token = sb_token();
    if ($token === '' || strlen($token) > 128) {
        sb_fail(401, 'Nicht angemeldet.');
    }
    $st = sb_db()->prepare(
        'SELECT u.id, u.tenant_id, u.username, u.name, u.role, t.name AS tenant, s.expires_at
         FROM sb_sessions s JOIN sb_users u ON u.id = s.user_id JOIN sb_tenants t ON t.id = u.tenant_id
         WHERE s.token_hash = ? AND u.active = 1'
    );
    $st->execute([hash('sha256', $token)]);
    $u = $st->fetch();
    if (!$u || (int) $u['expires_at'] < time()) {
        sb_fail(401, 'Sitzung abgelaufen.');
    }
    // gleitende Verlängerung (höchstens einmal pro Tag)
    $days = (int) (sb_config()['session_days'] ?? 30);
    if ((int) $u['expires_at'] - time() < ($days - 1) * 86400) {
        sb_db()->prepare('UPDATE sb_sessions SET expires_at = ? WHERE token_hash = ?')
            ->execute([time() + $days * 86400, hash('sha256', $token)]);
    }
    unset($u['expires_at']);
    $u['id'] = (int) $u['id'];
    $u['tenant_id'] = (int) $u['tenant_id'];
    return $u;
}

function sb_require_admin(array $u): void
{
    if ($u['role'] !== 'admin') {
        sb_fail(403, 'Nur für Administratoren.');
    }
}

function sb_public_user(array $u): array
{
    return ['id' => (int) $u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role'], 'tenant' => $u['tenant'] ?? null];
}

function sb_ai_enabled(): bool
{
    $c = sb_config();
    return !empty($c['anthropic_api_key']) && is_file(__DIR__ . '/../vendor/autoload.php');
}
