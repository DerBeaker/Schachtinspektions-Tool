<?php
// Schachtblick API – Einstiegspunkt. Routen über ?r=<name> (funktioniert ohne mod_rewrite).

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/schema.php';
require __DIR__ . '/lib/firmen.php';

set_exception_handler(function (Throwable $e) {
    error_log('[schachtblick] ' . $e);
    sb_fail(500, 'Interner Serverfehler.');
});

sb_cors();
sb_migrate_if_needed();
$route = $_GET['r'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ("$method $route") {
    case 'GET ping':
        sb_json(['ok' => true, 'version' => SB_VERSION, 'installed' => sb_is_installed(), 'ai' => sb_ai_enabled()]);

    case 'POST login':
        handle_login();

    case 'POST logout':
        $t = sb_token();
        if ($t !== '') {
            sb_db()->prepare('DELETE FROM sb_sessions WHERE token_hash = ?')->execute([hash('sha256', $t)]);
        }
        sb_json(['ok' => true]);

    case 'GET me':
        $u = sb_user();
        sb_json(['user' => sb_public_user($u), 'features' => ['ai' => sb_ai_enabled()], 'firma' => sb_firma($u['tenant_id']), 'lizenz' => sb_lizenz($u['tenant_id'])]);

    case 'GET firma':
        sb_json(['firma' => sb_firma(sb_user()['tenant_id'])]);

    case 'POST firma':
        handle_firma_save(sb_user());

    case 'POST invite':
        handle_invite(sb_user());

    case 'GET invites':
        handle_invites(sb_user());

    case 'POST invite-revoke':
        handle_invite_revoke(sb_user());

    case 'POST invite-info':
        handle_invite_info();

    case 'POST invite-accept':
        handle_invite_accept();

    case 'POST reset-request':
        handle_reset_request();

    case 'POST reset':
        handle_reset();

    case 'GET op-tenants':
        handle_op_tenants(sb_user());

    case 'POST op-tenant':
        handle_op_tenant_save(sb_user());

    case 'POST op-invite':
        handle_op_invite(sb_user());

    case 'POST op-tenant-delete':
        handle_op_tenant_delete(sb_user());

    case 'GET op-export':
        handle_op_export(sb_user());

    case 'POST op-mailtest':
        handle_op_mailtest(sb_user());

    case 'POST sync':
        handle_sync(sb_user());

    case 'PUT photo':
        handle_photo_upload(sb_user());

    case 'GET photo':
        handle_photo_download(sb_user());

    case 'GET users':
        $u = sb_user();
        sb_require_admin($u);
        $st = sb_db()->prepare('SELECT id, username, email, name, role, active, last_login FROM sb_users WHERE tenant_id = ? ORDER BY name');
        $st->execute([$u['tenant_id']]);
        sb_json(['users' => array_map(fn($r) => [
            'id' => (int) $r['id'], 'username' => $r['username'], 'email' => $r['email'], 'name' => $r['name'], 'role' => $r['role'],
            'active' => (bool) $r['active'], 'lastLogin' => $r['last_login'] !== null ? (int) $r['last_login'] : null,
        ], $st->fetchAll()), 'lizenz' => sb_lizenz($u['tenant_id'])]);

    case 'POST users':
        handle_user_save(sb_user());

    case 'POST password':
        handle_password(sb_user());

    case 'POST ai':
        $u = sb_user();
        if (!sb_ai_enabled()) {
            sb_fail(501, 'KI-Assistent ist auf diesem Server nicht eingerichtet.');
        }
        require __DIR__ . '/lib/ai.php';
        sb_json(sb_ai_analyze(sb_input(12_000_000)));

    default:
        sb_fail(404, 'Unbekannte Route.');
}

// ---------------------------------------------------------------------------

function handle_sync(array $u): never
{
    $in = sb_input();
    $since = max(0, (int) ($in['since'] ?? 0));
    $changes = $in['changes'] ?? [];
    if (!is_array($changes) || count($changes) > 5000) {
        sb_fail(400, 'Ungültige Änderungsliste.');
    }
    $db = sb_db();
    $tenant = $u['tenant_id'];
    $sel = $db->prepare('SELECT updated_at FROM sb_records WHERE tenant_id = ? AND type = ? AND id = ?');
    $ins = $db->prepare('INSERT INTO sb_records (tenant_id, type, id, project_id, rev, updated_at, deleted, data, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $upd = $db->prepare('UPDATE sb_records SET project_id = ?, rev = ?, updated_at = ?, deleted = ?, data = ?, updated_by = ? WHERE tenant_id = ? AND type = ? AND id = ?');
    $accepted = 0;
    $skipped = 0;
    $db->beginTransaction();
    try {
        foreach ($changes as $c) {
            $type = (string) ($c['type'] ?? '');
            $id = (string) ($c['id'] ?? '');
            $updatedAt = (int) ($c['updatedAt'] ?? 0);
            if (!in_array($type, SB_TYPES, true) || !sb_valid_id($id) || !is_array($c['data'] ?? null)) {
                continue;
            }
            $projectId = (string) ($c['projectId'] ?? '');
            if ($projectId !== '' && !sb_valid_id($projectId)) {
                continue;
            }
            $json = json_encode($c['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false || strlen($json) > 4_000_000) {
                continue;
            }
            $sel->execute([$tenant, $type, $id]);
            $existing = $sel->fetchColumn();
            // Last-Writer-Wins: ältere Stände überschreiben keine neueren
            if ($existing !== false && (int) $existing > $updatedAt) {
                $skipped++;
                continue;
            }
            $rev = sb_next_rev();
            $deleted = !empty($c['deleted']) ? 1 : 0;
            if ($existing === false) {
                $ins->execute([$tenant, $type, $id, $projectId ?: null, $rev, $updatedAt, $deleted, $json, $u['id']]);
            } else {
                $upd->execute([$projectId ?: null, $rev, $updatedAt, $deleted, $json, $u['id'], $tenant, $type, $id]);
            }
            $accepted++;
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }

    $limit = 1500;
    $st = $db->prepare("SELECT type, id, project_id, rev, updated_at, deleted, data FROM sb_records WHERE tenant_id = ? AND rev > ? ORDER BY rev LIMIT $limit");
    $st->execute([$tenant, $since]);
    $rows = $st->fetchAll();
    $out = [];
    $maxRev = $since;
    foreach ($rows as $r) {
        $maxRev = max($maxRev, (int) $r['rev']);
        $out[] = [
            'type' => $r['type'], 'id' => $r['id'], 'projectId' => $r['project_id'], 'updatedAt' => (int) $r['updated_at'],
            'deleted' => (bool) $r['deleted'], 'data' => json_decode($r['data'], true),
        ];
    }
    $more = count($rows) === $limit;
    $photos = [];
    $st = $db->prepare('SELECT id, inspection_id, project_id, width, height, rev, created_at FROM sb_photos WHERE tenant_id = ? AND rev > ? ORDER BY rev LIMIT 5000');
    $st->execute([$tenant, $since]);
    foreach ($st->fetchAll() as $p) {
        if ($more && (int) $p['rev'] > $maxRev) {
            continue;
        }
        if (!$more) {
            $maxRev = max($maxRev, (int) $p['rev']);
        }
        $photos[] = ['id' => $p['id'], 'inspectionId' => $p['inspection_id'], 'projectId' => $p['project_id'], 'width' => $p['width'] !== null ? (int) $p['width'] : null, 'height' => $p['height'] !== null ? (int) $p['height'] : null, 'createdAt' => (int) $p['created_at']];
    }
    $st = $db->prepare('SELECT firma_updated FROM sb_tenants WHERE id = ?');
    $st->execute([$tenant]);
    sb_json(['rev' => $maxRev, 'more' => $more, 'changes' => $out, 'photos' => $photos, 'accepted' => $accepted, 'skipped' => $skipped, 'firmaUpdated' => (int) $st->fetchColumn()]);
}

function sb_photo_path(int $tenant, string $id): string
{
    $dir = rtrim(sb_config()['photo_dir'] ?? (__DIR__ . '/data/photos'), '/') . '/' . $tenant;
    if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
        sb_fail(500, 'Fotoverzeichnis kann nicht angelegt werden.');
    }
    return "$dir/$id.jpg";
}

function handle_photo_upload(array $u): never
{
    $id = (string) ($_GET['id'] ?? '');
    $insp = (string) ($_GET['inspection'] ?? '');
    $proj = (string) ($_GET['project'] ?? '');
    if (!sb_valid_id($id) || ($insp !== '' && !sb_valid_id($insp)) || ($proj !== '' && !sb_valid_id($proj))) {
        sb_fail(400, 'Ungültige Foto-ID.');
    }
    $max = (int) (sb_config()['max_photo_mb'] ?? 15) * 1024 * 1024;
    $data = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($data === false || strlen($data) === 0 || strlen($data) > $max) {
        sb_fail(413, 'Foto fehlt oder ist zu groß.');
    }
    if (substr($data, 0, 3) !== "\xFF\xD8\xFF") {
        sb_fail(415, 'Nur JPEG-Fotos werden angenommen.');
    }
    $path = sb_photo_path($u['tenant_id'], $id);
    if (file_put_contents($path . '.tmp', $data) === false || !rename($path . '.tmp', $path)) {
        sb_fail(500, 'Foto konnte nicht gespeichert werden.');
    }
    $db = sb_db();
    $rev = sb_next_rev();
    $db->prepare('DELETE FROM sb_photos WHERE tenant_id = ? AND id = ?')->execute([$u['tenant_id'], $id]);
    $w = max(0, min(20000, (int) ($_GET['w'] ?? 0))) ?: null;
    $h = max(0, min(20000, (int) ($_GET['h'] ?? 0))) ?: null;
    $db->prepare('INSERT INTO sb_photos (tenant_id, id, inspection_id, project_id, size, width, height, rev, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$u['tenant_id'], $id, $insp ?: null, $proj ?: null, strlen($data), $w, $h, $rev, sb_now(), $u['id']]);
    sb_json(['ok' => true, 'id' => $id, 'size' => strlen($data)]);
}

function handle_photo_download(array $u): never
{
    $id = (string) ($_GET['id'] ?? '');
    if (!sb_valid_id($id)) {
        sb_fail(400, 'Ungültige Foto-ID.');
    }
    $st = sb_db()->prepare('SELECT size FROM sb_photos WHERE tenant_id = ? AND id = ?');
    $st->execute([$u['tenant_id'], $id]);
    $path = sb_photo_path($u['tenant_id'], $id);
    if ($st->fetchColumn() === false || !is_file($path)) {
        sb_fail(404, 'Foto nicht gefunden.');
    }
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=31536000, immutable');
    readfile($path);
    exit;
}

function handle_user_save(array $u): never
{
    sb_require_admin($u);
    $in = sb_input(10_000);
    $db = sb_db();
    $role = in_array($in['role'] ?? '', ['admin', 'inspector'], true) ? $in['role'] : 'inspector';
    $name = trim((string) ($in['name'] ?? ''));
    $password = (string) ($in['password'] ?? '');
    if (!empty($in['id'])) {
        $id = (int) $in['id'];
        $st = $db->prepare('SELECT id FROM sb_users WHERE id = ? AND tenant_id = ?');
        $st->execute([$id, $u['tenant_id']]);
        if (!$st->fetch()) {
            sb_fail(404, 'Benutzer nicht gefunden.');
        }
        if ($id === $u['id'] && ($role !== 'admin' || empty($in['active']))) {
            sb_fail(400, 'Du kannst dich nicht selbst sperren oder herabstufen.');
        }
        $st = $db->prepare('SELECT active FROM sb_users WHERE id = ?');
        $st->execute([$id]);
        if (!empty($in['active']) && !(int) $st->fetchColumn()) {
            sb_check_user_limit($u['tenant_id']);
        }
        $email = sb_user_email($in, $id);
        $db->prepare('UPDATE sb_users SET name = ?, role = ?, active = ?, email = ? WHERE id = ?')
            ->execute([$name !== '' ? $name : 'Benutzer', $role, !empty($in['active']) ? 1 : 0, $email, $id]);
        if ($password !== '') {
            if (strlen($password) < 8) {
                sb_fail(400, 'Passwort muss mindestens 8 Zeichen haben.');
            }
            $db->prepare('UPDATE sb_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
            $db->prepare('DELETE FROM sb_sessions WHERE user_id = ?')->execute([$id]);
        }
        sb_json(['ok' => true]);
    }
    $username = strtolower(trim((string) ($in['username'] ?? '')));
    if (!preg_match('/^[a-z0-9._@-]{3,80}$/', $username)) {
        sb_fail(400, 'Benutzername: 3–80 Zeichen (a–z, 0–9, . _ - @).');
    }
    if (strlen($password) < 8) {
        sb_fail(400, 'Passwort muss mindestens 8 Zeichen haben.');
    }
    $st = $db->prepare('SELECT id FROM sb_users WHERE username = ? OR email = ?');
    $st->execute([$username, $username]);
    if ($st->fetch()) {
        sb_fail(409, 'Benutzername ist bereits vergeben.');
    }
    sb_check_user_limit($u['tenant_id']);
    $email = sb_user_email($in, 0) ?? (sb_valid_email($username) ? $username : null);
    $db->prepare('INSERT INTO sb_users (tenant_id, username, email, name, pass_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        ->execute([$u['tenant_id'], $username, $email, $name !== '' ? $name : $username, password_hash($password, PASSWORD_DEFAULT), $role, time()]);
    sb_json(['ok' => true, 'id' => (int) $db->lastInsertId()]);
}

/** E-Mail aus dem Formular prüfen (leer = keine); muss eindeutig sein. */
function sb_user_email(array $in, int $id): ?string
{
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    if ($email === '') {
        return null;
    }
    if (!sb_valid_email($email)) {
        sb_fail(400, 'E-Mail-Adresse ist ungültig.');
    }
    $st = sb_db()->prepare('SELECT id FROM sb_users WHERE (email = ? OR username = ?) AND id <> ?');
    $st->execute([$email, $email, $id]);
    if ($st->fetch()) {
        sb_fail(409, 'Diese E-Mail-Adresse wird bereits verwendet.');
    }
    return $email;
}

function handle_password(array $u): never
{
    $in = sb_input(10_000);
    $st = sb_db()->prepare('SELECT pass_hash FROM sb_users WHERE id = ?');
    $st->execute([$u['id']]);
    if (!password_verify((string) ($in['old'] ?? ''), (string) $st->fetchColumn())) {
        sb_fail(403, 'Altes Passwort ist falsch.');
    }
    $new = (string) ($in['new'] ?? '');
    if (strlen($new) < 8) {
        sb_fail(400, 'Neues Passwort muss mindestens 8 Zeichen haben.');
    }
    sb_db()->prepare('UPDATE sb_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    sb_json(['ok' => true]);
}
