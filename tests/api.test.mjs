// Tests für den PHP-Server (SQLite) inkl. KI-Route gegen einen lokalen Mock der Claude-API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hasPhp = (() => { try { execFileSync('php', ['-m'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const hasSqlite = hasPhp && execFileSync('php', ['-m']).toString().includes('pdo_sqlite');
const hasVendor = existsSync(join(root, 'app/api/vendor/autoload.php'));
const skip = !hasSqlite ? 'PHP mit pdo_sqlite nicht vorhanden' : false;

let php, mock, base, cfgPath, mockReq = null;
const PORT = 18000 + Math.floor(Math.random() * 1000);
const MOCK_PORT = PORT + 1;

before(async () => {
  if (skip) return;
  const dir = mkdtempSync(join(tmpdir(), 'sbapi-'));
  const cfg = join(dir, 'config.php');
  cfgPath = cfg;
  writeFileSync(cfg, `<?php return [
    'db_dsn' => 'sqlite:${dir}/test.sqlite', 'db_user' => null, 'db_pass' => null,
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
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '?r=ping'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
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
    $c = require getenv('SB_CONFIG'); $db = new PDO($c['db_dsn']);
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
