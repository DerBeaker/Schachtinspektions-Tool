import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  leereBauteile, normBauteile, hatBauteile, regelschacht, hoehenbilanz, bauteileZeilen, modellMasse, bauteileM150, schachtXml,
} from '../app/js/isybau/bauteile.js';
import { importDatei } from '../app/js/isybau/import.js';
import { newInspection } from '../app/js/isybau/model.js';
import { exportZustandsdaten } from '../app/js/isybau/export.js';
import { exportM150 } from '../app/js/isybau/m150.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const xsdDir = join(root, '.cache/isybau-xsd');
const XSD = { '2006-10': '2006/0610', '2013-02': '2013/1302', '2017-07': '2017/1707', '2024-06': '2024/2406' };
const sample = join(root, '.cache/isybau-samples/2024/ISYBAU_XML-2024-Stammdaten.xml');
const tmp = mkdtempSync(join(tmpdir(), 'sb-bt-'));
const hasXmllint = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function vollerSchacht() {
  const b = regelschacht();
  b.funktion = '15'; // erst ab ISYBAU 2024
  Object.assign(b.deckel, { material: 'GGG', schmutzfaenger: true });
  b.auflage = { anzahl: 2, hoehe: 12 };
  b.aufbau.hoehe = 1.55;
  b.unterteil.hoehe = 0.6;
  b.steig.anzahl = 7;
  Object.assign(b.unten, { aktiv: true, form: 'R', laenge: 1.2, hoehe: 0.4, uebergangsplatte: true, podest: true, material: 'B' });
  return b;
}

function demo() {
  const ms = importDatei(readFileSync(join(root, 'app/demo/demo-stammdaten.xml'))).stamm.manholes;
  const project = { id: 'p', name: 'Bauteile', kodiersystem: '10', auftragKennung: 1 };
  const m = ms.find((x) => x.name === 'S1005');
  const insp = newInspection({ id: 'i', project, manhole: m, now: new Date(2025, 4, 6, 9, 0) });
  insp.innenschutz = 'ZMS';
  insp.bauteile = vollerSchacht();
  return { project, items: [{ inspection: insp, manhole: m }], m, insp };
}

test('Datenmodell: leer, ergänzen, Vorlage, Beschreibung', () => {
  assert.equal(hatBauteile(leereBauteile()), false);
  assert.equal(hatBauteile(null), false);
  const n = normBauteile({ deckel: { klasse: 'D' } });
  assert.equal(n.deckel.klasse, 'D');
  assert.equal(n.aufbau.form, '');
  assert.equal(hatBauteile(n), true);
  const z = Object.fromEntries(bauteileZeilen(vollerSchacht()));
  assert.equal(z.Abdeckung, 'rund, Klasse D 400, Ø 625 mm, duktiles Gusseisen, mit Lüftungsöffnungen, mit Schmutzfänger');
  assert.equal(z.Auflageringe, '2 Stück, gesamt 12 cm');
  assert.equal(z.Schachtaufbau, 'rund, DN 1000, mit Konus, Höhe 1,55 m, Beton');
  assert.match(z['Untere Schachtzone'], /DN 1200, mit Übergangsplatte, mit Podest, Höhe 0,40 m/);
  assert.equal(z.Gerinne, 'Kreis bis Kämpfer, Beton');
  assert.equal(z.Steighilfen, 'Steigeisengang zweiläufig, kunststoffummanteltes Metall, 7 Stück');
  assert.equal(Object.fromEntries(bauteileZeilen({ steig: { vorhanden: false } })).Steighilfen, 'nicht vorhanden');
});

