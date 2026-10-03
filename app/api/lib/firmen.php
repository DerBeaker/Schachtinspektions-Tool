<?php
// Mehrere Firmen (Mandanten): Anmeldung, Firmendaten, Einladungen, „Passwort vergessen“
// und der Betreiber-Bereich (Firmen anlegen, Lizenz, Sperre, Export, Löschen).

declare(strict_types=1);

const SB_ROLES = ['admin', 'inspector'];

function sb_cut(string $s, int $n): string
{
    return function_exists('mb_substr') ? mb_substr($s, 0, $n) : substr($s, 0, $n);
}

function sb_date(?int $ts): ?string
{
    return $ts ? date('Y-m-d', $ts - 1) : null;
}

/** „JJJJ-MM-TT“ → Ende des Tages als Zeitstempel (gültig bis einschließlich), '' → null. */
function sb_parse_date($v): ?int
{
    $v = trim((string) $v);
    if ($v === '') {
        return null;
    }
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        sb_fail(400, 'Datum bitte als JJJJ-MM-TT angeben.');
    }
    return mktime(0, 0, 0, (int) $m[2], (int) $m[3] + 1, (int) $m[1]);
}

/** Firmendaten für Berichte (Name, Anschrift, Kontakt, Logo) – für alle Geräte der Firma. */
function sb_firma(int $tenant): array
{
    $st = sb_db()->prepare('SELECT name, firma, firma_updated FROM sb_tenants WHERE id = ?');
    $st->execute([$tenant]);
    $t = $st->fetch() ?: ['name' => '', 'firma' => '', 'firma_updated' => 0];
    $f = json_decode((string) ($t['firma'] ?? ''), true) ?: [];
    return [
        'name' => $t['name'], 'anschrift' => $f['anschrift'] ?? '', 'kontakt' => $f['kontakt'] ?? '',
        'logo' => $f['logo'] ?? '', 'updated' => (int) $t['firma_updated'],
    ];
}

function sb_lizenz(int $tenant): array
{
    $db = sb_db();
    $st = $db->prepare('SELECT max_users, valid_until, active FROM sb_tenants WHERE id = ?');
    $st->execute([$tenant]);
    $t = $st->fetch();
    $st = $db->prepare('SELECT COUNT(*) FROM sb_users WHERE tenant_id = ? AND active = 1');
    $st->execute([$tenant]);
    return [
        'maxUsers' => $t['max_users'] !== null ? (int) $t['max_users'] : null,
        'validUntil' => sb_date($t['valid_until'] !== null ? (int) $t['valid_until'] : null),
        'activeUsers' => (int) $st->fetchColumn(),
    ];
}

/** Protokollierte Fehlversuche höchstens 24 Stunden aufbewahren (Datensparsamkeit). */
function sb_purge_attempts(): void
{
    sb_db()->prepare('DELETE FROM sb_login_attempts WHERE at < ?')->execute([time() - 86400]);
}

/** Benutzer der eigenen Firma löschen (Admin; nicht sich selbst). Datensätze bleiben erhalten. */
function handle_user_delete(array $u): never
{
    sb_require_admin($u);
    $id = (int) (sb_input(1000)['id'] ?? 0);
    if ($id === $u['id']) {
        sb_fail(400, 'Das eigene Konto kann nicht gelöscht werden.');
    }
    $db = sb_db();
    $st = $db->prepare('SELECT operator FROM sb_users WHERE id = ? AND tenant_id = ?');
    $st->execute([$id, $u['tenant_id']]);
    $row = $st->fetch();
    if (!$row) {
        sb_fail(404, 'Benutzer nicht gefunden.');
    }
    if ((int) $row['operator'] === 1) {
        sb_fail(400, 'Das Betreiber-Konto kann nicht gelöscht werden.');
    }
    $db->prepare('DELETE FROM sb_sessions WHERE user_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM sb_tokens WHERE user_id = ?')->execute([$id]);
    $db->prepare('DELETE FROM sb_users WHERE id = ? AND tenant_id = ?')->execute([$id, $u['tenant_id']]);
    sb_json(['ok' => true]);
}

