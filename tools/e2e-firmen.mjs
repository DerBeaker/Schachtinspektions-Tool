// End-to-End-Test „mehrere Firmen“: Betreiber legt eine Firma an, deren Administrator nimmt die
// Einladung an, pflegt Firmendaten/Logo und lädt einen Inspekteur ein; Lizenzablauf sperrt den
// Zugang; „Passwort vergessen“. PHP-Server mit SQLite, E-Mails landen in einer Logdatei.
// Aufruf: node tools/e2e-firmen.mjs <logo/foto.jpg> <ausgabeordner>
import { createRequire } from 'node:module';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }));

const [logo, outDir = '.e2e-firmen'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'sbfirmen-'));
const cfg = join(dir, 'config.php');
const mailLog = join(dir, 'mail.log');
const PORT = 18800 + Math.floor(Math.random() * 90);
const url = `http://127.0.0.1:${PORT}/`;
writeFileSync(cfg, `<?php return ['db_dsn' => 'sqlite:${dir}/db.sqlite', 'db_user' => null, 'db_pass' => null, 'photo_dir' => '${dir}/photos',
  'session_days' => 30, 'cors_origins' => [], 'anthropic_api_key' => '', 'mail_log' => '${mailLog}', 'app_url' => '${url}'];`);
const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', join(root, 'app')], { env: { ...process.env, SB_CONFIG: cfg }, stdio: 'ignore' });
process.on('exit', () => php.kill());
await new Promise((r) => setTimeout(r, 600));
await fetch(url + 'api/setup.php', { method: 'POST', body: new URLSearchParams({ company: 'MMSE Software Engineering', name: 'Betreiber', email: 'betrieb@mmse.test', password: 'betrieb-12345' }) });