test('Höhenbilanz und Maße für das 3D-Modell', () => {
  const b = vollerSchacht();
  const hb = hoehenbilanz(b, 2.82);
  assert.equal(hb.summe, 2.67); // 0,12 + 1,55 + 0,40 + 0,60
  assert.equal(hb.rest, 0.15);
  assert.equal(hb.vollstaendig, true);
  assert.equal(hb.ok, true);
  assert.equal(hoehenbilanz(b, 2.2).ok, false);
  assert.equal(hoehenbilanz(regelschacht(), 2.4).vollstaendig, false);
  const M = modellMasse(b, 2.82);
  assert.equal(M.geschaetzt.length, 0);
  assert.ok(M.konus);
  assert.ok(Math.abs(M.z.auflage - 2.55) < 1e-9);
  assert.ok(Math.abs(M.z.rahmen - 2.67) < 1e-9);
  const L = modellMasse(null, null); // ohne alles: plausible Standardwerte, als geschätzt markiert
  assert.ok(L.T > 0 && L.dn === 1);
  assert.ok(L.geschaetzt.includes('Schachttiefe'));
});

test('3D-Maße folgen der Erfassung: nicht vorhandene Teile fehlen, Höhenänderungen wirken', () => {
  const b = regelschacht();
  b.aufbau.hoehe = 1.55;
  b.unterteil.hoehe = 0.6;
  b.auflage = { anzahl: 0, hoehe: 0 }; // keine Ausgleichsringe
  let M = modellMasse(b, 2.42);
  assert.equal(M.hAuflage, 0);
  assert.ok(!M.geschaetzt.some((x) => /Auflage/.test(x)));
  assert.equal(M.abweichung, 0);
  assert.ok(Math.abs(M.rahmen - 0.27) < 1e-9); // Rest bis zur Schachttiefe
  // Aufbau kürzer -> Modell wird niedriger statt den Rahmen zu strecken, Differenz wird gemeldet
  b.aufbau.hoehe = 1.0;
  M = modellMasse(b, 2.42);
  assert.ok(Math.abs(M.z.oben - 1.72) < 1e-9);
  assert.equal(M.abweichung, -0.7);
  // nicht erfasst = nicht gezeichnet
  const leer = modellMasse({ aufbau: { laenge: 1, hoehe: 1.8 }, unterteil: { hoehe: 0.5 } }, 2.42);
  assert.equal(leer.hAuflage, 0);
  assert.equal(leer.konus, false);
  assert.equal(leer.uebergangOffen, true);
  assert.equal(leer.steig, null);
  assert.equal(leer.gerinne, null);
  assert.equal(modellMasse({ aufbau: { konus: false, abdeckplatte: false } }, 2).uebergangOffen, false);
  assert.equal(Object.fromEntries(bauteileZeilen(b)).Auflageringe, 'keine');
});

test('Import: Bauteile aus den offiziellen ISYBAU-2024-Stammdaten', { skip: !existsSync(sample) && 'Beispieldaten fehlen (npm run xsd)' }, () => {
  const ms = importDatei(readFileSync(sample)).stamm.manholes;
  const m = ms.find((x) => x.name === '119001');
  assert.equal(m.bauteile.quelle, 'stamm');
  assert.deepEqual([m.bauteile.deckel.form, m.bauteile.deckel.laenge, m.bauteile.deckel.klasse], ['R', 0.68, 'D']);
  assert.deepEqual([m.bauteile.aufbau.form, m.bauteile.aufbau.konus, m.bauteile.aufbau.laenge, m.bauteile.aufbau.material], ['R', false, 1, 'B']);
  assert.deepEqual([m.bauteile.unterteil.hoehe, m.bauteile.unterteil.gerinneform], [0.6, '0']);
  assert.ok(ms.filter((x) => x.bauteile).length > 100);
  // neue Inspektion übernimmt die Bauteile
  const insp = newInspection({ id: 'x', project: { id: 'p' }, manhole: m });
  assert.equal(insp.bauteile.unterteil.hoehe, 0.6);
});

