// Tests für den PHP-Server (SQLite) inkl. KI-Route gegen einen lokalen Mock der Claude-API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hasPhp = (() => { try { execFileSync('php', ['-m'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const hasSqlite = hasPhp && execFileSync('php', ['-m']).toString().includes('pdo_sqlite');
const hasVendor = existsSync(join(root, 'app/api/vendor/autoload.php'));
const skip = !hasSqlite ? 'PHP mit pdo_sqlite nicht vorhanden' : false;

let php, mock, base, cfgPath, mailLog, mockReq = null;
// freie Ports vom Betriebssystem holen (keine Kollision mit anderen Testservern)
const freePort = () => new Promise((res) => { const s = http.createServer().listen(0, () => { const { port } = s.address(); s.close(() => res(port)); }); });
let PORT, MOCK_PORT;

before(async () => {
  if (skip) return;
  PORT = await freePort();
  MOCK_PORT = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'sbapi-'));
  const cfg = join(dir, 'config.php');
  cfgPath = cfg;
  mailLog = join(dir, 'mail.log');
  // Standard SQLite; mit SB_TEST_MYSQL="mysql:host=…;dbname=…|user|pass" gegen MySQL/MariaDB (leere Datenbank)
  const [dsn, dbUser, dbPass] = process.env.SB_TEST_MYSQL ? process.env.SB_TEST_MYSQL.split('|') : [`sqlite:${dir}/test.sqlite`];
  writeFileSync(cfg, `<?php return [
    'db_dsn' => ${JSON.stringify(dsn)}, 'db_user' => ${dbUser ? JSON.stringify(dbUser) : 'null'}, 'db_pass' => ${dbPass ? JSON.stringify(dbPass) : 'null'},
    'mail_log' => '${mailLog}', 'app_url' => 'https://app.example.test/schacht/',
    'photo_dir' => '${dir}/photos', 'max_photo_mb' => 2, 'session_days' => 30, 'cors_origins' => [],
    'anthropic_api_key' => 'test-key', 'ai_base_url' => 'http://127.0.0.1:${MOCK_PORT}', 'ai_model' => 'claude-opus-5-5', 'ai_effort' => 'high',
  ];`);
  mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      mockReq = { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') };
      const answer = {
        summary: 'Schacht mit Auslauf bei 12 Uhr, Riss bei 3 Uhr.', quality: 'gut',
        connections: [{ clock: 12, direction: 'out', dnEstimate: 300, confidence: 0.9 }, { clock: 9, direction: 'in', dnEstimate: 150, confidence: 0.7 }],
        findings: [
          { code: 'DAB', c1: 'B', c2: 'A', q1: 1, clockFrom: 3, clockTo: 0, bereich: 'C', depthFromTop: 0.9, confidence: 0.8, reason: 'Linie in der Wand', comment: '' },
          { code: 'XYZ', c1: 'A', c2: '', q1: 0, clockFrom: 1, clockTo: 0, bereich: 'C', depthFromTop: -1, confidence: 0.9, reason: 'ungültig', comment: '' },
        ],
      };
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_test' });
      res.end(JSON.stringify({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 },
      }));
    });
  }).listen(MOCK_PORT);
  php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', join(root, 'app')], { env: { ...process.env, SB_CONFIG: cfg }, stdio: 'ignore' });
  base = `http://127.0.0.1:${PORT}/api/`;
  // warten, bis der eigene PHP-Server antwortet (bis 15 s)
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(base + '?r=ping'); if (r.ok && (await r.json()).ok) break; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => { php?.kill(); mock?.close(); });

