<?php
// Gemeinsame Funktionen: Konfiguration, Datenbank, JSON-Antworten, Authentifizierung.

declare(strict_types=1);

const SB_VERSION = '0.2.0';
/** Betreiber der Plattform (erscheint in Hinweisen zu Lizenz und Sperre). */
const SB_VENDOR = 'MMSE Software Engineering';
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
        'SELECT u.id, u.tenant_id, u.username, u.name, u.role, u.email, u.operator, t.name AS tenant,
                t.active AS tenant_active, t.valid_until, t.max_users, s.expires_at
         FROM sb_sessions s JOIN sb_users u ON u.id = s.user_id JOIN sb_tenants t ON t.id = u.tenant_id
         WHERE s.token_hash = ? AND u.active = 1'
    );
    $st->execute([hash('sha256', $token)]);
    $u = $st->fetch();
    if (!$u || (int) $u['expires_at'] < time()) {
        sb_fail(401, 'Sitzung abgelaufen.');
    }
    sb_check_tenant($u);
    // gleitende Verlängerung (höchstens einmal pro Tag)
    $days = (int) (sb_config()['session_days'] ?? 30);
    if ((int) $u['expires_at'] - time() < ($days - 1) * 86400) {
        sb_db()->prepare('UPDATE sb_sessions SET expires_at = ? WHERE token_hash = ?')
            ->execute([time() + $days * 86400, hash('sha256', $token)]);
    }
    unset($u['expires_at']);
    $u['id'] = (int) $u['id'];
    $u['tenant_id'] = (int) $u['tenant_id'];
    $u['operator'] = (bool) $u['operator'];
    return $u;
}

/**
 * Lizenz und Sperre der Firma prüfen (Zeile mit tenant_active, valid_until, operator).
 * Die Firma des Betreibers ist davon ausgenommen.
 */
function sb_check_tenant(array $row): void
{
    if (!empty($row['operator'])) {
        return;
    }
    if (isset($row['tenant_active']) && (int) $row['tenant_active'] === 0) {
        sb_fail(403, 'Der Zugang Ihrer Firma ist gesperrt. Bitte wenden Sie sich an ' . SB_VENDOR . '.');
    }
    if (!empty($row['valid_until']) && (int) $row['valid_until'] < time()) {
        sb_fail(403, 'Die Lizenz Ihrer Firma ist am ' . date('d.m.Y', (int) $row['valid_until'] - 1) . ' abgelaufen. Bitte wenden Sie sich an ' . SB_VENDOR . '.');
    }
}

function sb_require_operator(array $u): void
{
    if (empty($u['operator'])) {
        sb_fail(403, 'Nur für den Betreiber.');
    }
}

/** Anzahl aktiver Benutzer einer Firma und Prüfung gegen die Lizenz. */
function sb_check_user_limit(int $tenant, int $add = 1): void
{
    $db = sb_db();
    $st = $db->prepare('SELECT max_users FROM sb_tenants WHERE id = ?');
    $st->execute([$tenant]);
    $max = $st->fetchColumn();
    if ($max === null || $max === false || (int) $max <= 0) {
        return;
    }
    $st = $db->prepare('SELECT COUNT(*) FROM sb_users WHERE tenant_id = ? AND active = 1');
    $st->execute([$tenant]);
    if ((int) $st->fetchColumn() + $add > (int) $max) {
        sb_fail(409, "Die Lizenz erlaubt höchstens $max aktive Benutzer. Bitte einen Benutzer sperren oder die Lizenz erweitern.");
    }
}

/** Adresse der App (für Links in E-Mails); Standard: Ordner über api/. */
function sb_app_url(): string
{
    $cfg = sb_config()['app_url'] ?? '';
    if ($cfg !== '') {
        return rtrim($cfg, '/') . '/';
    }
    $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'))), '/');
    return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir . '/';
}

function sb_valid_email(string $e): bool
{
    return strlen($e) <= 190 && filter_var($e, FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * E-Mail senden (Text). Mit 'mail_log' in der Konfiguration wird stattdessen in eine Datei
 * geschrieben (Tests, lokale Installation). Liefert true, wenn die Mail übergeben wurde.
 */
function sb_mail(string $to, string $subject, string $text): bool
{
    $c = sb_config();
    if (!empty($c['mail_log'])) {
        return file_put_contents($c['mail_log'], "To: $to\nSubject: $subject\n\n$text\n---\n", FILE_APPEND) !== false;
    }
    if (($c['mail'] ?? true) === false || !function_exists('mail')) {
        return false;
    }
    $from = $c['mail_from'] ?? ('noreply@' . preg_replace('/^www\./', '', explode(':', $_SERVER['HTTP_HOST'] ?? 'localhost')[0]));
    $headers = "From: Schachtblick <$from>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers, '-f' . $from);
}

/** Einmal-Link (Einladung oder Passwort) anlegen; liefert den Klartext-Token. */
function sb_new_token(string $kind, int $tenant, array $f, int $hours): string
{
    $token = bin2hex(random_bytes(24));
    sb_db()->prepare('INSERT INTO sb_tokens (token_hash, kind, tenant_id, user_id, email, name, role, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $kind, $tenant, $f['user_id'] ?? null, $f['email'] ?? null, $f['name'] ?? null, $f['role'] ?? null, time(), time() + $hours * 3600, $f['created_by'] ?? null]);
    return $token;
}

/** Gültigen Einmal-Link lesen (oder abbrechen). */
function sb_token_row(string $token, string $kind): array
{
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
        sb_fail(400, 'Der Link ist ungültig.');
    }
    $st = sb_db()->prepare('SELECT k.*, t.name AS tenant, t.active AS tenant_active, t.valid_until FROM sb_tokens k JOIN sb_tenants t ON t.id = k.tenant_id WHERE k.token_hash = ? AND k.kind = ?');
    $st->execute([hash('sha256', $token), $kind]);
    $row = $st->fetch();
    if (!$row || $row['used_at'] !== null || (int) $row['expires_at'] < time()) {
        sb_fail(410, 'Der Link ist abgelaufen oder wurde bereits verwendet.');
    }
    return $row;
}

function sb_require_admin(array $u): void
{
    if ($u['role'] !== 'admin') {
        sb_fail(403, 'Nur für Administratoren.');
    }
}

function sb_public_user(array $u): array
{
    return [
        'id' => (int) $u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role'],
        'email' => $u['email'] ?? null, 'operator' => !empty($u['operator']), 'tenant' => $u['tenant'] ?? null,
    ];
}

function sb_ai_enabled(): bool
{
    $c = sb_config();
    return !empty($c['anthropic_api_key']) && is_file(__DIR__ . '/../vendor/autoload.php');
}