for (const [version, dir] of Object.entries(XSD)) {
  const xsd = join(xsdDir, `${dir}-metadaten.xsd`);
  test(`Export ${version}: Stammdatenkollektiv mit Bauteilen ist XSD-gültig und wird wieder eingelesen`, { skip: (!existsSync(xsd) || !hasXmllint) && 'XSD oder xmllint fehlt' }, () => {
    const { project, items } = demo();
    const out = exportZustandsdaten({ project, items, version });
    const f = join(tmp, `bt-${version}.xml`);
    writeFileSync(f, out.bytes);
    execFileSync('xmllint', ['--noout', '--schema', xsd, f], { stdio: 'pipe' });
    const back = importDatei(out.bytes);
    const b = back.stamm.manholes.find((x) => x.name === 'S1005').bauteile;
    assert.deepEqual(b.auflage, { anzahl: 2, hoehe: 12 });
    assert.equal(b.aufbau.hoehe, 1.55);
    assert.equal(b.unten.podest, true);
    assert.equal(b.steig.art, '2');
    assert.equal(b.deckel.schmutzfaenger, true);
    assert.equal(b.funktion, version >= '2024' ? '15' : '');
    assert.equal(back.zustand.vorinspektionen.length, 1);
    // ohne Stammdaten-Option bleibt es reine Zustandsdaten-Datei
    assert.doesNotMatch(exportZustandsdaten({ project, items, version, stammdaten: false }).xml, /Stammdatenkollektiv/);
  });
}

test('Schacht-Element: 2006/2013 mit Abdeckung im Schacht, ab 2017 Abdeckungen am Knoten', () => {
  const b = vollerSchacht();
  const alt = schachtXml(b, { version: '2006-10', tiefe: 2.82, innenschutz: 'NV' });
  const names = alt.schacht.filter(Boolean).map(([n]) => n);
  assert.ok(names.includes('Abdeckung'));
  assert.equal(alt.abdeckungen, null);
  assert.equal(alt.schacht.find((e) => e && e[0] === 'Innenschutz')[1], null); // „NV“ kennt 2006 nicht
  const neu = schachtXml(b, { version: '2017-07', tiefe: 2.82 });
  assert.ok(neu.schacht.some((e) => e && e[0] === 'Auflagering'));
  assert.equal(neu.abdeckungen[0][0], 'Deckel');
  // leeres Schacht-Element vermeiden (Knoten verlangt Inhalt)
  assert.deepEqual(schachtXml({ deckel: { klasse: 'D' } }, { version: '2017-07' }).schacht[0], ['SchachtFunktion', '1']);
});

test('DWA-M 150: Bauteile als KG-Felder in beiden Schlüsselvarianten, Rücklesen', () => {
  const b = vollerSchacht();
  b.deckel.form = 'RV';
  const isy = bauteileM150(b, { variante: 'isybau', innenschutz: 'ZMS' });
  assert.deepEqual([isy.KG307, isy.KG308, isy.KG310, isy.KG312, isy.KG314, isy.KG316, isy.KG323, isy.KG324, isy.KG325, isy.KG321], ['R', '1000', 'RV', 'D', '625', '0', '2', '7', '5', 'ZMS']);
  const dwa = bauteileM150(b, { variante: 'dwa', innenschutz: 'ZMS' });
  assert.deepEqual([dwa.KG310, dwa.KG315, dwa.KG323, dwa.KG321], ['R', 'J', 'SE2', undefined]);
  for (const variante of ['isybau', 'dwa']) {
    const { project, items } = demo();
    items[0].inspection.bauteile.deckel.form = 'RV';
    const out = exportM150({ project, items, variante });
    assert.match(out.xml, /<KG314>625<\/KG314>/);
    const back = importDatei(out.bytes).stamm.manholes.find((x) => x.name === 'S1005').bauteile;
    assert.equal(back.deckel.form, 'RV', variante);
    assert.equal(back.deckel.laenge, 0.625);
    assert.equal(back.steig.art, '2');
    assert.equal(back.steig.anzahl, 7);
    assert.equal(back.unterteil.gerinneform, '0');
    // Referenztabelle für die Steighilfen-Werkstoffe ist dabei
    assert.match(out.xml, /<RT001>122<\/RT001>/);
  }
});