const api = async (route, { method = 'GET', body, token, raw, query = '' } = {}) => {
  const headers = {};
  if (token) headers['X-Auth-Token'] = token;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}?r=${route}${query}`, { method, headers, body: raw ? body : body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};

test('Server: Einrichtung, Login, Sync, Fotos, Mandantentrennung', { skip }, async () => {
  let r = await api('ping');
  assert.equal(r.status, 200);
  assert.equal(r.data.installed, false);

  // Einrichtung über setup.php
  const form = new URLSearchParams({ company: 'Kanal Test GmbH', name: 'Admin', username: 'admin', password: 'geheim-12345' });
  const setup = await fetch(base + 'setup.php', { method: 'POST', body: form });
  assert.match(await setup.text(), /Fertig!/);
  const again = await fetch(base + 'setup.php', { method: 'POST', body: form });
  assert.match(await again.text(), /bereits eingerichtet/);

  r = await api('login', { method: 'POST', body: { username: 'admin', password: 'falsch' } });
  assert.equal(r.status, 403);
  r = await api('login', { method: 'POST', body: { username: 'admin', password: 'geheim-12345' } });
  assert.equal(r.status, 200);
  const token = r.data.token;
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.features.ai, hasVendor);

  r = await api('sync', { method: 'POST', body: { since: 0, changes: [] } });
  assert.equal(r.status, 401);

  // Benutzer anlegen
  r = await api('users', { method: 'POST', token, body: { username: 'erika', name: 'Erika Muster', password: 'sicher-1234', role: 'inspector' } });
  assert.equal(r.status, 200);
  r = await api('login', { method: 'POST', body: { username: 'erika', password: 'sicher-1234' } });
  const token2 = r.data.token;
  r = await api('users', { token: token2 });
  assert.equal(r.status, 403);

  // Sync: Gerät A schreibt, Gerät B liest
  const pid = '11111111-1111-4111-8111-111111111111';
  const iid = '22222222-2222-4222-8222-222222222222';
  r = await api('sync', { method: 'POST', token, body: { since: 0, changes: [
    { type: 'projects', id: pid, projectId: pid, updatedAt: 1000, data: { id: pid, name: 'Projekt A' } },
    { type: 'inspections', id: iid, projectId: pid, updatedAt: 1000, data: { id: iid, projectId: pid, findings: [{ code: 'DAB' }] } },
    { type: 'evil', id: '../../etc', updatedAt: 1, data: {} },
  ] } });
  assert.equal(r.status, 200);
  assert.equal(r.data.accepted, 2);
  const rev1 = r.data.rev;
  r = await api('sync', { method: 'POST', token: token2, body: { since: 0, changes: [] } });
  assert.equal(r.data.changes.length, 2);
  assert.equal(r.data.changes.find((c) => c.type === 'inspections').data.findings[0].code, 'DAB');

  // Älterer Stand überschreibt neueren nicht
  r = await api('sync', { method: 'POST', token: token2, body: { since: rev1, changes: [
    { type: 'projects', id: pid, projectId: pid, updatedAt: 500, data: { id: pid, name: 'veraltet' } },
  ] } });
  assert.equal(r.data.skipped, 1);
  r = await api('sync', { method: 'POST', token: token2, body: { since: 0, changes: [] } });
  assert.equal(r.data.changes.find((c) => c.type === 'projects').data.name, 'Projekt A');

  // Fotos
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 7), Buffer.from([0xff, 0xd9])]);
  const phid = '33333333-3333-4333-8333-333333333333';
  r = await api('photo', { method: 'PUT', token, raw: true, body: Buffer.from('kein jpeg'), query: `&id=${phid}` });
  assert.equal(r.status, 415);
  r = await api('photo', { method: 'PUT', token, raw: true, body: jpeg, query: `&id=${phid}&inspection=${iid}&project=${pid}` });
  assert.equal(r.status, 200);
  r = await api('photo', { token: token2, query: `&id=${phid}` });
  assert.equal(r.status, 200);
  assert.ok(Buffer.compare(r.data, jpeg) === 0);
  r = await api('photo', { token, query: '&id=../../config' });
  assert.equal(r.status, 400);
  r = await api('sync', { method: 'POST', token: token2, body: { since: rev1, changes: [] } });
  assert.ok(r.data.photos.some((p) => p.id === phid));

  // Fremder Mandant sieht nichts (zweite Firma direkt in der Datenbank anlegen)
  execFileSync('php', ['-r', `
    $c = require getenv('SB_CONFIG'); $db = new PDO($c['db_dsn'], $c['db_user'], $c['db_pass']);
    $db->exec("INSERT INTO sb_tenants (name, created_at) VALUES ('Andere Firma', 0)");
    $t = $db->lastInsertId();
    $st = $db->prepare('INSERT INTO sb_users (tenant_id, username, name, pass_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, 1, 0)');
    $st->execute([$t, 'fremd', 'Fremd', password_hash('fremd-12345', PASSWORD_DEFAULT), 'admin']);
  `], { env: { ...process.env, SB_CONFIG: cfgPath } });
  r = await api('login', { method: 'POST', body: { username: 'fremd', password: 'fremd-12345' } });
  const token3 = r.data.token;
  r = await api('sync', { method: 'POST', token: token3, body: { since: 0, changes: [] } });
  assert.equal(r.data.changes.length, 0);
  assert.equal(r.data.photos.length, 0);
  r = await api('photo', { token: token3, query: `&id=${phid}` });
  assert.equal(r.status, 404);
  r = await api('users', { token: token3 });
  assert.deepEqual(r.data.users.map((u) => u.username), ['fremd']);
});

test('Mehrere Firmen: Betreiber, Einladung, Lizenz, Firmendaten, Passwort vergessen', { skip }, async () => {
  const login = async (username, password) => (await api('login', { method: 'POST', body: { username, password } }));
  const lastLink = (kind) => {
    const all = readFileSync(mailLog, 'utf8').match(new RegExp(`#/${kind}/([a-f0-9]{48})`, 'g')) || [];
    return all.length ? all[all.length - 1].split('/').pop() : null;
  };
  // Der Einrichter ist Betreiber
  let r = await login('admin', 'geheim-12345');
  const op = r.data.token;
  assert.equal(r.data.user.operator, true);
  assert.equal(r.data.firma.name, 'Kanal Test GmbH');
  r = await login('erika', 'sicher-1234');
  const inspector = r.data.token;
  assert.equal(r.data.user.operator, false);
  assert.equal((await api('op-tenants', { token: inspector })).status, 403);

  // Neue Firma mit Testlizenz (2 Benutzer) und Einladung für den Administrator
  const morgen = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  r = await api('op-tenant', { method: 'POST', token: op, body: { name: 'Rohr & Kanal KG', maxUsers: 2, validUntil: morgen, adminEmail: 'Chef@Rohr-Kanal.de', adminName: 'Chef' } });
  assert.equal(r.status, 200);
  const firmaId = r.data.id;
  assert.equal(r.data.invite.mailed, true);
  assert.match(r.data.invite.link, /^https:\/\/app\.example\.test\/schacht\/#\/einladung\/[a-f0-9]{48}$/);
  const inviteToken = lastLink('einladung');
  assert.equal(r.data.invite.link.endsWith(inviteToken), true);
  r = await api('invite-info', { method: 'POST', body: { token: inviteToken } });
  assert.deepEqual([r.data.firma, r.data.email, r.data.role], ['Rohr & Kanal KG', 'chef@rohr-kanal.de', 'admin']);
  r = await api('invite-accept', { method: 'POST', body: { token: inviteToken, name: 'Karl Chef', password: 'kurz' } });
  assert.equal(r.status, 400);
  r = await api('invite-accept', { method: 'POST', body: { token: inviteToken, name: 'Karl Chef', password: 'chef-pass-1' } });
  assert.equal(r.status, 200);
  const chef = r.data.token;
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.lizenz.maxUsers, 2);
  assert.equal((await api('invite-accept', { method: 'POST', body: { token: inviteToken, password: 'chef-pass-1' } })).status, 410);
  // Anmeldung mit E-Mail
  assert.equal((await login('CHEF@rohr-kanal.de', 'chef-pass-1')).status, 200);

  // Firmendaten zentral: Admin speichert, alle Geräte der Firma bekommen sie
  const logo = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  r = await api('firma', { method: 'POST', token: chef, body: { name: 'Rohr & Kanal KG', anschrift: 'Hauptstr. 1\n12345 Ort', kontakt: 'Tel. 1', logo } });
  assert.equal(r.status, 200);
  assert.equal(r.data.firma.logo, logo);
  assert.equal((await api('firma', { method: 'POST', token: chef, body: { logo: 'javascript:alert(1)' } })).status, 400);
  r = await api('sync', { method: 'POST', token: chef, body: { since: 0, changes: [] } });
  assert.ok(r.data.firmaUpdated > 0);
  assert.equal(r.data.changes.length, 0); // Daten der anderen Firmen bleiben unsichtbar

  // Benutzergrenze der Lizenz
  r = await api('invite', { method: 'POST', token: chef, body: { email: 'mia@rohr-kanal.de', role: 'inspector' } });
  assert.equal(r.status, 200);
  const miaToken = lastLink('einladung');
  r = await api('invites', { token: chef });
  assert.equal(r.data.invites.length, 1);
  assert.equal((await api('invite-accept', { method: 'POST', body: { token: miaToken, name: 'Mia', password: 'mia-pass-12' } })).status, 200);
  r = await api('users', { method: 'POST', token: chef, body: { username: 'dritter', name: 'Dritter', password: 'dritter-123' } });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /höchstens 2/);
  r = await api('invite', { method: 'POST', token: chef, body: { email: 'vierter@rohr-kanal.de' } });
  assert.equal(r.status, 409);

  // Passwort vergessen (keine Auskunft über unbekannte Adressen)
  assert.equal((await api('reset-request', { method: 'POST', body: { email: 'gibts@nicht.de' } })).status, 200);
  r = await api('reset-request', { method: 'POST', body: { email: 'mia@rohr-kanal.de' } });
  assert.equal(r.status, 200);
  const resetToken = lastLink('passwort');
  assert.ok(resetToken);
  r = await api('reset', { method: 'POST', body: { token: resetToken, password: 'neues-pass-9' } });
  assert.equal(r.status, 200);
  assert.equal((await login('mia@rohr-kanal.de', 'mia-pass-12')).status, 403);
  assert.equal((await login('mia@rohr-kanal.de', 'neues-pass-9')).status, 200);
  assert.equal((await api('reset', { method: 'POST', body: { token: resetToken, password: 'nochmal-123' } })).status, 410);

  // Übersicht für den Betreiber
  r = await api('op-tenants', { token: op });
  const t = r.data.tenants.find((x) => x.id === firmaId);
  assert.deepEqual([t.activeUsers, t.maxUsers, t.validUntil, t.own], [2, 2, morgen, false]);
  assert.equal(t.admins[0].email, 'chef@rohr-kanal.de');
  assert.ok(r.data.tenants.find((x) => x.own));

  // Lizenz abgelaufen -> nur noch lesen (Daten abrufen, Abo buchen); gesperrt -> kein Zugang
  r = await api('op-tenant', { method: 'POST', token: op, body: { id: firmaId, name: 'Rohr & Kanal KG', maxUsers: 2, validUntil: '2020-01-31' } });
  assert.equal(r.status, 200);
  r = await api('sync', { method: 'POST', token: chef, body: { since: 0, changes: [
    { type: 'projects', id: 'abgelaufen-1', projectId: 'abgelaufen-1', updatedAt: 5, data: { id: 'abgelaufen-1', name: 'x' } }] } });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.nurLesen, r.data.accepted, r.data.lizenz.expired, r.data.lizenz.xml], [true, 0, true, false]);
  r = await api('invite', { method: 'POST', token: chef, body: { email: 'neu@rohr-kanal.de' } });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /31\.01\.2020 abgelaufen/);
  r = await login('chef@rohr-kanal.de', 'chef-pass-1');
  assert.equal(r.status, 200);
  assert.equal(r.data.lizenz.expired, true);
  await api('op-tenant', { method: 'POST', token: op, body: { id: firmaId, name: 'Rohr & Kanal KG', active: false } });
  r = await login('chef@rohr-kanal.de', 'chef-pass-1');
  assert.match(r.data.error, /gesperrt/);
  r = await api('op-tenant', { method: 'POST', token: op, body: { id: r.data.id ?? 1, name: 'Kanal Test GmbH', active: false } });
  assert.equal(r.status, 400); // eigene Firma nicht sperrbar

  // Admin löscht einen Benutzer seiner Firma (nicht sich selbst, nicht fremde Firmen)
  r = await api('users', { token: op });
  const erika = r.data.users.find((x) => x.username === 'erika');
  assert.equal((await api('user-delete', { method: 'POST', token: chef, body: { id: erika.id } })).status, 403); // gesperrte Firma
  r = await api('users', { token: op });
  const self = r.data.users.find((x) => x.username === 'admin');
  assert.equal((await api('user-delete', { method: 'POST', token: op, body: { id: self.id } })).status, 400);
  assert.equal((await api('user-delete', { method: 'POST', token: op, body: { id: erika.id } })).status, 200);
  assert.equal((await login('erika', 'sicher-1234')).status, 403);

  // Export und Löschen einer Firma
  r = await api('op-export', { token: op, query: `&tenant=${firmaId}` });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.benutzer.map((u) => u.email).sort(), ['chef@rohr-kanal.de', 'mia@rohr-kanal.de']);
  assert.ok(!JSON.stringify(r.data).includes('pass_hash'));
  assert.equal((await api('op-tenant-delete', { method: 'POST', token: op, body: { id: firmaId, confirm: 'falsch' } })).status, 400);
  r = await api('op-tenant-delete', { method: 'POST', token: op, body: { id: firmaId, confirm: 'Rohr & Kanal KG' } });
  assert.equal(r.status, 200);
  r = await api('op-tenants', { token: op });
  assert.ok(!r.data.tenants.some((x) => x.id === firmaId));
  assert.equal((await login('mia@rohr-kanal.de', 'neues-pass-9')).status, 403);
});

