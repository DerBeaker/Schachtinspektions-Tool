<?php
// Gemeinsame Funktionen: Konfiguration, Datenbank, JSON-Antworten, Authentifizierung.

declare(strict_types=1);

const SB_VERSION = '0.2.1';
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

/** Absender der E-Mails (config „mail_from“, sonst noreply@<Domain>). */
function sb_mail_from(): string
{
    $c = sb_config();
    return $c['mail_from'] ?? ($c['smtp']['user'] ?? ('noreply@' . preg_replace('/^www\./', '', explode(':', $_SERVER['HTTP_HOST'] ?? 'localhost')[0])));
}

/** Wie E-Mails verschickt werden: 'log' (Datei), 'smtp', 'mail' (PHP mail()) oder 'aus'. */
function sb_mail_methode(): string
{
    $c = sb_config();
    if (!empty($c['mail_log'])) {
        return 'log';
    }
    if (!empty($c['smtp']['host'])) {
        return 'smtp';
    }
    return ($c['mail'] ?? true) === false || !function_exists('mail') ? 'aus' : 'mail';
}

/** Grund, warum die letzte E-Mail nicht verschickt wurde (für die Anzeige). */
function sb_mail_fehler(?string $set = null, bool $reset = false): ?string
{
    static $fehler = null;
    if ($reset) {
        $fehler = null;
    } elseif ($set !== null) {
        $fehler = $set;
    }
    return $fehler;
}

/**
 * E-Mail senden (Text). Wege: SMTP (empfohlen, z. B. smtp.ionos.de mit einem Postfach der eigenen
 * Domain), PHP mail() oder – für Tests/lokal – 'mail_log' (Datei). Liefert true, wenn die Mail
 * übergeben wurde; sonst steht der Grund in sb_mail_fehler().
 */
function sb_mail(string $to, string $subject, string $text): bool
{
    sb_mail_fehler(null, true);
    $c = sb_config();
    $from = sb_mail_from();
    try {
        switch (sb_mail_methode()) {
            case 'log':
                if (file_put_contents($c['mail_log'], "To: $to\nFrom: $from\nSubject: $subject\n\n$text\n---\n", FILE_APPEND) === false) {
                    throw new RuntimeException('Mail-Logdatei nicht beschreibbar.');
                }
                return true;
            case 'smtp':
                sb_smtp_send($c['smtp'], $from, $to, $subject, $text);
                return true;
            case 'mail':
                $headers = "From: Schachtblick <$from>\r\nReply-To: $from\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
                $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
                if (@mail($to, $subj, $text, $headers, '-f' . $from) || @mail($to, $subj, $text, $headers)) {
                    return true;
                }
                throw new RuntimeException("PHP mail() hat die E-Mail abgelehnt. Meist ist der Absender „{$from}“ kein Postfach der eigenen Domain – in config.php „mail_from“ anpassen oder besser SMTP einrichten (siehe config.sample.php).");
            default:
                throw new RuntimeException('E-Mail-Versand ist ausgeschaltet (config.php: mail = false).');
        }
    } catch (Throwable $e) {
        error_log('[schachtblick] E-Mail an ' . $to . ' fehlgeschlagen: ' . $e->getMessage());
        sb_mail_fehler($e->getMessage());
        return false;
    }
}

/**
 * Minimaler SMTP-Versand (SSL auf Port 465, STARTTLS auf 587, 'none' nur für Tests) mit AUTH LOGIN.
 * Der Text wird base64-kodiert übertragen (Umlaute, keine Probleme mit Punkten am Zeilenanfang).
 */
function sb_smtp_send(array $s, string $from, string $to, string $subject, string $text): void
{
    $host = (string) $s['host'];
    $port = (int) ($s['port'] ?? 465);
    $secure = $s['secure'] ?? ($port === 465 ? 'ssl' : 'tls');
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . "$host:$port", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        throw new RuntimeException("Keine Verbindung zum Mailserver $host:$port ($errstr).");
    }
    stream_set_timeout($fp, 20);
    $lesen = function () use ($fp): string {
        $antwort = '';
        while (($zeile = fgets($fp, 1024)) !== false) {
            $antwort .= $zeile;
            if (strlen($zeile) < 4 || $zeile[3] === ' ') {
                break;
            }
        }
        return $antwort;
    };
    $befehl = function (?string $cmd, array $ok, string $zeigen = '') use ($fp, $lesen): string {
        if ($cmd !== null) {
            fwrite($fp, $cmd . "\r\n");
        }
        $r = $lesen();
        if (!in_array((int) substr($r, 0, 3), $ok, true)) {
            throw new RuntimeException('Mailserver: ' . trim($r ?: 'keine Antwort') . ($zeigen !== '' ? " (bei $zeigen)" : ''));
        }
        return $r;
    };
    try {
        $befehl(null, [220]);
        $ehlo = 'EHLO ' . preg_replace('/[^A-Za-z0-9.-]/', '', $_SERVER['HTTP_HOST'] ?? (gethostname() ?: 'localhost'));
        $befehl($ehlo, [250]);
        if ($secure === 'tls') {
            $befehl('STARTTLS', [220]);
            $methode = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT : 0);
            if (!stream_socket_enable_crypto($fp, true, $methode)) {
                throw new RuntimeException('TLS-Verschlüsselung zum Mailserver fehlgeschlagen.');
            }
            $befehl($ehlo, [250]);
        }
        if (!empty($s['user'])) {
            $befehl('AUTH LOGIN', [334]);
            $befehl(base64_encode((string) $s['user']), [334]);
            $befehl(base64_encode((string) ($s['pass'] ?? '')), [235], 'Anmeldung – Benutzer/Passwort des Postfachs prüfen');
        }
        $befehl("MAIL FROM:<$from>", [250], 'Absender');
        $befehl("RCPT TO:<$to>", [250, 251], 'Empfänger');
        $befehl('DATA', [354]);
        $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
        $kopf = [
            'Date: ' . date('r'),
            "From: Schachtblick <$from>",
            "To: <$to>",
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(12)) . "@$domain>",
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        $befehl(implode("\r\n", $kopf) . "\r\n\r\n" . rtrim(chunk_split(base64_encode($text), 76, "\r\n")) . "\r\n.", [250], 'Versand');
        fwrite($fp, "QUIT\r\n");
    } finally {
        fclose($fp);
    }
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
