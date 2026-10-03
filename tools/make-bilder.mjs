// Bilder für die Info-Seite (app/schachtinspektion.html) und die Link-Vorschau (WhatsApp, Google &
// Co.): Bildschirmfotos aus dem Demo-Projekt (fiktive Daten, künstliches Testfoto) und app/og-bild.jpg
// (1200 × 630). Voraussetzung: App läuft lokal (npm run serve), Testfoto aus tools/make-test-photo.mjs.
// Aufruf: node tools/make-bilder.mjs http://127.0.0.1:8080/ /tmp/s.jpg
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }));

const [url = 'http://127.0.0.1:8080/', photo] = process.argv.slice(2);
if (!photo) { console.error('Aufruf: node tools/make-bilder.mjs <url> <testfoto.jpg>'); process.exit(1); }
const app = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const out = join(app, 'bilder');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'de-DE' });
const page = await ctx.newPage();
const ohneToasts = () => page.addStyleTag({ content: '.toasts{display:none!important}' });
const bild = async (name) => {
  await ohneToasts();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 72 });
  console.log('  ', name, Math.round(statSync(join(out, name)).size / 1024), 'KB');
};

await page.goto(url);
await page.getByRole('button', { name: 'Demo ansehen' }).click();
await page.getByText('S1005').first().waitFor();
await page.getByText('S1005', { exact: true }).click();
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Foto aufnehmen' }).click()]);
await chooser.setFiles(photo);
await page.locator('.photo-stage svg image').waitFor();
await page.getByRole('radio', { name: 'Anschluss setzen' }).click();
const box = await page.locator('.photo-stage svg').boundingBox();
await page.mouse.click(box.x + box.width * (538 / 1600), box.y + box.height * (622 / 1200));
await page.locator('.sheet .menu-item').first().click();
await page.getByRole('radio', { name: 'Ansehen' }).click();
await bild('app-foto.jpg');

await page.getByRole('tab', { name: /Aufbau/ }).click();
await page.getByRole('button', { name: 'Vorlage Regelschacht DN 1000' }).click();
const ersetzen = page.getByRole('button', { name: 'Ersetzen' });
if (await ersetzen.isVisible().catch(() => false)) await ersetzen.click();
await page.locator('.card', { hasText: 'Auflageringe' }).getByRole('radio', { name: 'ja' }).click();
await page.getByLabel('Gesamthöhe').fill('12 cm');
await page.getByLabel('Höhe inkl. Konus').fill('1,55');
const unterteil = page.locator('.card', { hasText: 'Unterteil und Gerinne' }).getByLabel('Höhe');
await unterteil.fill('600 mm');
await unterteil.press('Enter');
await page.getByText(/Passt: 0,15 m/).waitFor();
await page.locator('.modell3d canvas').waitFor();
await page.locator('.modell3d canvas').scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -140));
await page.waitForTimeout(1500);
await bild('app-aufbau.jpg');

await page.getByRole('tab', { name: /Befunde/ }).click();
await page.locator('.chips .chip', { hasText: 'Rissbildung' }).click();
const sheet = page.locator('.sheet');
await sheet.locator('.pill', { hasText: 'Riss – Risslinien' }).click();
await sheet.locator('.pill', { hasText: 'vertikal' }).first().click();
await sheet.getByPlaceholder('0,0', { exact: true }).fill('0,8');
await sheet.locator('.clock-picker g[aria-label="3 Uhr"]').click();
await sheet.getByPlaceholder('0,00').first().fill('0,9');
await sheet.locator('.shaft .pill', { hasText: 'Schachtaufbau' }).click();
await sheet.getByRole('button', { name: 'Speichern' }).click();
await page.getByRole('button', { name: 'Befund hinzufügen' }).click();
await page.locator('.sheet input[type=search]').fill('Steig');
await page.locator('.sheet .code-row', { hasText: 'DAQ' }).click();
await page.locator('.sheet .pill', { hasText: 'korrodiertes Steigeisen' }).click();
await page.locator('.sheet').getByPlaceholder('0', { exact: true }).fill('4');
await page.locator('.sheet').getByPlaceholder('0,00').first().fill('0,5');
await page.locator('.sheet .shaft .pill', { hasText: 'Schachtaufbau' }).click();
await page.locator('.sheet').getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(400);
await bild('app-befunde.jpg');

// Vorschaubild 1200 × 630 (Open Graph): Text links, App-Foto im Handy rechts
const foto = readFileSync(join(out, 'app-foto.jpg')).toString('base64');
const og = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
await og.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:1200px;height:630px;font-family:system-ui,'DejaVu Sans',sans-serif;background:linear-gradient(135deg,#0a5bd3,#00a3c4);color:#fff;overflow:hidden;position:relative}
  .txt{position:absolute;left:64px;top:56px;width:660px}
  .marke{display:flex;align-items:center;gap:16px;font-size:30px;font-weight:800;letter-spacing:.3px}
  .logo{width:58px;height:58px;border-radius:16px;background:rgba(255,255,255,.18);display:grid;place-items:center}
  h1{font-size:52px;line-height:1.08;margin:30px 0 16px;font-weight:800}
  p{font-size:25px;line-height:1.35;margin:0 0 22px;opacity:.95}
  .chips{display:flex;flex-wrap:wrap;gap:10px}
  .chip{background:rgba(255,255,255,.18);border-radius:999px;padding:8px 16px;font-size:20px;font-weight:600}
  .handy{position:absolute;right:70px;top:46px;width:300px;height:600px;border-radius:44px;background:#0b1220;padding:12px;box-shadow:0 30px 60px rgba(0,0,0,.35)}
  .handy img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:34px}
  .fuss{position:absolute;left:64px;bottom:30px;font-size:19px;opacity:.85}
</style>
<div class="txt">
  <div class="marke"><div class="logo"><svg viewBox="0 0 100 100" width="40" height="40"><g fill="none" stroke="#fff" stroke-width="7"><circle cx="50" cy="50" r="42"/><circle cx="50" cy="50" r="24"/><path d="M50 4v16M50 80v16M4 50h16M80 50h16"/></g></svg></div>Schachtblick</div>
  <h1>Schachtinspektion per App – kostenlos</h1>
  <p>Foto von oben, Anschlüsse und Schäden kodieren, Zustandsklasse, PDF-Protokoll. Im Browser, ohne Installation.</p>
  <div class="chips"><span class="chip">ISYBAU</span><span class="chip">DWA-M 149-2</span><span class="chip">DWA-M 150</span><span class="chip">offline</span></div>
</div>
<div class="handy"><img src="data:image/jpeg;base64,${foto}"></div>
<div class="fuss">MMSE Software Engineering · www.mmse-software.com</div>`);
await og.screenshot({ path: join(app, 'og-bild.jpg'), type: 'jpeg', quality: 82 });
console.log('   og-bild.jpg', Math.round(statSync(join(app, 'og-bild.jpg')).size / 1024), 'KB');
await browser.close();
