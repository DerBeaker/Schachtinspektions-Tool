<?php
// Tarife und Verträge: Selbstregistrierung einer Firma (mit Testzeitraum), Nutzungsbedingungen (AGB)
// und Auftragsverarbeitungsvertrag (AVV) online annehmen, Schachtblick Pro buchen und kündigen,
// Plattform-Einstellungen des Betreibers (Freigabe, Testzeitraum, Preise).

declare(strict_types=1);

/**
 * Aktuelle Fassungen der Vertragstexte. Die Texte stehen in app/js/data/vertraege.js – dort dieselben
 * Versionen eintragen. Eine neue Version müssen alle Firmen-Administratoren erneut bestätigen.
 */
const SB_VERTRAG = ['agb' => '1.0', 'avv' => '1.0'];

const SB_PLATTFORM_STANDARD = [
    // Registrierung, Online-Verträge und Buchung erst nach rechtlicher Prüfung der Texte freigeben
    'freigegeben' => false,
    'testTage' => 30,
    'preise' => ['monat' => 25, 'jahr' => 250, 'inklusive' => 3, 'zusatzMonat' => 5, 'zusatzJahr' => 50],
    // Kleinunternehmer; nach Überschreiten der Grenze im Betreiber-Bereich auf „zzgl. gesetzlicher Umsatzsteuer“ ändern
    'steuer' => 'ohne Umsatzsteuer (Kleinunternehmer nach § 19 UStG)',
];

/** Plattform-Einstellungen (Standardwerte, überschrieben durch den Betreiber-Bereich). */
function sb_plattform(): array
{
    $p = SB_PLATTFORM_STANDARD;
    try {
        $v = sb_db()->query("SELECT v FROM sb_meta WHERE k = 'plattform'")->fetchColumn();
        $d = $v ? json_decode((string) $v, true) : null;
        if (is_array($d)) {
            $p = array_replace_recursive($p, $d);
        }
    } catch (Throwable) {
        // noch nicht eingerichtet
    }
    return $p;
}

/** Was die App ohne Anmeldung wissen darf (Preisseite, Registrierung). */
function sb_plattform_public(): array
{
    $p = sb_plattform();
    return ['freigegeben' => (bool) $p['freigegeben'], 'testTage' => (int) $p['testTage'], 'preise' => $p['preise'], 'steuer' => $p['steuer'], 'vertrag' => SB_VERTRAG];
}

function sb_preis(string $intervall, int $benutzer): float
{
    $p = sb_plattform()['preise'];
    $extra = max(0, $benutzer - (int) $p['inklusive']);
    return $intervall === 'jahr' ? (float) $p['jahr'] + $extra * (float) $p['zusatzJahr'] : (float) $p['monat'] + $extra * (float) $p['zusatzMonat'];
}

function sb_euro(float $v): string
{
    return number_format($v, 2, ',', '.') . ' €';
}

function sb_datum(int $ts): string
{
    return date('d.m.Y', $ts);
}

/** „JJJJ-MM-TT“ plus n Monate (Monatsende wird abgeschnitten: 31.01. + 1 → 28./29.02.). */
function sb_plus_monate(string $ymd, int $n): string
{
    [$y, $m, $d] = array_map('intval', explode('-', $ymd));
    $m += $n;
    $y += intdiv($m - 1, 12);
    $m = ($m - 1) % 12 + 1;
    $d = min($d, (int) date('t', mktime(0, 0, 0, $m, 1, $y)));
    return sprintf('%04d-%02d-%02d', $y, $m, $d);
}

/** E-Mail-Adressen des Betreibers (config „betreiber_email“, sonst die Betreiber-Konten). */
function sb_betreiber_emails(): array
{
    $c = sb_config()['betreiber_email'] ?? '';
    if ($c !== '') {
        return [$c];
    }
    $rows = sb_db()->query("SELECT email FROM sb_users WHERE operator = 1 AND email IS NOT NULL AND email <> ''")->fetchAll();
    return array_values(array_unique(array_map(fn($r) => $r['email'], $rows)));
}

function sb_an_betreiber(string $betreff, string $text): void
{
    foreach (sb_betreiber_emails() as $to) {
        sb_mail($to, $betreff, $text . "\n— Schachtblick (automatische Nachricht)\n");
    }
}

function sb_ist_betreiber_firma(int $tenant): bool
{
    $st = sb_db()->prepare('SELECT COUNT(*) FROM sb_users WHERE tenant_id = ? AND operator = 1');
    $st->execute([$tenant]);
    return (int) $st->fetchColumn() > 0;
}

