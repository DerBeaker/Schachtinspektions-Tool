// End-to-End-Test im echten Browser (Playwright/Chromium), Handy-Ansicht.
// Voraussetzung: App läuft lokal (npm run serve) und Testfoto existiert (tools/make-test-photo.mjs).
// Aufruf: node tools/e2e.mjs <url> <testfoto.jpg> <ausgabeordner>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }));

const [url = 'http://127.0.0.1:8080/', photo, outDir = '.e2e'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true, locale: 'de-DE' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });
const step = (s) => console.log('▶', s);

step('Startseite');
await page.goto(url);
await page.getByRole('button', { name: 'Demo ansehen' }).waitFor();
await shot('01-start');

step('Demo laden');
await page.getByRole('button', { name: 'Demo ansehen' }).click();
await page.getByText('S1005').waitFor();
await shot('02-projekt');

step('Schacht S1005 öffnen');
await page.getByText('S1005', { exact: true }).click();
await page.getByText('Foto von oben aufnehmen').waitFor();
await shot('03-foto-leer');

step('Foto aufnehmen');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Foto aufnehmen' }).click()]);
await chooser.setFiles(photo);
await page.locator('.photo-stage svg image').waitFor();
await page.waitForTimeout(400);
await shot('04-foto-ausrichten');

step('Anschluss per Tippen setzen (9 Uhr)');
await page.getByRole('radio', { name: 'Anschluss setzen' }).click();
const box = await page.locator('.photo-stage svg').boundingBox();
// Testfoto 1600x1200, Zulauf bei (538,622)
await page.mouse.click(box.x + box.width * (538 / 1600), box.y + box.height * (622 / 1200));
await page.getByText('Anschluss bei 9 Uhr').waitFor();
await shot('05-anschluss-zuordnen');
await page.locator('.sheet .menu-item').first().click();
await page.waitForTimeout(300);
await shot('06-foto-mit-anschluessen');

step('Anschlüsse');
await page.getByRole('tab', { name: /Anschlüsse/ }).click();
await shot('07-anschluesse');

step('Befund DAB erfassen');
await page.getByRole('tab', { name: /Befunde/ }).click();
await page.locator('.chips .chip', { hasText: 'Rissbildung' }).click();
const sheet = page.locator('.sheet');
await sheet.locator('.pill', { hasText: 'Riss – Risslinien' }).click();
await sheet.locator('.pill', { hasText: 'vertikal' }).first().click();
await sheet.getByPlaceholder('0,0', { exact: true }).fill('0,8');
await sheet.locator('.clock-picker g[aria-label="3 Uhr"]').click();
await sheet.getByPlaceholder('0,00').first().fill('0,9');
await sheet.locator('.shaft .pill', { hasText: 'Schachtaufbau' }).click();
await shot('08-befund-editor');
await sheet.getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(300);

step('Befund DAQ (Strecke) erfassen');
await page.getByRole('button', { name: 'Befund hinzufügen' }).click();
await page.locator('.sheet input[type=search]').fill('Steig');
await page.locator('.sheet .code-row', { hasText: 'DAQ' }).click();
await page.locator('.sheet .pill', { hasText: 'korrodiertes Steigeisen' }).click();
await page.locator('.sheet').getByPlaceholder('0', { exact: true }).fill('4');
// wie ein Laser im Bluetooth-Tastaturmodus: Wert mit Einheit + Enter
await page.locator('.sheet').getByPlaceholder('0,00').first().fill('500 mm');
await page.locator('.sheet').getByPlaceholder('0,00').first().press('Enter');
if (await page.locator('.sheet').getByPlaceholder('0,00').first().inputValue() !== '0,5') errors.push('Laser-Eingabe „500 mm“ wurde nicht zu 0,5 m');
await page.locator('.sheet .toggle', { hasText: 'Streckenfeststellung' }).click();
await page.locator('.sheet').getByPlaceholder('0,00').nth(1).fill('1,8');
await page.locator('.sheet .shaft .pill', { hasText: 'Schachtaufbau' }).click();
await page.locator('.sheet').getByRole('button', { name: 'Speichern' }).click();
await page.waitForTimeout(300);
await shot('09-befunde');

step('Daten');
await page.getByRole('tab', { name: /Daten/ }).click();
await shot('10-daten');

step('Abschließen');
await page.getByRole('button', { name: 'Abschließen' }).click();
const confirmBtn = page.getByRole('button', { name: 'Trotzdem abschließen' });
if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
await page.getByText('S1005').first().waitFor();
await shot('11-projekt-nach-abschluss');

