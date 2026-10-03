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
// WebGL (3D-Modell) im Headless-Browser über SwiftShader
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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

step('Aufbau: Bauteile und 3D-Modell');
await page.getByRole('tab', { name: /Aufbau/ }).click();
await page.locator('.modell3d canvas, .modell3d-hint').first().waitFor();
await page.getByRole('button', { name: 'Vorlage Regelschacht DN 1000' }).click();
{
  const ersetzen = page.getByRole('button', { name: 'Ersetzen' });
  if (await ersetzen.isVisible().catch(() => false)) await ersetzen.click();
}
await page.getByLabel('Gesamthöhe').fill('12 cm');
await page.getByLabel('Höhe inkl. Konus').fill('1,55');
{
  const ut = page.locator('.card', { hasText: 'Unterteil und Gerinne' }).getByLabel('Höhe');
  await ut.fill('600 mm');
  await ut.press('Enter');
}
await page.getByText(/Passt: 0,15 m/).waitFor();
if (!(await page.locator('.modell3d canvas').count())) errors.push('3D-Modell nicht dargestellt (WebGL)');
await page.waitForTimeout(800);
await shot('07b-aufbau');

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

step('Einstellungen: Firma und Logo für Berichte');
await page.evaluate(() => { location.hash = '#/settings'; });
await page.getByText('Firma (Kopf der Berichte)').waitFor();
await page.getByLabel('Firma (Auftragnehmer)').fill('Kanal-Service Prüfmann GmbH');
await page.getByLabel('Anschrift').fill('Hauptstraße 1\n12345 Musterstadt');
await page.getByLabel('Kontakt').fill('Tel. 0123 4567');
{
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Logo wählen' }).click()]);
  await fc.setFiles(photo);
  await page.locator('img.logo-preview').waitFor();
}
if (!(await page.getByText('MMSE Software Engineering').first().isVisible())) errors.push('Herstellerangabe in den Einstellungen fehlt');
await page.screenshot({ path: `${outDir}/11b-einstellungen.png`, fullPage: true });
await page.goBack();
await page.getByText('S1005').first().waitFor();

step('Export');
await page.getByRole('button', { name: 'Export & Berichte', exact: true }).click();
await page.getByRole('button', { name: 'Exportieren' }).waitFor();
await shot('12-export');
const { readFileSync } = await import('node:fs');
/** Datei über einen Button erzeugen (Download oder – falls angeboten – Teilen-Dialog „Speichern“). */
async function fileFrom(name) {
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name, exact: true }).click();
  const save = page.locator('.sheet').getByRole('button', { name: 'Speichern' });
  save.waitFor({ timeout: 3000 }).then(() => save.click()).catch(() => {});
  const d = await dl;
  const p = `${outDir}/${d.suggestedFilename()}`;
  await d.saveAs(p);
  console.log('  Download:', p);
  return p;
}
const pdfText = (p) => { try { return execSync(`pdftotext -layout "${p}" -`).toString(); } catch { return null; } };
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
  expect(/<Stammdatenkollektiv>[\s\S]*<HoeheAuflageringe>12<\/HoeheAuflageringe>[\s\S]*<HoeheAufbau>1\.55<\/HoeheAufbau>[\s\S]*<HoeheUnterteil>0\.60<\/HoeheUnterteil>/, 'Bauteilbeschreibung (Stammdaten) fehlt');
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
  expect(/<KZ001>1\.52<\/KZ001>\s*<KZ002>DAB<\/KZ002>\s*<KZ014>B<\/KZ014>\s*<KZ015>A<\/KZ015>\s*<KZ003>0\.8<\/KZ003>/, 'DAB (ISYBAU-Schlüssel, Dezimalpunkt) fehlt');
  expect(/<KI101>1<\/KI101>/, 'Höhenangabe von unten (KI101 = 1) fehlt');
  expect(/<KZ005>A1<\/KZ005>/, 'Streckenschaden A1 fehlt');
  expect(/<KG314>625<\/KG314>[\s\S]*<KG323>2<\/KG323>/, 'Bauteile (Deckel, Steighilfen) in KG fehlen');
  expect(/Fotos\/S1005-001\.jpg/, 'Foto im ZIP fehlt');
}