const errors = [];
const browser = await chromium.launch();
const step = (s) => console.log('▶', s);
const lastLink = (kind) => {
  const m = existsSync(mailLog) ? readFileSync(mailLog, 'utf8').match(new RegExp(`https?://[^\\s]+#/${kind}/[a-f0-9]{48}`, 'g')) : null;
  return m ? m[m.length - 1] : null;
};
const neu = async (device, name) => {
  const p = await (await browser.newContext({ ...(device ? devices[device] : { viewport: { width: 1280, height: 860 } }), locale: 'de-DE' })).newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  return p;
};
async function login(page, user, pw) {
  await page.goto(url + '#/settings');
  await page.getByLabel('E-Mail oder Benutzer', { exact: true }).fill(user);
  await page.getByLabel('Passwort', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.getByRole('button', { name: 'Abmelden' }).waitFor();
}

step('Betreiber: anmelden, Firma mit Testlizenz anlegen');
const op = await neu(null, 'betreiber');
await login(op, 'betrieb@mmse.test', 'betrieb-12345');
await op.getByRole('button', { name: 'Betreiber-Bereich' }).click();
await op.getByRole('button', { name: 'E-Mail-Versand testen' }).click();
await op.getByRole('button', { name: 'Test-E-Mail senden' }).click();
await op.getByText('Test-E-Mail verschickt').waitFor();
if (!/Test-E-Mail/.test(readFileSync(mailLog, 'utf8'))) errors.push('Test-E-Mail nicht verschickt');
await op.keyboard.press('Escape');
await op.waitForTimeout(400);
await op.getByRole('button', { name: 'Firma anlegen' }).click();
await op.getByLabel('Firmenname').fill('Kanal Müller GmbH');
await op.getByLabel('Benutzer (max.)').fill('3');
await op.getByLabel('E-Mail-Adresse').fill('chef@mueller.test');
await op.getByLabel('Name', { exact: true }).fill('Karl Müller');
await op.locator('.sheet').getByRole('button', { name: 'Firma anlegen' }).click();
await op.getByText('Einladung erstellt').waitFor();
const adminLink = await op.locator('.sheet textarea.mono').inputValue();
if (adminLink !== lastLink('einladung')) errors.push('Einladungslink in App und E-Mail unterschiedlich');
await op.screenshot({ path: `${outDir}/01-einladung-link.png` });
await op.locator('.sheet').getByRole('button', { name: /Schließen|×/ }).click().catch(() => op.keyboard.press('Escape'));
await op.keyboard.press('Escape');
await op.waitForTimeout(400);
await op.screenshot({ path: `${outDir}/02-betreiber.png`, fullPage: true });

step('Firmen-Admin (Handy): Einladung annehmen, Firmendaten und Logo pflegen');
const chef = await neu('Pixel 7', 'admin');
await chef.goto(adminLink);
await chef.getByText('Kanal Müller GmbH').first().waitFor();
await chef.getByLabel('Passwort (mind. 8 Zeichen)').fill('chef-pass-1');
await chef.getByLabel('Passwort wiederholen').fill('chef-pass-1');
await chef.screenshot({ path: `${outDir}/03-einladung-annehmen.png` });
await chef.getByRole('button', { name: 'Zugang einrichten' }).click();
await chef.getByRole('button', { name: 'Stammdaten importieren' }).waitFor();
await chef.goto(url + '#/settings');
await chef.getByLabel('Anschrift').fill('Hauptstraße 1\n12345 Musterstadt');
await chef.getByLabel('Kontakt').fill('Tel. 0123 456');
{
  const [fc] = await Promise.all([chef.waitForEvent('filechooser'), chef.getByRole('button', { name: 'Logo wählen' }).click()]);
  await fc.setFiles(logo);
  await chef.locator('img.logo-preview').waitFor();
}
await chef.waitForTimeout(1500); // Firmendaten werden verzögert an den Server gesendet
await chef.screenshot({ path: `${outDir}/04-admin-firmendaten.png`, fullPage: true });

step('Firmen-Admin: Inspekteurin einladen');
await chef.getByRole('button', { name: 'Benutzer verwalten' }).click();
await chef.getByRole('button', { name: 'Per E-Mail einladen' }).click();
await chef.locator('.sheet').last().getByLabel('E-Mail-Adresse').fill('mia@mueller.test');
await chef.locator('.sheet').last().getByLabel('Name (optional)').fill('Mia Prüferin');
await chef.getByRole('button', { name: 'Einladung senden' }).click();
await chef.getByText('Einladung erstellt').waitFor();
const miaLink = lastLink('einladung');

step('Inspekteurin (zweites Handy): Zugang einrichten, Firmendaten kommen vom Server');
const mia = await neu('iPhone 13', 'inspekteurin');
await mia.goto(miaLink);
await mia.getByLabel('Passwort (mind. 8 Zeichen)').fill('mia-pass-12');
await mia.getByLabel('Passwort wiederholen').fill('mia-pass-12');
await mia.getByRole('button', { name: 'Zugang einrichten' }).click();
await mia.getByRole('button', { name: 'Stammdaten importieren' }).waitFor();
await mia.goto(url + '#/settings');
await mia.getByText('Wird vom Administrator Ihrer Firma gepflegt').waitFor();
if (await mia.getByLabel('Anschrift').inputValue() !== 'Hauptstraße 1\n12345 Musterstadt') errors.push('Anschrift nicht übernommen');
if (!(await mia.locator('img.logo-preview').count())) errors.push('Logo nicht übernommen');
if (!(await mia.getByLabel('Anschrift').isDisabled())) errors.push('Inspekteurin kann Firmendaten ändern');
if (await mia.getByRole('button', { name: 'Betreiber-Bereich' }).count()) errors.push('Betreiber-Bereich für Inspekteurin sichtbar');
await mia.screenshot({ path: `${outDir}/05-inspekteurin-firmendaten.png`, fullPage: true });

step('Betreiber: Übersicht, Lizenz ablaufen lassen');
await op.goto(url + '#/betrieb');
await op.getByText('2 von 3 Benutzer').waitFor();
await op.screenshot({ path: `${outDir}/06-betreiber-uebersicht.png`, fullPage: true });
await op.locator('.item', { hasText: 'Kanal Müller GmbH' }).getByRole('button', { name: 'Aktionen' }).click();
await op.getByText('Bearbeiten / Lizenz').click();
await op.getByLabel('Lizenz gültig bis').fill('2020-01-31');
await op.getByRole('button', { name: 'Speichern' }).click();
await op.getByText('Lizenz abgelaufen').waitFor();
const res = await mia.evaluate(async () => { const { sync } = await import('./js/sync.js'); await sync.run(); return sync.status.message; });
if (!/31\.01\.2020 abgelaufen/.test(res)) errors.push('Abgelaufene Lizenz sperrt den Sync nicht: ' + res);
await op.locator('.item', { hasText: 'Kanal Müller GmbH' }).getByRole('button', { name: 'Aktionen' }).click();
await op.getByText('Bearbeiten / Lizenz').click();
await op.getByRole('button', { name: 'unbefristet' }).click();
await op.getByRole('button', { name: 'Speichern' }).click();
await op.waitForTimeout(500);

step('Inspekteurin: Passwort vergessen');
await mia.getByRole('button', { name: 'Abmelden' }).click();
await mia.getByRole('button', { name: 'Passwort vergessen?' }).click();
await mia.locator('.sheet').getByLabel('E-Mail-Adresse').fill('mia@mueller.test');
await mia.getByRole('button', { name: 'Link anfordern' }).click();
await mia.waitForTimeout(800);
const reset = lastLink('passwort');
if (!reset) errors.push('Keine E-Mail für „Passwort vergessen“');
else {
  await mia.goto(reset);
  await mia.getByLabel('Passwort (mind. 8 Zeichen)').fill('neu-pass-345');
  await mia.getByLabel('Passwort wiederholen').fill('neu-pass-345');
  await mia.getByRole('button', { name: 'Passwort speichern' }).click();
  await mia.getByLabel('E-Mail oder Benutzer', { exact: true }).waitFor();
  await login(mia, 'mia@mueller.test', 'neu-pass-345');
}

await browser.close();
writeFileSync(`${outDir}/errors.txt`, errors.join('\n'));
console.log(errors.length ? `✗ ${errors.length} Fehler:\n${errors.join('\n')}` : '✓ Firmen-Ablauf ohne Fehler');
process.exit(errors.length ? 1 : 0);