/** Zuletzt angenommene Fassung je Vertrag: ['agb' => [...]|null, 'avv' => [...]|null]. */
function sb_vertraege_status(int $tenant): array
{
    $st = sb_db()->prepare('SELECT art, version, accepted_at, name, funktion FROM sb_vertraege WHERE tenant_id = ? ORDER BY accepted_at, id');
    $st->execute([$tenant]);
    $out = ['agb' => null, 'avv' => null];
    foreach ($st->fetchAll() as $r) {
        $out[$r['art']] = ['version' => $r['version'], 'am' => (int) $r['accepted_at'], 'name' => $r['name'], 'funktion' => $r['funktion']];
    }
    return $out;
}

function sb_abo_daten(?string $json): ?array
{
    $a = $json ? json_decode($json, true) : null;
    return is_array($a) ? $a : null;
}

/**
 * Lizenz der Firma: Tarif, Laufzeit, Benutzer, XML-Export erlaubt, Vertragsstand.
 * plan: 'test' (Testzeitraum), 'pro' (gebucht bzw. vom Betreiber freigeschaltet), 'betreiber'.
 */
function sb_lizenz(int $tenant): array
{
    $db = sb_db();
    $st = $db->prepare('SELECT max_users, valid_until, active, plan, abo FROM sb_tenants WHERE id = ?');
    $st->execute([$tenant]);
    $t = $st->fetch();
    $st = $db->prepare('SELECT COUNT(*) FROM sb_users WHERE tenant_id = ? AND active = 1');
    $st->execute([$tenant]);
    $aktiv = (int) $st->fetchColumn();
    $betreiber = sb_ist_betreiber_firma($tenant);
    $bis = $t['valid_until'] !== null ? (int) $t['valid_until'] : null;
    $expired = !$betreiber && $bis !== null && $bis < time();
    $vertraege = sb_vertraege_status($tenant);
    $abo = sb_abo_daten($t['abo']);
    return [
        'maxUsers' => $t['max_users'] !== null ? (int) $t['max_users'] : null,
        'validUntil' => sb_date($bis),
        'activeUsers' => $aktiv,
        'plan' => $betreiber ? 'betreiber' : ($t['plan'] ?: 'pro'),
        'expired' => $expired,
        'xml' => $betreiber || (!$expired && (int) $t['active'] === 1),
        'abo' => $abo ? array_intersect_key($abo, array_flip(['intervall', 'benutzer', 'seit', 'endet', 'preis'])) : null,
        'vertrag' => ['agb' => $vertraege['agb']['version'] ?? null, 'avv' => $vertraege['avv']['version'] ?? null],
        'vertragOffen' => !$betreiber && sb_plattform()['freigegeben']
            && (($vertraege['agb']['version'] ?? '') !== SB_VERTRAG['agb'] || ($vertraege['avv']['version'] ?? '') !== SB_VERTRAG['avv']),
    ];
}

function sb_vertrag_name(string $art): string
{
    return $art === 'avv' ? 'Auftragsverarbeitungsvertrag (AVV)' : 'Nutzungsbedingungen';
}

