// End-to-End-Test der Synchronisation: Handy erfasst, PC sieht die Daten (PHP-Server mit SQLite).
// Aufruf: node tools/e2e-sync.mjs <testfoto.jpg> <ausgabeordner>
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }));

const [photo, outDir = '.e2e-sync'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'sbsync-'));
const cfg = join(dir, 'config.php');
writeFileSync(cfg, `<?php return ['db_dsn' => 'sqlite:${dir}/db.sqlite', 'db_user' => null, 'db_pass' => null, 'photo_dir' => '${dir}/photos', 'session_days' => 30, 'cors_origins' => [], 'anthropic_api_key' => ''];`);
const PORT = 18900 + Math.floor(Math.random() * 90);
const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', join(root, 'app')], { env: { ...process.env, SB_CONFIG: cfg }, stdio: 'ignore' });
const url = `http://127.0.0.1:${PORT}/`;
process.on('exit', () => php.kill());
await new Promise((r) => setTimeout(r, 600));
await fetch(url + 'api/setup.php', { method: 'POST', body: new URLSearchParams({ company: 'Test GmbH', name: 'Max Prüfer', username: 'max', password: 'geheim-12345' }) });

const errors = [];
const browser = await chromium.launch();
const step = (s) => console.log('▶', s);
async function login(page) {
  await page.goto(url + '#/settings');
  await page.getByLabel('E-Mail oder Benutzer', { exact: true }).fill('max');
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-12345');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByText('Max Prüfer').waitFor();
}

step('Handy: anmelden, Demo laden, Schacht mit Foto und Befund erfassen');
const phone = await (await browser.newContext({ ...devices['Pixel 7'], locale: 'de-DE' })).newPage();
phone.on('pageerror', (e) => errors.push('phone: ' + e.message));
await login(phone);
await phone.screenshot({ path: `${outDir}/01-handy-angemeldet.png` });
await phone.goto(url);
await phone.getByRole('button', { name: 'Demo ansehen' }).click();
await phone.getByText('S1001', { exact: true }).click();
const [ch] = await Promise.all([phone.waitForEvent('filechooser'), phone.getByRole('button', { name: 'Foto aufnehmen' }).click()]);
await ch.setFiles(photo);
await phone.locator('.photo-stage svg image').waitFor();
await phone.getByRole('tab', { name: /Befunde/ }).click();
await phone.getByRole('button', { name: 'Befund hinzufügen' }).click();
await phone.locator('.sheet input[type=search]').fill('DBF');
await phone.locator('.sheet .code-row', { hasText: 'DBF' }).click();
await phone.locator('.sheet .pill', { hasText: 'Tropfen – kein' }).click();
await phone.locator('.sheet .pill', { hasText: 'durch die Wand' }).click();
await phone.locator('.sheet .clock-picker g[aria-label="7 Uhr"]').click();
await phone.locator('.sheet').getByPlaceholder('0,00').first().fill('1,2');
await phone.locator('.sheet .shaft .pill', { hasText: 'Schachtaufbau' }).click();
await phone.locator('.sheet').getByRole('button', { name: 'Speichern' }).click();
await phone.waitForTimeout(600);
step('Handy: synchronisieren');
await phone.evaluate(async () => { const { sync } = await import('./js/sync.js'); await sync.run({ manual: true }); });
const st = await phone.evaluate(async () => { const { sync } = await import('./js/sync.js'); return sync.status; });
console.log('  Status:', st.state, st.message);

step('PC: anmelden – Daten müssen ankommen');
const pc = await (await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'de-DE' })).newPage();
pc.on('pageerror', (e) => errors.push('pc: ' + e.message));
await login(pc);
await pc.evaluate(async () => { const { sync } = await import('./js/sync.js'); await sync.run({ manual: true }); });
await pc.goto(url);
await pc.getByText('Demo: Musterweg').waitFor({ timeout: 10000 });
await pc.getByText('Demo: Musterweg').click();
await pc.getByText('S1001', { exact: true }).click();
await pc.getByRole('tab', { name: /Befunde/ }).click();
await pc.locator('.code-chip', { hasText: 'DBFBA' }).waitFor({ timeout: 10000 });
await pc.getByRole('tab', { name: /Foto/ }).click();
await pc.locator('.photo-stage svg image').waitFor({ timeout: 10000 });
await pc.waitForTimeout(500);
await pc.screenshot({ path: `${outDir}/02-pc-synchronisiert.png` });

await browser.close();
php.kill();
console.log(errors.length ? `✗ ${errors.join('\n')}` : '✓ Sync Handy → PC funktioniert, keine JS-Fehler');
process.exit(errors.length ? 1 : 0);
