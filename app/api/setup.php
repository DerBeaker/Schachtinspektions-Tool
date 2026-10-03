<?php
// Einmalige Einrichtung: legt die Tabellen an und erstellt Firma + ersten Administrator.
// Nach erfolgreicher Einrichtung ist diese Seite gesperrt.

declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/schema.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Frame-Options: DENY');

$msg = '';
$ok = false;
try {
    $installed = sb_is_installed();
} catch (Throwable $e) {
    $installed = false;
    $msg = 'Datenbankverbindung fehlgeschlagen: ' . htmlspecialchars($e->getMessage());
}

if (!$installed && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && $msg === '') {
    $company = trim((string) ($_POST['company'] ?? ''));
    $name = trim((string) ($_POST['name'] ?? ''));
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    $username = strtolower(trim((string) ($_POST['username'] ?? ''))) ?: $email;
    $password = (string) ($_POST['password'] ?? '');
    if ($company === '' || !preg_match('/^[a-z0-9._@-]{3,80}$/', $username) || strlen($password) < 10
        || ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
        $msg = 'Bitte Firma, E-Mail-Adresse oder Benutzername (a–z, 0–9, . _ - @) und ein Passwort mit mindestens 10 Zeichen angeben.';
    } else {
        sb_install_schema();
        $db = sb_db();
        $db->beginTransaction();
        $db->prepare('INSERT INTO sb_tenants (name, created_at) VALUES (?, ?)')->execute([$company, time()]);
        $tenant = (int) $db->lastInsertId();
        // erster Benutzer = Administrator seiner Firma und Betreiber der Installation
        $db->prepare('INSERT INTO sb_users (tenant_id, username, email, name, pass_hash, role, active, operator, created_at) VALUES (?, ?, ?, ?, ?, \'admin\', 1, 1, ?)')
            ->execute([$tenant, $username, $email !== '' ? $email : null, $name !== '' ? $name : $username, password_hash($password, PASSWORD_DEFAULT), time()]);
        $db->commit();
        $ok = true;
    }
}
?>
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Schachtblick – Einrichtung</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;background:#eef2f7;color:#0e1726;margin:0;padding:24px}
  .card{max-width:480px;margin:6vh auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
  label{display:block;font-weight:600;font-size:.9rem;margin:14px 0 6px;color:#5b6b80}
  input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #dbe3ee;font:inherit}
  button{margin-top:20px;width:100%;padding:13px;border:0;border-radius:12px;background:#0a5bd3;color:#fff;font:600 16px system-ui;cursor:pointer}
  .msg{padding:10px 12px;border-radius:10px;background:#fde8e8;color:#b42318;margin-top:12px}
  .ok{background:#e1f5ea;color:#0f7a44}
</style>
</head>
<body>
<div class="card">
  <h1>Schachtblick einrichten</h1>
<?php if ($ok): ?>
  <p class="msg ok">Fertig! Die Datenbank ist eingerichtet und der Administrator angelegt.</p>
  <p>Öffne jetzt die App, gehe auf <b>Einstellungen → Team-Server</b> und melde dich an. Weitere Benutzer legst du dort unter „Benutzer verwalten“ an.</p>
  <p>Weitere Firmen (Kunden) legst du als Betreiber unter <b>Einstellungen → Betreiber-Bereich</b> an – jede Firma bekommt eine Einladung für ihren eigenen Administrator.</p>
  <p><a href="../">→ Zur App</a></p>
<?php elseif ($installed): ?>
  <p class="msg ok">Der Server ist bereits eingerichtet. Diese Seite ist gesperrt.</p>
  <p><a href="../">→ Zur App</a></p>
<?php else: ?>
  <p>Legt die Tabellen in der Datenbank an und erstellt den ersten Administrator. Diese erste Firma ist der <b>Betreiber</b> der Installation (z. B. MMSE Software Engineering) und kann später weitere Firmen anlegen.</p>
  <?php if ($msg): ?><p class="msg"><?= $msg ?></p><?php endif; ?>
  <form method="post" autocomplete="off">
    <label for="company">Firma</label><input id="company" name="company" required value="<?= htmlspecialchars($_POST['company'] ?? '') ?>">
    <label for="name">Dein Name</label><input id="name" name="name" value="<?= htmlspecialchars($_POST['name'] ?? '') ?>">
    <label for="email">E-Mail-Adresse (Anmeldung, „Passwort vergessen“)</label><input id="email" name="email" type="email" autocapitalize="off" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>">
    <label for="username">Benutzername (optional, sonst E-Mail)</label><input id="username" name="username" autocapitalize="off" value="<?= htmlspecialchars($_POST['username'] ?? '') ?>">
    <label for="password">Passwort (mind. 10 Zeichen)</label><input id="password" name="password" type="password" required minlength="10">
    <button type="submit">Einrichten</button>
  </form>
<?php endif; ?>
</div>
</body>
</html>