function sb_vertrag_speichern(int $tenant, string $firma, string $art, int $am, int $userId, string $name, string $funktion, string $email): void
{
    sb_db()->prepare('INSERT INTO sb_vertraege (tenant_id, firma, art, version, accepted_at, user_id, name, funktion, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$tenant, $firma, $art, SB_VERTRAG[$art], $am, $userId, $name, $funktion, $email]);
}

function sb_auftrag_speichern(int $tenant, string $firma, int $userId, string $art, array $daten): void
{
    sb_db()->prepare('INSERT INTO sb_auftraege (tenant_id, firma, user_id, art, created_at, daten) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$tenant, $firma, $userId, $art, time(), json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
}

function sb_vertragstext_links(): string
{
    return 'Nutzungsbedingungen: ' . sb_app_url() . "#/agb\nAuftragsverarbeitungsvertrag: " . sb_app_url() . "#/avv\n";
}

// ---------------------------------------------------------------- Registrierung

function sb_freigabe_pruefen(): array
{
    $p = sb_plattform();
    if (empty($p['freigegeben'])) {
        sb_fail(403, 'Die Online-Registrierung ist noch nicht freigeschaltet. Bitte wenden Sie sich an ' . SB_VENDOR . '.');
    }
    return $p;
}

/** Schritt 1: Daten prüfen, Bestätigungslink an die E-Mail-Adresse senden. */
function handle_register(): never
{
    $in = sb_input(20_000);
    $p = sb_freigabe_pruefen();
    if (trim((string) ($in['website'] ?? '')) !== '') {
        sb_json(['ok' => true]); // Feld nur für Bots sichtbar
    }
    $db = sb_db();
    $ip = substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 64);
    sb_purge_attempts();
    $st = $db->prepare('SELECT COUNT(*) FROM sb_login_attempts WHERE username = ? AND at > ?');
    $st->execute(['register:' . $ip, time() - 3600]);
    if ((int) $st->fetchColumn() >= 5) {
        sb_fail(429, 'Zu viele Registrierungen von diesem Anschluss – bitte in einer Stunde erneut versuchen.');
    }
    $firma = sb_cut(trim((string) ($in['firma'] ?? '')), 120);
    $anschrift = sb_cut(trim((string) ($in['anschrift'] ?? '')), 400);
    $name = sb_cut(trim((string) ($in['name'] ?? '')), 120);
    $funktion = sb_cut(trim((string) ($in['funktion'] ?? '')), 80);
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $password = (string) ($in['password'] ?? '');
    if (strlen($firma) < 2) {
        sb_fail(400, 'Bitte den Namen der Firma angeben.');
    }
    if (strlen($anschrift) < 8) {
        sb_fail(400, 'Bitte die Anschrift der Firma angeben (Vertragspartner im AVV).');
    }
    if ($name === '' || $funktion === '') {
        sb_fail(400, 'Bitte Ihren Namen und Ihre Funktion in der Firma angeben.');
    }
    if (!sb_valid_email($email)) {
        sb_fail(400, 'Bitte eine gültige E-Mail-Adresse angeben.');
    }
    if (strlen($password) < 8) {
        sb_fail(400, 'Das Passwort muss mindestens 8 Zeichen haben.');
    }
    if (empty($in['unternehmer'])) {
        sb_fail(400, 'Schachtblick Pro gibt es nur für Unternehmen und öffentliche Auftraggeber – bitte bestätigen.');
    }
    if (($in['agb'] ?? '') !== SB_VERTRAG['agb'] || ($in['avv'] ?? '') !== SB_VERTRAG['avv']) {
        sb_fail(400, 'Bitte die Nutzungsbedingungen und den Auftragsverarbeitungsvertrag in der aktuellen Fassung annehmen (Seite neu laden).');
    }
    $db->prepare('INSERT INTO sb_login_attempts (username, ip, at) VALUES (?, ?, ?)')->execute(['register:' . $ip, $ip, time()]);
    $st = $db->prepare('SELECT id FROM sb_users WHERE email = ? OR username = ?');
    $st->execute([$email, $email]);
    if ($st->fetch()) {
        // keine Auskunft, ob es die Adresse gibt – der Hinweis geht an die Adresse selbst
        sb_mail($email, 'Schachtblick – Registrierung', "Guten Tag,\n\nfür diese E-Mail-Adresse wurde ein neues Firmenkonto angefragt. Sie haben bereits einen Zugang zu Schachtblick – "
            . "bitte melden Sie sich an (Passwort vergessen? Unter Einstellungen → Anmelden).\n" . sb_app_url() . "#/settings\n\nWenn Sie das nicht waren, können Sie diese E-Mail ignorieren.\n\nSchachtblick – " . SB_VENDOR . "\n");
        sb_json(['ok' => true, 'email' => $email]);
    }
    $db->prepare("DELETE FROM sb_tokens WHERE kind = 'register' AND email = ?")->execute([$email]);
    $daten = [
        'firma' => $firma, 'anschrift' => $anschrift, 'funktion' => $funktion, 'pass_hash' => password_hash($password, PASSWORD_DEFAULT),
        'agb' => SB_VERTRAG['agb'], 'avv' => SB_VERTRAG['avv'], 'am' => time(),
    ];
    $token = sb_new_token('register', 0, ['email' => $email, 'name' => $name, 'data' => $daten], 48);
    $link = sb_app_url() . '#/registrierung/' . $token;
    $ok = sb_mail($email, 'Schachtblick – E-Mail-Adresse bestätigen', "Guten Tag $name,\n\n"
        . "bitte bestätigen Sie Ihre E-Mail-Adresse, damit das Firmenkonto für „{$firma}“ angelegt wird (Link 48 Stunden gültig):\n$link\n\n"
        . "Danach können Sie Schachtblick Pro {$p['testTage']} Tage kostenlos testen. Der Test endet automatisch – Kosten entstehen nur, wenn Sie Pro ausdrücklich buchen.\n\n"
        . "Wenn Sie sich nicht registriert haben, ignorieren Sie diese E-Mail einfach.\n\nSchachtblick – " . SB_VENDOR . "\n");
    if (!$ok) {
        $db->prepare("DELETE FROM sb_tokens WHERE kind = 'register' AND email = ?")->execute([$email]);
        sb_fail(503, 'Die Bestätigungs-E-Mail konnte nicht verschickt werden. Bitte später erneut versuchen oder ' . SB_VENDOR . ' kontaktieren.');
    }
    sb_json(['ok' => true, 'email' => $email]);
}

/** Schritt 2: Link aus der E-Mail – Firma (Testzeitraum) und Administrator anlegen, Verträge speichern. */
function handle_register_confirm(): never
{
    $in = sb_input(2000);
    $token = (string) ($in['token'] ?? '');
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
        sb_fail(400, 'Der Link ist ungültig.');
    }
    $db = sb_db();
    $st = $db->prepare("SELECT * FROM sb_tokens WHERE token_hash = ? AND kind = 'register'");
    $st->execute([hash('sha256', $token)]);
    $row = $st->fetch();
    if (!$row || $row['used_at'] !== null || (int) $row['expires_at'] < time()) {
        sb_fail(410, 'Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet. Wurde das Konto schon angelegt, melden Sie sich einfach an – sonst bitte erneut registrieren.');
    }
    $d = json_decode((string) $row['data'], true) ?: [];
    $p = sb_plattform();
    $tage = max(1, (int) $p['testTage']);
    $bis = mktime(0, 0, 0, (int) date('n'), (int) date('j') + $tage + 1, (int) date('Y'));
    $email = $row['email'];
    $name = $row['name'] ?: $email;
    $db->beginTransaction();
    try {
        $st = $db->prepare('SELECT id FROM sb_users WHERE email = ? OR username = ?');
        $st->execute([$email, $email]);
        if ($st->fetch()) {
            sb_fail(409, 'Für diese E-Mail-Adresse gibt es bereits einen Zugang – bitte anmelden.');
        }
        $firmendaten = json_encode(['anschrift' => $d['anschrift'] ?? '', 'kontakt' => $email, 'logo' => ''], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $db->prepare("INSERT INTO sb_tenants (name, created_at, active, max_users, valid_until, contact, firma, firma_updated, plan) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'test')")
            ->execute([$d['firma'], time(), (int) $p['preise']['inklusive'], $bis, sb_cut("$name ({$d['funktion']}), $email", 190), $firmendaten, sb_now()]);
        $tenant = (int) $db->lastInsertId();
        $db->prepare("INSERT INTO sb_users (tenant_id, username, email, name, pass_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 'admin', 1, ?)")
            ->execute([$tenant, $email, $email, $name, $d['pass_hash'], time()]);
        $userId = (int) $db->lastInsertId();
        foreach (['agb', 'avv'] as $art) {
            sb_vertrag_speichern($tenant, $d['firma'], $art, (int) $d['am'], $userId, $name, (string) $d['funktion'], $email);
        }
        sb_auftrag_speichern($tenant, $d['firma'], $userId, 'registrierung', ['testBis' => sb_date($bis), 'anschrift' => $d['anschrift'] ?? '']);
        $db->prepare('UPDATE sb_tokens SET used_at = ?, data = NULL WHERE id = ?')->execute([time(), $row['id']]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    $am = sb_datum((int) $d['am']) . ', ' . date('H:i', (int) $d['am']) . ' Uhr';
    sb_mail($email, 'Willkommen bei Schachtblick – Ihr Firmenkonto', "Guten Tag $name,\n\n"
        . "das Firmenkonto für „{$d['firma']}“ ist eingerichtet. Sie sind Administrator und melden sich mit $email an.\n\n"
        . 'Schachtblick Pro ist bis einschließlich ' . sb_datum($bis - 1) . " kostenlos freigeschaltet. Danach bleiben Ihre Daten lesbar; zum Weiterarbeiten buchen Sie Pro unter Einstellungen → Abo & Verträge.\n\n"
        . "Am $am haben Sie für die Firma angenommen:\n"
        . '- Nutzungsbedingungen, Fassung ' . SB_VERTRAG['agb'] . "\n"
        . '- Auftragsverarbeitungsvertrag nach Art. 28 DSGVO, Fassung ' . SB_VERTRAG['avv'] . "\n"
        . 'Angenommen von: ' . $name . ' (' . $d['funktion'] . ")\n\n"
        . sb_vertragstext_links() . "Den AVV können Sie in der App unter Einstellungen → Abo & Verträge als PDF für Ihre Unterlagen speichern.\n\n"
        . 'Schachtblick – ' . SB_VENDOR . "\n");
    sb_an_betreiber("Schachtblick: neue Firma „{$d['firma']}“", "Neue Registrierung (Testzeitraum bis " . sb_datum($bis - 1) . "):\n\n"
        . "Firma: {$d['firma']}\nAnschrift: " . str_replace("\n", ', ', (string) ($d['anschrift'] ?? '')) . "\nAdministrator: $name ({$d['funktion']}), $email\n"
        . 'AGB ' . SB_VERTRAG['agb'] . ' und AVV ' . SB_VERTRAG['avv'] . " angenommen am $am.\n");
    $st = $db->prepare('SELECT u.*, t.name AS tenant FROM sb_users u JOIN sb_tenants t ON t.id = u.tenant_id WHERE u.id = ?');
    $st->execute([$userId]);
    sb_json(sb_start_session($st->fetch()));
}

// ---------------------------------------------------------------- Abo & Verträge (Firmen-Administrator)

function sb_konto_daten(array $u): array
{
    $db = sb_db();
    $tid = $u['tenant_id'];
    $st = $db->prepare('SELECT art, version, accepted_at, name, funktion, email FROM sb_vertraege WHERE tenant_id = ? ORDER BY accepted_at DESC, id DESC');
    $st->execute([$tid]);
    $vertraege = array_map(fn($r) => [
        'art' => $r['art'], 'version' => $r['version'], 'am' => (int) $r['accepted_at'], 'name' => $r['name'], 'funktion' => $r['funktion'], 'email' => $r['email'],
    ], $st->fetchAll());
    $st = $db->prepare('SELECT art, created_at, daten FROM sb_auftraege WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 50');
    $st->execute([$tid]);
    $auftraege = array_map(fn($r) => ['art' => $r['art'], 'am' => (int) $r['created_at'], 'daten' => json_decode((string) $r['daten'], true)], $st->fetchAll());
    $st = $db->prepare('SELECT abo FROM sb_tenants WHERE id = ?');
    $st->execute([$tid]);
    $abo = sb_abo_daten($st->fetchColumn() ?: null);
    return [
        'lizenz' => sb_lizenz($tid), 'firma' => sb_firma($tid), 'plattform' => sb_plattform_public(),
        'vertraege' => $vertraege, 'auftraege' => $auftraege, 'abo' => $abo,
    ];
}

function handle_konto(array $u): never
{
    sb_require_admin($u);
    sb_json(sb_konto_daten($u));
}

/** Vertrag (AGB oder AVV) für die Firma annehmen – z. B. für Firmen, die der Betreiber angelegt hat. */
function handle_vertrag(array $u): never
{
    sb_require_admin($u);
    sb_freigabe_pruefen();
    if (sb_ist_betreiber_firma($u['tenant_id'])) {
        sb_fail(400, 'Für die Firma des Betreibers ist kein Vertrag nötig.');
    }
    $in = sb_input(5000);
    $arten = array_values(array_intersect(array_keys(SB_VERTRAG), (array) ($in['arten'] ?? [])));
    if (!$arten) {
        sb_fail(400, 'Bitte angeben, welcher Vertrag angenommen wird.');
    }
    foreach ($arten as $art) {
        if (($in['versionen'][$art] ?? '') !== SB_VERTRAG[$art]) {
            sb_fail(409, 'Die Vertragsfassung hat sich geändert – bitte die Seite neu laden.');
        }
    }
    $name = sb_cut(trim((string) ($in['name'] ?? '')), 120);
    $funktion = sb_cut(trim((string) ($in['funktion'] ?? '')), 80);
    if ($name === '' || $funktion === '') {
        sb_fail(400, 'Bitte Ihren Namen und Ihre Funktion in der Firma angeben.');
    }
    $am = time();
    $email = (string) ($u['email'] ?? '');
    foreach ($arten as $art) {
        sb_vertrag_speichern($u['tenant_id'], $u['tenant'], $art, $am, $u['id'], $name, $funktion, $email);
    }
    $liste = implode("\n", array_map(fn($a) => '- ' . sb_vertrag_name($a) . ', Fassung ' . SB_VERTRAG[$a], $arten));
    $text = "Am " . sb_datum($am) . ', ' . date('H:i', $am) . " Uhr hat $name ($funktion) für „{$u['tenant']}“ angenommen:\n$liste\n\n" . sb_vertragstext_links();
    if (sb_valid_email($email)) {
        sb_mail($email, 'Schachtblick – Bestätigung Ihrer Vertragsannahme', "Guten Tag $name,\n\n$text\nDen AVV können Sie in der App unter Einstellungen → Abo & Verträge als PDF speichern.\n\nSchachtblick – " . SB_VENDOR . "\n");
    }
    sb_an_betreiber("Schachtblick: Vertrag angenommen – {$u['tenant']}", $text);
    sb_json(sb_konto_daten($u));
}

/** Schachtblick Pro buchen oder Benutzerzahl/Abrechnung ändern (Zahlung per Rechnung). */
function handle_konto_buchen(array $u): never
{
    sb_require_admin($u);
    $p = sb_freigabe_pruefen();
    $tid = $u['tenant_id'];
    if (sb_ist_betreiber_firma($tid)) {
        sb_fail(400, 'Die Firma des Betreibers braucht kein Abo.');
    }
    if (sb_lizenz($tid)['vertragOffen']) {
        sb_fail(409, 'Bitte zuerst die Nutzungsbedingungen und den Auftragsverarbeitungsvertrag annehmen.');
    }
    $in = sb_input(10_000);
    $intervall = ($in['intervall'] ?? '') === 'jahr' ? 'jahr' : 'monat';
    $benutzer = max(1, min(500, (int) ($in['benutzer'] ?? 0)));
    $r = is_array($in['rechnung'] ?? null) ? $in['rechnung'] : [];
    $rechnung = [
        'firma' => sb_cut(trim((string) ($r['firma'] ?? '')), 120), 'anschrift' => sb_cut(trim((string) ($r['anschrift'] ?? '')), 400),
        'email' => strtolower(trim((string) ($r['email'] ?? ''))), 'ustid' => sb_cut(trim((string) ($r['ustid'] ?? '')), 30),
        'bestellnummer' => sb_cut(trim((string) ($r['bestellnummer'] ?? '')), 60),
    ];
    if ($rechnung['firma'] === '' || strlen($rechnung['anschrift']) < 8) {
        sb_fail(400, 'Bitte Firma und Anschrift für die Rechnung angeben.');
    }
    if (!sb_valid_email($rechnung['email'])) {
        sb_fail(400, 'Bitte eine gültige E-Mail-Adresse für die Rechnung angeben.');
    }
    if (empty($in['bestellt'])) {
        sb_fail(400, 'Bitte die kostenpflichtige Bestellung bestätigen.');
    }
    $db = sb_db();
    $st = $db->prepare('SELECT plan, valid_until, abo FROM sb_tenants WHERE id = ?');
    $st->execute([$tid]);
    $t = $st->fetch();
    $lizenz = sb_lizenz($tid);
    if ($benutzer < $lizenz['activeUsers']) {
        sb_fail(400, "Es sind bereits {$lizenz['activeUsers']} Benutzer aktiv – bitte mindestens so viele buchen oder vorher Benutzer sperren.");
    }
    $alt = sb_abo_daten($t['abo']);
    $heute = date('Y-m-d');
    // Im Testzeitraum beginnt die Abrechnung erst nach dessen Ende
    $testBis = $t['plan'] === 'test' && $t['valid_until'] !== null && (int) $t['valid_until'] > time() ? date('Y-m-d', (int) $t['valid_until']) : null;
    $aenderung = $alt && empty($alt['endet']);
    // erneute Buchung nach Kündigung, bevor die Abrechnung begonnen hat: Beginn bleibt
    $seit = $aenderung ? $alt['seit'] : ($testBis ?? ($alt && ($alt['seit'] ?? '') > $heute ? $alt['seit'] : $heute));
    $preis = sb_preis($intervall, $benutzer);
    $abo = [
        'intervall' => $intervall, 'benutzer' => $benutzer, 'preis' => $preis, 'seit' => $seit, 'endet' => null,
        'gebucht' => $aenderung ? ($alt['gebucht'] ?? $heute) : $heute, 'geaendert' => $aenderung ? $heute : null, 'rechnung' => $rechnung,
    ];
    $db->prepare("UPDATE sb_tenants SET plan = 'pro', valid_until = NULL, max_users = ?, abo = ? WHERE id = ?")
        ->execute([$benutzer, json_encode($abo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $tid]);
    $art = $aenderung ? 'aenderung' : 'buchung';
    sb_auftrag_speichern($tid, $u['tenant'], $u['id'], $art, $abo + ['von' => "{$u['name']} <{$u['email']}>"]);
    $zeitraum = $intervall === 'jahr' ? 'Jahr' : 'Monat';
    $details = "Tarif: Schachtblick Pro, Abrechnung je $zeitraum\nBenutzer: $benutzer\nPreis: " . sb_euro($preis) . " je $zeitraum {$p['steuer']}\n"
        . 'Abrechnung ab: ' . sb_datum(strtotime($seit)) . "\n"
        . "Rechnung an: {$rechnung['firma']}, " . str_replace("\n", ', ', $rechnung['anschrift']) . "\nRechnung per E-Mail an: {$rechnung['email']}\n"
        . ($rechnung['ustid'] !== '' ? "USt-IdNr.: {$rechnung['ustid']}\n" : '') . ($rechnung['bestellnummer'] !== '' ? "Ihre Bestellnummer: {$rechnung['bestellnummer']}\n" : '');
    $kuendigung = $intervall === 'jahr' ? 'zum Ende des jeweiligen Vertragsjahres' : 'jederzeit zum Ende des laufenden Abrechnungsmonats';
    $an = array_unique(array_filter([(string) ($u['email'] ?? ''), $rechnung['email']], 'sb_valid_email'));
    foreach ($an as $to) {
        sb_mail($to, $aenderung ? 'Schachtblick Pro – Änderung bestätigt' : 'Schachtblick Pro – Bestellbestätigung', "Guten Tag,\n\n"
            . ($aenderung ? "die Änderung Ihres Abos für „{$u['tenant']}“ ist eingegangen und sofort wirksam.\n\n" : "vielen Dank für Ihre Bestellung. Schachtblick Pro ist für „{$u['tenant']}“ freigeschaltet.\n\n")
            . $details . "\nDie Rechnung erhalten Sie per E-Mail; sie ist jeweils im Voraus für den Abrechnungszeitraum fällig (zahlbar innerhalb von 14 Tagen). "
            . "Kündigen können Sie $kuendigung – in der App unter Einstellungen → Abo & Verträge oder per E-Mail.\n\n"
            . "Bestellt von: {$u['name']}\n" . sb_vertragstext_links() . "\nSchachtblick – " . SB_VENDOR . "\n");
    }
    sb_an_betreiber("Schachtblick: " . ($aenderung ? 'Abo geändert' : 'neue Buchung') . " – {$u['tenant']}", "Bitte Rechnung stellen bzw. anpassen:\n\nFirma: {$u['tenant']} (Nr. $tid)\n$details\nBestellt von: {$u['name']} <{$u['email']}>\n");
    sb_json(sb_konto_daten($u));
}

/** Abo kündigen: endet zum Ende des laufenden Abrechnungszeitraums (im Testzeitraum: mit dessen Ende). */
function handle_konto_kuendigen(array $u): never
{
    sb_require_admin($u);
    $tid = $u['tenant_id'];
    $db = sb_db();
    $st = $db->prepare('SELECT abo FROM sb_tenants WHERE id = ?');
    $st->execute([$tid]);
    $abo = sb_abo_daten($st->fetchColumn() ?: null);
    if (!$abo || !empty($abo['endet'])) {
        sb_fail(400, 'Es gibt kein laufendes Abo, das gekündigt werden kann.');
    }
    $heute = date('Y-m-d');
    $monate = $abo['intervall'] === 'jahr' ? 12 : 1;
    $grenze = $abo['seit'];
    for ($i = 1; $grenze <= $heute && $i < 1200; $i++) {
        $grenze = sb_plus_monate($abo['seit'], $i * $monate);
    }
    // Lizenz gilt bis einschließlich des Tages vor $grenze
    $bis = strtotime($grenze . ' 00:00:00');
    $abo['endet'] = date('Y-m-d', $bis - 1);
    $abo['gekuendigt'] = $heute;
    $db->prepare('UPDATE sb_tenants SET valid_until = ?, abo = ? WHERE id = ?')
        ->execute([$bis, json_encode($abo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $tid]);
    sb_auftrag_speichern($tid, $u['tenant'], $u['id'], 'kuendigung', ['endet' => $abo['endet'], 'von' => "{$u['name']} <{$u['email']}>"]);
    $ende = sb_datum($bis - 1);
    $text = "die Kündigung von Schachtblick Pro für „{$u['tenant']}“ ist eingegangen. Pro bleibt bis einschließlich $ende nutzbar.\n\n"
        . "Bis dahin können Sie alle Daten exportieren. Danach bleibt das Firmenkonto 30 Tage lesbar; anschließend werden die Daten gelöscht, "
        . "sofern Sie nicht vorher erneut buchen.\n\nGekündigt von: {$u['name']} am " . sb_datum(time()) . "\n";
    $an = array_unique(array_filter([(string) ($u['email'] ?? ''), (string) ($abo['rechnung']['email'] ?? '')], 'sb_valid_email'));
    foreach ($an as $to) {
        sb_mail($to, 'Schachtblick Pro – Kündigungsbestätigung', "Guten Tag,\n\n$text\nSchachtblick – " . SB_VENDOR . "\n");
    }
    sb_an_betreiber("Schachtblick: Kündigung – {$u['tenant']}", "Firma: {$u['tenant']} (Nr. $tid)\nEndet: $ende\nGekündigt von: {$u['name']} <{$u['email']}>\n");
    sb_json(sb_konto_daten($u));
}

// ---------------------------------------------------------------- Betreiber

function handle_op_plattform(array $u): never
{
    sb_require_operator($u);
    $in = sb_input(10_000);
    $alt = sb_plattform();
    $zahl = fn($v, $std) => is_numeric($v) && (float) $v >= 0 ? round((float) $v, 2) : $std;
    $neu = [
        'freigegeben' => !empty($in['freigegeben']),
        'testTage' => max(1, min(365, (int) ($in['testTage'] ?? $alt['testTage']))),
        'preise' => [
            'monat' => $zahl($in['preise']['monat'] ?? null, $alt['preise']['monat']),
            'jahr' => $zahl($in['preise']['jahr'] ?? null, $alt['preise']['jahr']),
            'inklusive' => max(1, (int) ($in['preise']['inklusive'] ?? $alt['preise']['inklusive'])),
            'zusatzMonat' => $zahl($in['preise']['zusatzMonat'] ?? null, $alt['preise']['zusatzMonat']),
            'zusatzJahr' => $zahl($in['preise']['zusatzJahr'] ?? null, $alt['preise']['zusatzJahr']),
        ],
        'steuer' => sb_cut(trim((string) ($in['steuer'] ?? $alt['steuer'])), 120) ?: SB_PLATTFORM_STANDARD['steuer'],
    ];
    $sql = sb_driver() === 'sqlite' ? 'INSERT OR REPLACE INTO sb_meta (k, v) VALUES (?, ?)' : 'REPLACE INTO sb_meta (k, v) VALUES (?, ?)';
    sb_db()->prepare($sql)->execute(['plattform', json_encode($neu, JSON_UNESCAPED_UNICODE)]);
    sb_json(['ok' => true, 'plattform' => sb_plattform_public()]);
}

/** Aufträge aller Firmen (Buchungen, Änderungen, Kündigungen, Registrierungen) für die Rechnungsstellung. */
function handle_op_auftraege(array $u): never
{
    sb_require_operator($u);
    $rows = sb_db()->query('SELECT a.id, a.tenant_id, a.firma, a.art, a.created_at, a.daten, a.erledigt_at, t.name AS aktuell
        FROM sb_auftraege a LEFT JOIN sb_tenants t ON t.id = a.tenant_id ORDER BY a.created_at DESC, a.id DESC LIMIT 300')->fetchAll();
    sb_json(['auftraege' => array_map(fn($r) => [
        'id' => (int) $r['id'], 'tenant' => (int) $r['tenant_id'], 'firma' => $r['aktuell'] ?? $r['firma'], 'geloescht' => $r['aktuell'] === null,
        'art' => $r['art'], 'am' => (int) $r['created_at'], 'daten' => json_decode((string) $r['daten'], true),
        'erledigt' => $r['erledigt_at'] !== null ? (int) $r['erledigt_at'] : null,
    ], $rows), 'plattform' => sb_plattform_public()]);
}

function handle_op_auftrag(array $u): never
{
    sb_require_operator($u);
    $in = sb_input(1000);
    sb_db()->prepare('UPDATE sb_auftraege SET erledigt_at = ? WHERE id = ?')->execute([!empty($in['erledigt']) ? time() : null, (int) ($in['id'] ?? 0)]);
    sb_json(['ok' => true]);
}