/** Sitzung anlegen und die Anmeldeantwort liefern. */
function sb_start_session(array $u): array
{
    $db = sb_db();
    $db->prepare('DELETE FROM sb_sessions WHERE expires_at < ?')->execute([time()]);
    $token = bin2hex(random_bytes(32));
    $days = (int) (sb_config()['session_days'] ?? 30);
    $db->prepare('INSERT INTO sb_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        ->execute([hash('sha256', $token), $u['id'], time(), time() + $days * 86400]);
    $db->prepare('UPDATE sb_users SET last_login = ? WHERE id = ?')->execute([time(), $u['id']]);
    return [
        'token' => $token, 'user' => sb_public_user($u), 'features' => ['ai' => sb_ai_enabled()],
        'firma' => sb_firma((int) $u['tenant_id']), 'lizenz' => sb_lizenz((int) $u['tenant_id']),
    ];
}

function handle_login(): never
{
    $in = sb_input(10_000);
    $login = strtolower(trim((string) ($in['username'] ?? '')));
    $password = (string) ($in['password'] ?? '');
    $ip = substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 64);
    $db = sb_db();
    $since = time() - 900;
    sb_purge_attempts();
    $st = $db->prepare('SELECT COUNT(*) FROM sb_login_attempts WHERE username = ? AND at > ?');
    $st->execute([$login, $since]);
    if ((int) $st->fetchColumn() >= 10) {
        sb_fail(429, 'Zu viele Fehlversuche – bitte 15 Minuten warten.');
    }
    $st = $db->prepare(
        'SELECT u.*, t.name AS tenant, t.active AS tenant_active, t.valid_until FROM sb_users u JOIN sb_tenants t ON t.id = u.tenant_id
         WHERE (u.username = ? OR u.email = ?) AND u.active = 1'
    );
    $st->execute([$login, $login]);
    $u = $st->fetch();
    if (!$u || !password_verify($password, $u['pass_hash'])) {
        $db->prepare('INSERT INTO sb_login_attempts (username, ip, at) VALUES (?, ?, ?)')->execute([$login, $ip, time()]);
        usleep(400_000);
        sb_fail(403, 'E-Mail/Benutzername oder Passwort falsch.');
    }
    sb_check_tenant($u);
    if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) {
        $db->prepare('UPDATE sb_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    $db->prepare('DELETE FROM sb_login_attempts WHERE username = ? OR at < ?')->execute([$login, $since]);
    sb_json(sb_start_session($u));
}

function handle_firma_save(array $u): never
{
    sb_require_admin($u);
    $in = sb_input(1_500_000);
    $logo = (string) ($in['logo'] ?? '');
    if ($logo !== '' && (strlen($logo) > 1_000_000 || !preg_match('#^data:image/(jpeg|png);base64,[A-Za-z0-9+/=]+$#', $logo))) {
        sb_fail(400, 'Logo ungültig oder zu groß.');
    }
    $f = [
        'anschrift' => sb_cut(trim((string) ($in['anschrift'] ?? '')), 400),
        'kontakt' => sb_cut(trim((string) ($in['kontakt'] ?? '')), 200),
        'logo' => $logo,
    ];
    $name = sb_cut(trim((string) ($in['name'] ?? '')), 120);
    $db = sb_db();
    $db->prepare('UPDATE sb_tenants SET firma = ?, firma_updated = ? WHERE id = ?')
        ->execute([json_encode($f, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), sb_now(), $u['tenant_id']]);
    if ($name !== '') {
        $db->prepare('UPDATE sb_tenants SET name = ? WHERE id = ?')->execute([$name, $u['tenant_id']]);
    }
    sb_json(['ok' => true, 'firma' => sb_firma($u['tenant_id'])]);
}

// ---------------------------------------------------------------- Einladungen

function sb_invite_create(int $tenant, array $in, array $by): array
{
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    if (!sb_valid_email($email)) {
        sb_fail(400, 'Bitte eine gültige E-Mail-Adresse angeben.');
    }
    $role = in_array($in['role'] ?? '', SB_ROLES, true) ? $in['role'] : 'inspector';
    $db = sb_db();
    $st = $db->prepare('SELECT id FROM sb_users WHERE email = ? OR username = ?');
    $st->execute([$email, $email]);
    if ($st->fetch()) {
        sb_fail(409, 'Für diese E-Mail-Adresse gibt es bereits einen Zugang.');
    }
    sb_check_user_limit($tenant);
    // ältere offene Einladung an dieselbe Adresse ersetzen
    $db->prepare("DELETE FROM sb_tokens WHERE kind = 'invite' AND tenant_id = ? AND email = ? AND used_at IS NULL")->execute([$tenant, $email]);
    $name = sb_cut(trim((string) ($in['name'] ?? '')), 120);
    $token = sb_new_token('invite', $tenant, ['email' => $email, 'name' => $name, 'role' => $role, 'created_by' => $by['id']], 24 * 14);
    $link = sb_app_url() . '#/einladung/' . $token;
    $firma = sb_firma($tenant)['name'];
    $text = 'Guten Tag' . ($name !== '' ? " $name" : '') . ",\n\n"
        . "{$by['name']} hat Sie eingeladen, Schachtblick für „{$firma}“ zu nutzen"
        . ($role === 'admin' ? ' (als Administrator)' : '') . ".\n\n"
        . "Zugang einrichten (Link 14 Tage gültig):\n$link\n\n"
        . "Ihre Anmeldung ist danach Ihre E-Mail-Adresse $email.\n\n"
        . 'Schachtblick – ' . SB_VENDOR . "\n";
    $mailed = sb_mail($email, "Einladung zu Schachtblick – $firma", $text);
    return ['ok' => true, 'link' => $link, 'mailed' => $mailed, 'mailError' => $mailed ? null : sb_mail_fehler(), 'email' => $email, 'role' => $role];
}

function handle_invite(array $u): never
{
    sb_require_admin($u);
    sb_json(sb_invite_create($u['tenant_id'], sb_input(10_000), $u));
}

function handle_invites(array $u): never
{
    sb_require_admin($u);
    $st = sb_db()->prepare("SELECT id, email, name, role, expires_at FROM sb_tokens WHERE kind = 'invite' AND tenant_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC");
    $st->execute([$u['tenant_id'], time()]);
    sb_json(['invites' => array_map(fn($r) => [
        'id' => (int) $r['id'], 'email' => $r['email'], 'name' => $r['name'], 'role' => $r['role'], 'expires' => date('Y-m-d', (int) $r['expires_at']),
    ], $st->fetchAll())]);
}

function handle_invite_revoke(array $u): never
{
    sb_require_admin($u);
    $in = sb_input(1000);
    sb_db()->prepare("DELETE FROM sb_tokens WHERE id = ? AND tenant_id = ? AND kind = 'invite'")->execute([(int) ($in['id'] ?? 0), $u['tenant_id']]);
    sb_json(['ok' => true]);
}

function handle_invite_info(): never
{
    $in = sb_input(2000);
    $row = sb_token_row((string) ($in['token'] ?? ''), 'invite');
    sb_json(['firma' => $row['tenant'], 'email' => $row['email'], 'name' => $row['name'], 'role' => $row['role']]);
}

function handle_invite_accept(): never
{
    $in = sb_input(10_000);
    $row = sb_token_row((string) ($in['token'] ?? ''), 'invite');
    sb_check_tenant($row);
    $password = (string) ($in['password'] ?? '');
    if (strlen($password) < 8) {
        sb_fail(400, 'Das Passwort muss mindestens 8 Zeichen haben.');
    }
    $name = sb_cut(trim((string) ($in['name'] ?? '')), 120) ?: ($row['name'] ?: $row['email']);
    $db = sb_db();
    $db->beginTransaction();
    try {
        $st = $db->prepare('SELECT id FROM sb_users WHERE email = ? OR username = ?');
        $st->execute([$row['email'], $row['email']]);
        if ($st->fetch()) {
            sb_fail(409, 'Für diese E-Mail-Adresse gibt es bereits einen Zugang.');
        }
        sb_check_user_limit((int) $row['tenant_id']);
        $db->prepare('INSERT INTO sb_users (tenant_id, username, email, name, pass_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
            ->execute([$row['tenant_id'], $row['email'], $row['email'], $name, password_hash($password, PASSWORD_DEFAULT), $row['role'] ?: 'inspector', time()]);
        $id = (int) $db->lastInsertId();
        $db->prepare('UPDATE sb_tokens SET used_at = ? WHERE id = ?')->execute([time(), $row['id']]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    $st = $db->prepare('SELECT u.*, t.name AS tenant FROM sb_users u JOIN sb_tenants t ON t.id = u.tenant_id WHERE u.id = ?');
    $st->execute([$id]);
    sb_json(sb_start_session($st->fetch()));
}

// ---------------------------------------------------------------- Passwort vergessen

function handle_reset_request(): never
{
    $in = sb_input(2000);
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $db = sb_db();
    sb_purge_attempts();
    $key = 'reset:' . sb_cut($email, 80);
    $st = $db->prepare('SELECT COUNT(*) FROM sb_login_attempts WHERE username = ? AND at > ?');
    $st->execute([$key, time() - 3600]);
    $tooMany = (int) $st->fetchColumn() >= 5;
    $db->prepare('INSERT INTO sb_login_attempts (username, ip, at) VALUES (?, ?, ?)')->execute([$key, substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 64), time()]);
    if (!$tooMany && sb_valid_email($email)) {
        $st = $db->prepare('SELECT u.id, u.name, u.tenant_id FROM sb_users u WHERE u.email = ? AND u.active = 1');
        $st->execute([$email]);
        if ($u = $st->fetch()) {
            $db->prepare("DELETE FROM sb_tokens WHERE kind = 'reset' AND user_id = ?")->execute([$u['id']]);
            $token = sb_new_token('reset', (int) $u['tenant_id'], ['user_id' => (int) $u['id'], 'email' => $email], 2);
            $link = sb_app_url() . '#/passwort/' . $token;
            sb_mail($email, 'Schachtblick – neues Passwort', "Guten Tag {$u['name']},\n\nüber diesen Link vergeben Sie ein neues Passwort (2 Stunden gültig):\n$link\n\n"
                . "Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail einfach.\n\nSchachtblick – " . SB_VENDOR . "\n");
        }
    }
    // keine Auskunft, ob es die Adresse gibt
    sb_json(['ok' => true]);
}

function handle_reset(): never
{
    $in = sb_input(2000);
    $row = sb_token_row((string) ($in['token'] ?? ''), 'reset');
    $password = (string) ($in['password'] ?? '');
    if (strlen($password) < 8) {
        sb_fail(400, 'Das Passwort muss mindestens 8 Zeichen haben.');
    }
    $db = sb_db();
    $db->prepare('UPDATE sb_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $row['user_id']]);
    $db->prepare('DELETE FROM sb_sessions WHERE user_id = ?')->execute([$row['user_id']]);
    $db->prepare('UPDATE sb_tokens SET used_at = ? WHERE id = ?')->execute([time(), $row['id']]);
    sb_json(['ok' => true]);
}

// ---------------------------------------------------------------- Betreiber-Bereich

function handle_op_tenants(array $u): never
{
    sb_require_operator($u);
    $db = sb_db();
    $by = fn(string $sql, array $p = []) => (function () use ($db, $sql, $p) {
        $st = $db->prepare($sql);
        $st->execute($p);
        $out = [];
        foreach ($st->fetchAll() as $r) {
            $out[(int) $r['tenant_id']][] = $r;
        }
        return $out;
    })();
    $users = $by('SELECT tenant_id, COUNT(*) AS n, SUM(active) AS aktiv, MAX(last_login) AS last_login FROM sb_users GROUP BY tenant_id');
    $admins = $by("SELECT tenant_id, name, email, username FROM sb_users WHERE role = 'admin' AND active = 1 ORDER BY id");
    $records = $by('SELECT tenant_id, type, COUNT(*) AS n, MAX(updated_at) AS last FROM sb_records WHERE deleted = 0 GROUP BY tenant_id, type');
    $photos = $by('SELECT tenant_id, COUNT(*) AS n, SUM(size) AS bytes FROM sb_photos GROUP BY tenant_id');
    $invites = $by("SELECT tenant_id, COUNT(*) AS n FROM sb_tokens WHERE kind = 'invite' AND used_at IS NULL AND expires_at > ? GROUP BY tenant_id", [time()]);
    $out = [];
    foreach ($db->query('SELECT id, name, active, max_users, valid_until, note, contact, created_at FROM sb_tenants ORDER BY name')->fetchAll() as $t) {
        $id = (int) $t['id'];
        $rec = [];
        $last = 0;
        foreach ($records[$id] ?? [] as $r) {
            $rec[$r['type']] = (int) $r['n'];
            $last = max($last, (int) $r['last']);
        }
        $out[] = [
            'id' => $id, 'name' => $t['name'], 'active' => (bool) $t['active'], 'own' => $id === $u['tenant_id'],
            'maxUsers' => $t['max_users'] !== null ? (int) $t['max_users'] : null,
            'validUntil' => sb_date($t['valid_until'] !== null ? (int) $t['valid_until'] : null),
            'expired' => $t['valid_until'] !== null && (int) $t['valid_until'] < time(),
            'note' => $t['note'] ?? '', 'contact' => $t['contact'] ?? '', 'createdAt' => (int) $t['created_at'],
            'users' => (int) ($users[$id][0]['n'] ?? 0), 'activeUsers' => (int) ($users[$id][0]['aktiv'] ?? 0),
            'lastLogin' => isset($users[$id][0]['last_login']) ? (int) $users[$id][0]['last_login'] : null,
            'admins' => array_map(fn($a) => ['name' => $a['name'], 'email' => $a['email'] ?: $a['username']], $admins[$id] ?? []),
            'projects' => $rec['projects'] ?? 0, 'inspections' => $rec['inspections'] ?? 0,
            'photos' => (int) ($photos[$id][0]['n'] ?? 0), 'photoBytes' => (int) ($photos[$id][0]['bytes'] ?? 0),
            'lastActivity' => $last ?: null, 'openInvites' => (int) ($invites[$id][0]['n'] ?? 0),
        ];
    }
    sb_json(['tenants' => $out]);
}

function handle_op_tenant_save(array $u): never
{
    sb_require_operator($u);
    $in = sb_input(10_000);
    $name = sb_cut(trim((string) ($in['name'] ?? '')), 120);
    if ($name === '') {
        sb_fail(400, 'Bitte den Firmennamen angeben.');
    }
    $active = array_key_exists('active', $in) ? (!empty($in['active']) ? 1 : 0) : 1;
    $max = isset($in['maxUsers']) && $in['maxUsers'] !== '' && $in['maxUsers'] !== null ? max(1, (int) $in['maxUsers']) : null;
    $valid = sb_parse_date($in['validUntil'] ?? '');
    $note = sb_cut(trim((string) ($in['note'] ?? '')), 1000);
    $contact = sb_cut(trim((string) ($in['contact'] ?? '')), 190);
    $db = sb_db();
    if (!empty($in['id'])) {
        $id = (int) $in['id'];
        if ($id === $u['tenant_id'] && !$active) {
            sb_fail(400, 'Die eigene Firma kann nicht gesperrt werden.');
        }
        $st = $db->prepare('UPDATE sb_tenants SET name = ?, active = ?, max_users = ?, valid_until = ?, note = ?, contact = ? WHERE id = ?');
        $st->execute([$name, $active, $max, $valid, $note, $contact, $id]);
        if (!$st->rowCount()) {
            $chk = $db->prepare('SELECT id FROM sb_tenants WHERE id = ?');
            $chk->execute([$id]);
            if (!$chk->fetch()) {
                sb_fail(404, 'Firma nicht gefunden.');
            }
        }
        sb_json(['ok' => true, 'id' => $id]);
    }
    $db->prepare('INSERT INTO sb_tenants (name, created_at, active, max_users, valid_until, note, contact) VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$name, time(), $active, $max, $valid, $note, $contact]);
    $id = (int) $db->lastInsertId();
    $invite = null;
    if (trim((string) ($in['adminEmail'] ?? '')) !== '') {
        $invite = sb_invite_create($id, ['email' => $in['adminEmail'], 'name' => $in['adminName'] ?? '', 'role' => 'admin'], $u);
    }
    sb_json(['ok' => true, 'id' => $id, 'invite' => $invite]);
}

function sb_op_tenant(array $u, $id): array
{
    sb_require_operator($u);
    $st = sb_db()->prepare('SELECT * FROM sb_tenants WHERE id = ?');
    $st->execute([(int) $id]);
    $t = $st->fetch();
    if (!$t) {
        sb_fail(404, 'Firma nicht gefunden.');
    }
    return $t;
}

function handle_op_invite(array $u): never
{
    $in = sb_input(10_000);
    $t = sb_op_tenant($u, $in['tenant'] ?? 0);
    sb_json(sb_invite_create((int) $t['id'], $in, $u));
}

function handle_op_tenant_delete(array $u): never
{
    $in = sb_input(2000);
    $t = sb_op_tenant($u, $in['id'] ?? 0);
    $id = (int) $t['id'];
    if ($id === $u['tenant_id']) {
        sb_fail(400, 'Die eigene Firma kann nicht gelöscht werden.');
    }
    if (trim((string) ($in['confirm'] ?? '')) !== $t['name']) {
        sb_fail(400, 'Zur Bestätigung bitte den Firmennamen genau eingeben.');
    }
    $dir = rtrim(sb_config()['photo_dir'] ?? (__DIR__ . '/../data/photos'), '/') . '/' . $id;
    if (is_dir($dir)) {
        foreach (glob($dir . '/*') ?: [] as $f) {
            @unlink($f);
        }
        @rmdir($dir);
    }
    $db = sb_db();
    $db->beginTransaction();
    try {
        $db->prepare('DELETE FROM sb_sessions WHERE user_id IN (SELECT id FROM sb_users WHERE tenant_id = ?)')->execute([$id]);
        foreach (['sb_photos', 'sb_records', 'sb_tokens', 'sb_users'] as $table) {
            $db->prepare("DELETE FROM $table WHERE tenant_id = ?")->execute([$id]);
        }
        $db->prepare('DELETE FROM sb_tenants WHERE id = ?')->execute([$id]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    sb_json(['ok' => true]);
}

/** Test-E-Mail an den Betreiber (oder eine angegebene Adresse) – zeigt, ob und wie der Versand klappt. */
function handle_op_mailtest(array $u): never
{
    sb_require_operator($u);
    $in = sb_input(2000);
    $to = strtolower(trim((string) ($in['email'] ?? ''))) ?: (string) ($u['email'] ?? '');
    if (!sb_valid_email($to)) {
        sb_fail(400, 'Bitte eine E-Mail-Adresse angeben (für Ihr Betreiber-Konto ist keine hinterlegt).');
    }
    $ok = sb_mail($to, 'Schachtblick – Test-E-Mail', "Diese Test-E-Mail zeigt, dass der Versand von Einladungen und\n„Passwort vergessen“-Links funktioniert.\n\nVersand über: " . sb_mail_methode() . "\nAbsender: " . sb_mail_from() . "\n\nSchachtblick – " . SB_VENDOR . "\n");
    sb_json(['ok' => $ok, 'to' => $to, 'methode' => sb_mail_methode(), 'from' => sb_mail_from(), 'fehler' => $ok ? null : sb_mail_fehler()]);
}

/** Alle Datensätze einer Firma als JSON (z. B. bei Kündigung); Fotos bleiben im Fotoordner. */
function handle_op_export(array $u): never
{
    $t = sb_op_tenant($u, $_GET['tenant'] ?? 0);
    $id = (int) $t['id'];
    $db = sb_db();
    $st = $db->prepare('SELECT id, username, email, name, role, active, created_at, last_login FROM sb_users WHERE tenant_id = ? ORDER BY id');
    $st->execute([$id]);
    $users = $st->fetchAll();
    $st = $db->prepare('SELECT type, id, project_id, updated_at, deleted, data FROM sb_records WHERE tenant_id = ? ORDER BY type, id');
    $st->execute([$id]);
    $records = array_map(fn($r) => [
        'type' => $r['type'], 'id' => $r['id'], 'projectId' => $r['project_id'], 'updatedAt' => (int) $r['updated_at'],
        'deleted' => (bool) $r['deleted'], 'data' => json_decode($r['data'], true),
    ], $st->fetchAll());
    $st = $db->prepare('SELECT id, inspection_id, project_id, size, created_at FROM sb_photos WHERE tenant_id = ? ORDER BY created_at');
    $st->execute([$id]);
    $file = preg_replace('/[^A-Za-z0-9_-]+/', '_', $t['name']) . '_' . date('Y-m-d') . '.json';
    header('Content-Disposition: attachment; filename="Schachtblick_' . $file . '"');
    sb_json([
        'exportiert' => date('c'), 'firma' => ['id' => $id, 'name' => $t['name'], 'firmendaten' => sb_firma($id)],
        'benutzer' => $users, 'datensaetze' => $records, 'fotos' => $st->fetchAll(),
    ]);
}