test('Tarife: Registrierung mit AGB/AVV, Buchung, Kündigung, Betreiber', { skip }, async () => {
  const login = async (username, password) => (await api('login', { method: 'POST', body: { username, password } }));
  const mails = () => readFileSync(mailLog, 'utf8');
  const lastLink = (kind) => {
    const all = mails().match(new RegExp(`#/${kind}/([a-f0-9]{48})`, 'g')) || [];
    return all.length ? all[all.length - 1].split('/').pop() : null;
  };
  const tag = 86400e3;
  const op = (await login('admin', 'geheim-12345')).data.token;
  let r = await api('ping');
  assert.equal(r.data.plattform.freigegeben, false);
  assert.deepEqual(r.data.plattform.vertrag, { agb: '1.0', avv: '1.0' });
  const reg = { firma: 'Kanalprüfung Süd GmbH', anschrift: 'Teststraße 5\n99999 Prüfstadt', name: 'Paula Prüf', funktion: 'Geschäftsführerin', email: 'Paula@Kanal-Sued.test', password: 'paula-pass-1', unternehmer: true, agb: '1.0', avv: '1.0' };
  // erst nach Freigabe durch den Betreiber
  assert.equal((await api('register', { method: 'POST', body: reg })).status, 403);
  assert.equal((await api('op-plattform', { method: 'POST', token: (await login('fremd', 'fremd-12345')).data.token, body: { freigegeben: true } })).status, 403);
  r = await api('op-plattform', { method: 'POST', token: op, body: { freigegeben: true, testTage: 30, preise: { monat: 25, jahr: 250, inklusive: 3, zusatzMonat: 5, zusatzJahr: 50 } } });
  assert.equal(r.data.plattform.freigegeben, true);
  assert.equal((await api('register', { method: 'POST', body: { ...reg, avv: '0.9' } })).status, 400);
  assert.equal((await api('register', { method: 'POST', body: { ...reg, unternehmer: false } })).status, 400);
  assert.equal((await api('register', { method: 'POST', body: { ...reg, anschrift: '' } })).status, 400);
  const vorher = mails().length;
  assert.equal((await api('register', { method: 'POST', body: { ...reg, website: 'http://spam' } })).status, 200); // Honeypot
  assert.equal(mails().length, vorher);
  r = await api('register', { method: 'POST', body: reg });
  assert.equal(r.status, 200);
  const tok = lastLink('registrierung');
  assert.ok(tok);
  r = await api('register-confirm', { method: 'POST', body: { token: tok } });
  assert.equal(r.status, 200);
  const paula = r.data.token;
  const l = r.data.lizenz;
  assert.deepEqual([r.data.user.role, r.data.user.email, l.plan, l.xml, l.expired, l.maxUsers, l.vertragOffen], ['admin', 'paula@kanal-sued.test', 'test', true, false, 3, false]);
  assert.equal(Math.round((Date.parse(l.validUntil) - Date.parse(new Date().toISOString().slice(0, 10))) / tag), 30);
  assert.equal(r.data.firma.anschrift, reg.anschrift);
  assert.equal((await api('register-confirm', { method: 'POST', body: { token: tok } })).status, 410);
  assert.match(mails(), /Auftragsverarbeitungsvertrag nach Art\. 28 DSGVO, Fassung 1\.0/);
  assert.match(mails(), /Angenommen von: Paula Prüf \(Geschäftsführerin\)/);
  // gleiche Adresse noch einmal: keine Auskunft in der Antwort, Hinweis nur per E-Mail
  r = await api('register', { method: 'POST', body: reg });
  assert.equal(r.status, 200);
  assert.match(mails(), /Sie haben bereits einen Zugang/);

  r = await api('konto', { token: paula });
  assert.deepEqual(r.data.vertraege.map((v) => v.art).sort(), ['agb', 'avv']);
  assert.equal(r.data.vertraege[0].funktion, 'Geschäftsführerin');
  // Buchung im Testzeitraum: Abrechnung beginnt nach dessen Ende
  const bestellung = { intervall: 'monat', benutzer: 4, rechnung: { firma: reg.firma, anschrift: reg.anschrift, email: 'rechnung@kanal-sued.test' }, bestellt: true };
  assert.equal((await api('konto-buchen', { method: 'POST', token: paula, body: { ...bestellung, bestellt: false } })).status, 400);
  r = await api('konto-buchen', { method: 'POST', token: paula, body: bestellung });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.lizenz.plan, r.data.lizenz.validUntil, r.data.lizenz.maxUsers, r.data.abo.preis], ['pro', null, 4, 30]);
  assert.equal((Date.parse(r.data.abo.seit) - Date.parse(l.validUntil)) / tag, 1);
  assert.match(mails(), /Bestellbestätigung[\s\S]*30,00 € je Monat ohne Umsatzsteuer \(Kleinunternehmer nach § 19 UStG\)/);
  // Kündigung noch im Test: endet mit dem Testzeitraum, es entstehen keine Kosten
  r = await api('konto-kuendigen', { method: 'POST', token: paula });
  assert.deepEqual([r.data.lizenz.validUntil, r.data.abo.endet], [l.validUntil, l.validUntil]);
  assert.equal((await api('konto-kuendigen', { method: 'POST', token: paula })).status, 400);
  assert.match(mails(), /Kündigungsbestätigung/);
  // doch wieder buchen, noch im Test: Abrechnung beginnt weiterhin erst nach dem Test
  r = await api('konto-buchen', { method: 'POST', token: paula, body: bestellung });
  assert.deepEqual([r.data.lizenz.validUntil, r.data.abo.endet, (Date.parse(r.data.abo.seit) - Date.parse(l.validUntil)) / tag], [null, null, 1]);
  r = await api('konto-kuendigen', { method: 'POST', token: paula });
  assert.equal(r.data.abo.endet, l.validUntil);

  // Betreiber: Aufträge und Vertragsstand je Firma
  r = await api('op-auftraege', { token: op });
  assert.deepEqual(r.data.auftraege.filter((a) => a.firma === reg.firma).map((a) => a.art), ['kuendigung', 'buchung', 'kuendigung', 'buchung', 'registrierung']);
  r = await api('op-tenants', { token: op });
  let t = r.data.tenants.find((x) => x.name === reg.firma);
  assert.deepEqual([t.plan, t.vertraege.avv.version, t.offeneAuftraege], ['pro', '1.0', 4]);
  assert.equal(r.data.tenants.find((x) => x.own).plan, 'betreiber');

  // Vom Betreiber angelegte Firma: Verträge nachträglich annehmen, dann buchen (ohne Test: ab heute)
  r = await api('op-tenant', { method: 'POST', token: op, body: { name: 'Alt GmbH', plan: 'pro', adminEmail: 'alt@alt.test', adminName: 'Alf' } });
  r = await api('invite-accept', { method: 'POST', body: { token: lastLink('einladung'), name: 'Alf Alt', password: 'alf-pass-12' } });
  const alt = r.data.token;
  assert.equal(r.data.lizenz.vertragOffen, true);
  assert.equal((await api('konto-buchen', { method: 'POST', token: alt, body: bestellung })).status, 409);
  assert.equal((await api('vertrag', { method: 'POST', token: alt, body: { arten: ['avv'], versionen: { avv: '0.1' }, name: 'Alf Alt', funktion: 'Inhaber' } })).status, 409);
  r = await api('vertrag', { method: 'POST', token: alt, body: { arten: ['agb', 'avv'], versionen: { agb: '1.0', avv: '1.0' }, name: 'Alf Alt', funktion: 'Inhaber' } });
  assert.equal(r.data.lizenz.vertragOffen, false);
  r = await api('konto-buchen', { method: 'POST', token: alt, body: { ...bestellung, intervall: 'jahr', benutzer: 3 } });
  assert.deepEqual([r.data.abo.seit, r.data.abo.preis], [new Date().toISOString().slice(0, 10), 250]);
  r = await api('konto-kuendigen', { method: 'POST', token: alt });
  const tageBisEnde = (Date.parse(r.data.abo.endet) - Date.now()) / tag;
  assert.ok(tageBisEnde > 360 && tageBisEnde < 367, `Jahresabo endet nach einem Jahr (${r.data.abo.endet})`);
  // Betreiber-Firma: kein Vertrag, kein Abo, Export immer erlaubt
  r = await api('me', { token: op });
  assert.deepEqual([r.data.lizenz.plan, r.data.lizenz.xml, r.data.lizenz.vertragOffen], ['betreiber', true, false]);
  assert.equal((await api('vertrag', { method: 'POST', token: op, body: { arten: ['avv'], versionen: { avv: '1.0' }, name: 'X', funktion: 'Y' } })).status, 400);
  // Inspekteure sehen Abo & Verträge nicht
  t = (await api('op-tenants', { token: op })).data.tenants.find((x) => x.name === 'Alt GmbH');
  assert.equal(t.vertraege.agb.name, 'Alf Alt');
});

