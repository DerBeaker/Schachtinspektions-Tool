// Browser-Test für den direkt verbundenen Bluetooth-Laser (Web Bluetooth simuliert: Leica DISTO und Bosch GLM).
// Aufruf (App läuft, z. B. npm run serve): node tools/e2e-laser.mjs http://127.0.0.1:8080/ /tmp/e2e-laser
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }));

const [url = 'http://127.0.0.1:8080/', out = '/tmp/e2e-laser'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fehler = [];
const pruefe = (ok, text) => { console.log(ok ? '  ok  ' : '  FEHLER', text); if (!ok) fehler.push(text); };

// Simuliertes Web Bluetooth: ein Gerät je Test, Messung per window.__mess(meter)
const fake = ({ typ }) => {
  const L = '-f831-4395-b29d-570977d5bf94', B = '-0451-4000-b000-fb3210111989';
  const ziel = () => { const t = new EventTarget(); t.listeners = 0; return t; };
  const char = (uuid) => {
    const c = Object.assign(ziel(), { uuid, value: null, notify: false, written: [] });
    c.startNotifications = async () => { c.notify = true; return c; };
    c.readValue = async () => c.value;
    c.writeValueWithResponse = async (buf) => { c.written.push([...new Uint8Array(buf.buffer || buf)]); };
    c.fire = (bytes) => { c.value = new DataView(bytes.buffer); if (c.notify) c.dispatchEvent(Object.assign(new Event('characteristicvaluechanged'), {})); };
    // e.target.value muss gesetzt sein: Event-Target ist c selbst
    return c;
  };
  const dist = char('3ab10101' + L), einheit = char('3ab10102' + L), bosch = char('02a6c0d1' + B);
  const device = Object.assign(ziel(), { name: typ === 'bosch' ? 'GLM 50-27 C' : 'DISTO D2 12345' });
  device.gatt = {
    connected: false,
    connect: async () => { device.gatt.connected = true; window.__verbindungen = (window.__verbindungen || 0) + 1; return server; },
    disconnect: () => { device.gatt.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
  };
  const server = {
    getPrimaryService: async (u) => {
      if (typ === 'leica' && u === '3ab10100' + L) return { getCharacteristics: async () => [dist, einheit] };
      if (typ === 'bosch' && u === '02a6c0d0' + B) return { getCharacteristic: async () => bosch };
      throw Object.assign(new Error('No Services matching UUID found in Device.'), { name: 'NotFoundError' });
    },
  };
  window.__abbrechen = false;
  navigator.bluetooth = {
    requestDevice: async (opt) => {
      window.__filter = opt;
      if (window.__abbrechen) throw Object.assign(new Error('User cancelled the requestDevice() chooser.'), { name: 'NotFoundError' });
      return device;
    },
  };
  window.__mess = (m) => {
    if (typ === 'leica') {
      const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, m, true);
      dist.fire(new Uint8Array(d.buffer));
      einheit.fire(new Uint8Array([0, 0])); // D2 meldet danach die Einheit – darf nicht doppelt eintragen
    } else {
      const p = new Uint8Array(20); p.set([0xc0, 0x55, 0x10, 0x06, 0x08, 0x00, 0x00]);
      new DataView(p.buffer).setFloat32(7, m, true);
      bosch.fire(p);
    }
  };
  window.__trennen = () => device.gatt.disconnect();
  window.__geschrieben = () => bosch.written;
};

const browser = await chromium.launch();

// ---- Leica DISTO -----------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE' });
  await ctx.addInitScript(fake, { typ: 'leica' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fehler.push('JS-Fehler: ' + e.message));
  await page.goto(url + '#/settings');
  const karte = page.locator('.card', { hasText: 'Laser-Entfernungsmesser' });
  await karte.waitFor();
  pruefe(await karte.getByText('Tastaturmodus – geht überall').isVisible(), 'Einstellungen erklären den Tastaturmodus');
  pruefe(!(await page.locator('.topbar .laser-status').isVisible()), 'Kopfzeile ohne Laser-Symbol, solange nichts verbunden ist');

  await page.evaluate(() => { window.__abbrechen = true; });
  await karte.getByRole('button', { name: 'Laser verbinden' }).click();
  await page.waitForTimeout(300);
  pruefe(!(await page.locator('.toast-error').isVisible().catch(() => false)), 'Abbruch im Auswahl-Dialog ohne Fehlermeldung');
  await page.evaluate(() => { window.__abbrechen = false; });

  await karte.getByRole('button', { name: 'Laser verbinden' }).click();
  await karte.getByText('DISTO D2 12345: verbunden').waitFor();
  pruefe(true, 'Leica verbunden, Name angezeigt');
  const filter = await page.evaluate(() => window.__filter);
  pruefe(filter.optionalServices.includes('3ab10100-f831-4395-b29d-570977d5bf94'), 'Leica-Dienst angefragt');
  pruefe(await page.locator('.topbar .laser-status.verbunden').isVisible(), 'Bluetooth-Symbol in der Kopfzeile (verbunden)');

  const probe = karte.getByPlaceholder('antippen und am Laser messen');
  await probe.click();
  await page.evaluate(() => window.__mess(2.3456));
  await page.waitForTimeout(150);
  pruefe((await probe.inputValue()) === '2,346', `Probemessung eingetragen (${await probe.inputValue()})`);
  pruefe(await karte.getByText('Letzter Messwert: 2,346 m').isVisible(), 'letzter Messwert angezeigt');

  // ohne Maßfeld: nur Hinweis
  await page.locator('body').click({ position: { x: 5, y: 400 } });
  await page.getByLabel('Name des Inspekteurs').click();
  await page.evaluate(() => window.__mess(1.111));
  await page.getByText('Laser: 1,111 m – zum Übernehmen zuerst ein Maßfeld antippen.').waitFor();
  pruefe((await page.getByLabel('Name des Inspekteurs').inputValue()) === '', 'Textfeld bleibt unberührt');
  await page.screenshot({ path: join(out, '1-einstellungen.png'), fullPage: true });

  // Inspektion: Schachttiefe per Laser
  await page.evaluate(() => { location.hash = '#/'; }); // gleiche Seite – Verbindung bleibt bestehen
  await page.getByRole('button', { name: 'Demo ansehen' }).click();
  await page.getByText('S1005', { exact: true }).click();
  await page.getByRole('tab', { name: /Daten/ }).click();
  const tiefe = page.locator('.card', { hasText: 'Tiefe & Bezug' }).locator('input[data-laser="m"]').first();
  await tiefe.waitFor();
  pruefe(await page.locator('.card', { hasText: 'Tiefe & Bezug' }).getByText(/Laser verbunden \(DISTO D2 12345\)/).isVisible(), 'Inspektion zeigt verbundenen Laser');
  await tiefe.click();
  await page.evaluate(() => window.__mess(2.48));
  await page.waitForTimeout(400);
  pruefe((await tiefe.inputValue()) === '2,48', `Schachttiefe per Laser (${await tiefe.inputValue()})`);
  pruefe(await page.locator('.card', { hasText: 'Tiefe & Bezug' }).getByText('gemessen', { exact: true }).isVisible().catch(() => false)
    || await page.getByText(/gemessen/).first().isVisible(), 'Tiefe als gemessen markiert');
  const gespeichert = await page.evaluate(async () => {
    const req = indexedDB.open('schachtblick');
    const db = await new Promise((r) => { req.onsuccess = () => r(req.result); });
    const tx = db.transaction('inspections');
    const alle = await new Promise((r) => { const q = tx.objectStore('inspections').getAll(); q.onsuccess = () => r(q.result); });
    return alle.map((i) => i.tiefe);
  }).catch((e) => 'Fehler: ' + e.message);
  pruefe(Array.isArray(gespeichert) && gespeichert.includes(2.48), `Tiefe gespeichert (${JSON.stringify(gespeichert)})`);
  await page.screenshot({ path: join(out, '2-inspektion.png') });

  // Laser schaltet sich ab → getrennt, Antippen verbindet neu
  await page.evaluate(() => window.__trennen());
  await page.locator('.topbar .laser-status.getrennt').waitFor();
  pruefe(true, 'getrennt angezeigt');
  await page.locator('.topbar .laser-status').click();
  await page.locator('.topbar .laser-status.verbunden').waitFor();
  pruefe((await page.evaluate(() => window.__verbindungen)) === 2, 'neu verbunden ohne Auswahl-Dialog');
  await ctx.close();
}

// ---- Bosch GLM ---------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
  await ctx.addInitScript(fake, { typ: 'bosch' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fehler.push('JS-Fehler: ' + e.message));
  await page.goto(url + '#/settings');
  const karte = page.locator('.card', { hasText: 'Laser-Entfernungsmesser' });
  await karte.getByRole('button', { name: 'Laser verbinden' }).click();
  await karte.getByText('GLM 50-27 C: verbunden').waitFor();
  const geschrieben = await page.evaluate(() => window.__geschrieben());
  pruefe(JSON.stringify(geschrieben) === JSON.stringify([[0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a]]), `Bosch: Sync-Befehl gesendet (${JSON.stringify(geschrieben)})`);
  const probe = karte.getByPlaceholder('antippen und am Laser messen');
  await probe.click();
  await page.evaluate(() => window.__mess(1.825));
  await page.waitForTimeout(150);
  pruefe((await probe.inputValue()) === '1,825', `Bosch-Messwert eingetragen (${await probe.inputValue()})`);
  await karte.getByRole('button', { name: 'Trennen' }).click();
  await karte.getByText('Laser nicht verbunden').waitFor();
  pruefe(!(await page.locator('.topbar .laser-status').isVisible()), 'nach Trennen kein Symbol mehr');
  await ctx.close();
}

// ---- Browser ohne Web Bluetooth (Safari/iPhone) --------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'de-DE' });
  await ctx.addInitScript(() => { try { delete Navigator.prototype.bluetooth; } catch { /* */ } Object.defineProperty(navigator, 'bluetooth', { value: undefined }); });
  const page = await ctx.newPage();
  await page.goto(url + '#/settings');
  const karte = page.locator('.card', { hasText: 'Laser-Entfernungsmesser' });
  await karte.waitFor();
  pruefe(await karte.getByText(/kann Laser nicht direkt verbinden/).isVisible(), 'ohne Web Bluetooth: Hinweis auf Tastaturmodus');
  pruefe((await karte.getByRole('button', { name: 'Laser verbinden' }).count()) === 0, 'ohne Web Bluetooth: kein Verbinden-Knopf');
  await ctx.close();
}

await browser.close();
console.log(fehler.length ? `\n${fehler.length} Fehler` : '\nalles ok');
process.exit(fehler.length ? 1 : 0);