step('Berichte: Schachtprotokolle und Aufmaß');
await page.locator('main select').first().selectOption('2017-07');
{
  const p = await fileFrom('Schachtprotokolle (PDF)');
  const b = readFileSync(p);
  if (b.subarray(0, 5).toString() !== '%PDF-') errors.push('Schachtprotokoll ist kein PDF');
  const t = pdfText(p);
  if (t !== null) {
    if (!/Kanal-Service Prüfmann GmbH/.test(t)) errors.push('PDF: Firmenname fehlt');
    if (!/S1005/.test(t) || !/DAB/.test(t)) errors.push('PDF: Schacht/Befund fehlt');
    if (!/www\.mmse-software\.com/.test(t)) errors.push('PDF: Herstellerzeile fehlt');
  }
  if (!/\/Subtype \/Image/.test(b.toString('latin1'))) errors.push('PDF: Logo/Fotos fehlen');
}
await page.getByLabel('Tiefenstaffel (m)').fill('1,5; 2,5');
{
  const p = await fileFrom('Aufmaß (PDF)');
  const t = pdfText(p);
  if (t !== null && (!/Aufmaß/.test(t) || !/S1005/.test(t) || !/über 1,50 bis 2,50 m/.test(t))) errors.push('Aufmaß-PDF: Inhalt/Tiefenstaffel fehlt');
}
{
  const p = await fileFrom('Aufmaß (Excel)');
  const b = readFileSync(p);
  if (b.subarray(0, 2).toString() !== 'PK') errors.push('Aufmaß-Excel ist keine XLSX-Datei');
  try {
    const x = execSync(`unzip -p "${p}" xl/worksheets/sheet1.xml`).toString();
    if (!/S1005/.test(x)) errors.push('Aufmaß-Excel: S1005 fehlt');
  } catch { /* unzip fehlt */ }
}
await page.screenshot({ path: `${outDir}/12d-berichte.png`, fullPage: true });

step('Höhenangaben auf „von oben“ umstellen');
await page.goBack();
await page.getByText('S1005', { exact: true }).click();
await page.getByRole('tab', { name: /Daten/ }).click();
await page.getByRole('radio', { name: 'von oben ↓' }).click();
await page.getByText('Anfang am Deckel = 0,00 m').waitFor();
await shot('12c-von-oben');
await page.goBack();
await page.getByRole('button', { name: 'Export & Berichte', exact: true }).click();
await page.getByRole('button', { name: 'Exportieren' }).waitFor();
{
  const z = await exportAs('2017-07');
  const expect = (re, msg) => { if (!re.test(z)) errors.push('Von oben: ' + msg); };
  expect(/<BezugspunktVertikal>2<\/BezugspunktVertikal>/, 'Bezugspunkt 2 fehlt');
  expect(/<VertikaleLage>0\.00<\/VertikaleLage>\s*<InspektionsKode>DDB<\/InspektionsKode>\s*<Streckenschaden>A</, 'DDB A bei 0,00 (Deckel) fehlt');
  expect(/<VertikaleLage>0\.90<\/VertikaleLage>\s*<InspektionsKode>DAB</, 'DAB 0,90 m ab Deckel fehlt');
  expect(/<VertikaleLage>2\.42<\/VertikaleLage>\s*<InspektionsKode>DDB<\/InspektionsKode>\s*<Streckenschaden>B</, 'DDB B bei 2,42 (Sohle) fehlt');
}

step('Protokoll');
await page.goBack();
await page.getByText('S1005', { exact: true }).click();
await page.getByRole('button', { name: 'Mehr' }).click();
{
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.getByText('Schachtprotokoll als PDF').click();
  const save = page.locator('.sheet').getByRole('button', { name: 'Speichern' });
  save.waitFor({ timeout: 3000 }).then(() => save.click()).catch(() => {});
  const d = await dl;
  if (!/^Schachtprotokoll_S1005_.*\.pdf$/.test(d.suggestedFilename())) errors.push('Einzelprotokoll: Dateiname ' + d.suggestedFilename());
  await d.saveAs(`${outDir}/${d.suggestedFilename()}`);
}
await page.getByRole('button', { name: 'Mehr' }).click();
await page.getByText('Schachtprotokoll (Druckansicht)').click();
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