test('E-Mail per SMTP (Anmeldung, Umlaute, falsches Passwort)', { skip: !hasPhp && 'PHP fehlt' }, async () => {
  const net = await import('node:net');
  const received = [];
  // kleiner SMTP-Server: AUTH LOGIN mit u/p, nimmt eine Mail an
  const srv = net.createServer((sock) => {
    let state = 'cmd', user = '', data = '';
    const send = (l) => sock.write(l + '\r\n');
    send('220 test ESMTP');
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (state === 'data') {
          if (line === '.') { received.push(data); state = 'cmd'; send('250 OK queued'); } else data += line + '\n';
          continue;
        }
        if (state === 'user') { user = Buffer.from(line, 'base64').toString(); state = 'pass'; send('334 UGFzc3dvcmQ6'); continue; }
        if (state === 'pass') { state = 'cmd'; send(user === 'u@test.de' && Buffer.from(line, 'base64').toString() === 'geheim' ? '235 ok' : '535 Authentication credentials invalid'); continue; }
        if (/^EHLO/.test(line)) send('250-test\r\n250 AUTH LOGIN');
        else if (line === 'AUTH LOGIN') { state = 'user'; send('334 VXNlcm5hbWU6'); }
        else if (/^MAIL FROM|^RCPT TO/.test(line)) send('250 OK');
        else if (line === 'DATA') { state = 'data'; data = ''; send('354 go'); }
        else if (line === 'QUIT') { send('221 bye'); sock.end(); }
        else send('500 ?');
      }
    });
  }).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const port = srv.address().port;
  const dir = mkdtempSync(join(tmpdir(), 'sbmail-'));
  const run = (pass) => {
    const cfg = join(dir, `cfg-${pass}.php`);
    writeFileSync(cfg, `<?php return ['db_dsn' => 'sqlite::memory:', 'mail_from' => 'u@test.de',
      'smtp' => ['host' => '127.0.0.1', 'port' => ${port}, 'secure' => 'none', 'user' => 'u@test.de', 'pass' => '${pass}']];`);
    return new Promise((res) => {
      const p = spawn('php', ['-r', `require '${join(root, 'app/api/lib/bootstrap.php')}';
        $ok = sb_mail('empfaenger@test.de', 'Einladung für Müller & Söhne', "Grüße\n.\nLink: https://x/#/einladung/abc");
        echo json_encode(['ok' => $ok, 'fehler' => sb_mail_fehler(), 'methode' => sb_mail_methode()]);`], { env: { ...process.env, SB_CONFIG: cfg } });
      let out = '';
      p.stdout.on('data', (c) => (out += c));
      p.on('close', () => res(JSON.parse(out)));
    });
  };
  let r = await run('geheim');
  assert.deepEqual([r.ok, r.methode], [true, 'smtp']);
  assert.equal(received.length, 1);
  const mail = received[0];
  assert.match(mail, /Subject: =\?UTF-8\?B\?/);
  const body = Buffer.from(mail.split('\n\n').slice(1).join('').replace(/\s+/g, ''), 'base64').toString('utf8');
  assert.equal(body, 'Grüße\n.\nLink: https://x/#/einladung/abc');
  r = await run('falsch');
  assert.equal(r.ok, false);
  assert.match(r.fehler, /535.*Benutzer\/Passwort des Postfachs prüfen/);
  srv.close();
});