step('Export');
await page.getByRole('button', { name: 'Export', exact: true }).click();
await page.getByRole('button', { name: 'Exportieren' }).waitFor();
await shot('12-export');
const { readFileSync } = await import('node:fs');
async function exportAs(format) {
  if (format) await page.locator('main select').first().selectOption(format);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportieren' }).click()]);
  const p = `${outDir}/${dl.suggestedFilename()}`;
  await dl.saveAs(p);
  console.log('  Download:', p);
  return readFileSync(p).toString('latin1');
}
{
  const z = await exportAs();
  const expect = (re, msg) => { if (!re.test(z)) errors.push('Export: ' + msg); };
  expect(/<InspektionsKode>DAB<\/InspektionsKode>\s*<Charakterisierung1>B<\/Charakterisierung1>\s*<Charakterisierung2>A<\/Charakterisierung2>\s*<Verbindung>0<\/Verbindung>\s*<Quantifizierung1Numerisch>0\.80<\/Quantifizierung1Numerisch>\s*<Schachtbereich>C<\/Schachtbereich>\s*<PositionVon>03<\/PositionVon>/, 'DABBA 0,8 mm Bereich C 3 Uhr fehlt');
  expect(/<VertikaleLage>1\.52<\/VertikaleLage>\s*<InspektionsKode>DAB</, 'DAB-Lage 0,90 m ab Deckel -> 1,52 m über Sohle');
  expect(/<InspektionsKode>DAQ<\/InspektionsKode>\s*<Charakterisierung1>C<\/Charakterisierung1>[\s\S]*?<Streckenschaden>A<\/Streckenschaden>/, 'DAQC Strecke A fehlt');
  expect(/<InspektionsKode>DAQ<\/InspektionsKode>[\s\S]*?<Streckenschaden>B<\/Streckenschaden>/, 'DAQ Strecke B fehlt');
  expect(/<Fotodatei>S1005-001\.jpg<\/Fotodatei>/, 'Fotoreferenz fehlt');
  expect(/Fotos\/S1005-001\.jpg/, 'Foto im ZIP fehlt');
  expect(/<VertikaleLage>1\.92<\/VertikaleLage>\s*<InspektionsKode>DAQ</, 'DAQ-Ende per Laser 500 mm ab Deckel -> 1,92 m');
}
{
  const z = await exportAs('2006-10');
  if (!/xmlns="http:\/\/www\.ofd-hannover\.la\/Identifikation"/.test(z) || !/<Version>2006-10<\/Version>/.test(z) || /<Index>/.test(z)) errors.push('Export 2006: Namespace/Version/Index falsch');
}
{
  const z = await exportAs('m150');
  await shot('12b-export-m150');
  const expect = (re, msg) => { if (!re.test(z)) errors.push('M150: ' + msg); };
  expect(/<DATA>\s*<FD>\s*<FD001>04-2010<\/FD001>\s*<FD002>B<\/FD002>/, 'Kopf FD fehlt');
  expect(/<KG001>S1005<\/KG001>/, 'Knoten S1005 fehlt');
  expect(/<KZ001>1,52<\/KZ001>\s*<KZ002>DAB<\/KZ002>\s*<KZ014>B<\/KZ014>\s*<KZ015>A<\/KZ015>\s*<KZ003>0,8<\/KZ003>/, 'DAB mit Dezimalkomma fehlt');
  expect(/<KZ005>A1<\/KZ005>/, 'Streckenschaden A1 fehlt');
  expect(/Fotos\/S1005-001\.jpg/, 'Foto im ZIP fehlt');
}

step('Protokoll');
await page.goBack();
await page.getByText('S1005', { exact: true }).click();
await page.getByRole('button', { name: 'Mehr' }).click();
await page.getByText('Schachtprotokoll').click();
await page.getByText('Zustandsdaten (ISYBAU-Datensätze)').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/13-protokoll.png`, fullPage: true });

step('Desktop-Ansicht');
const dctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'de-DE' });
const dp = await dctx.newPage();
dp.on('pageerror', (e) => errors.push('desktop pageerror: ' + e.message));
await dp.goto(url);
await dp.getByRole('button', { name: 'Demo ansehen' }).click();
await dp.getByText('S1002', { exact: true }).click();
const [ch2] = await Promise.all([dp.waitForEvent('filechooser'), dp.getByRole('button', { name: 'Foto aufnehmen' }).click()]);
await ch2.setFiles(photo);
await dp.locator('.photo-stage svg image').waitFor();
await dp.waitForTimeout(400);
await dp.screenshot({ path: `${outDir}/14-desktop-foto.png` });
await dp.getByRole('tab', { name: /Befunde/ }).click();
await dp.waitForTimeout(300);
await dp.screenshot({ path: `${outDir}/15-desktop-befunde.png` });

await browser.close();
writeFileSync(`${outDir}/errors.txt`, errors.join('\n'));
console.log(errors.length ? `✗ ${errors.length} Fehler:\n${errors.join('\n')}` : '✓ keine JS-Fehler');
process.exit(errors.length ? 1 : 0);