test('KI-Route: Anfrage an Claude und Bereinigung der Antwort', { skip: skip || (!hasVendor && 'vendor/ fehlt (composer install)') }, async () => {
  const r0 = await api('login', { method: 'POST', body: { username: 'admin', password: 'geheim-12345' } });
  const token = r0.data.token;
  const img = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50, 1)]).toString('base64');
  const r = await api('ai', { method: 'POST', token, body: {
    image: img, mediaType: 'image/jpeg',
    context: { schacht: 'S1005', tiefe: 2.42, dn: 1000, uhr: { cx: 0.5, cy: 0.5, r: 0.36, rot: 0 }, anschluesse: [] },
    catalog: [{ code: 'DAB', name: 'Rissbildung', c1: ['A=Haarriss'], c2: ['A=vertikal'] }, { code: 'DBF', name: 'Infiltration', c1: [], c2: [] }],
  } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.findings.length, 1, 'unbekannter Kode XYZ wird verworfen');
  assert.equal(r.data.findings[0].code, 'DAB');
  assert.equal(r.data.findings[0].depthFromTop, 0.9);
  assert.equal(r.data.connections.length, 2);
  // Request-Format an die Claude-API
  assert.match(mockReq.url, /^\/v1\/messages(\?beta=true)?$/);
  assert.equal(mockReq.headers['x-api-key'], 'test-key');
  assert.match(mockReq.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  const b = mockReq.body;
  assert.equal(b.model, 'claude-opus-5-5');
  assert.equal(b.fallbacks, 'default');
  assert.equal(b.output_config.effort, 'high');
  assert.equal(b.output_config.format.type, 'json_schema');
  const imgBlock = b.messages[0].content[0];
  assert.equal(imgBlock.type, 'image');
  assert.equal(imgBlock.source.media_type, 'image/jpeg');
  assert.equal(imgBlock.source.data, img);
  assert.match(b.messages[0].content[1].text, /Draufsicht/);
});
