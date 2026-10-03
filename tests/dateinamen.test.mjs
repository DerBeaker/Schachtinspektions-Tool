// Dateinamen im Export: Fotomuster mit Platzhaltern, Übersichtsfoto = Nr. 001, eindeutige Namen,
// Berichtnamen je Schacht, doppelte Schachtnamen, Berichtnummern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importStammdaten } from '../app/js/isybau/import.js';
import { newInspection, connectionsFromStamm } from '../app/js/isybau/model.js';
import { exportZustandsdaten } from '../app/js/isybau/export.js';
import { exportM150 } from '../app/js/isybau/m150.js';
import { protokollPdf } from '../app/js/report/protokoll.js';
import {
  dateiTeil, musterAnwenden, fotoBenenner, berichtNamen, doppelteSchaechte, berichtNummernVergeben, FOTO_MUSTER,
} from '../app/js/isybau/dateinamen.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const id = () => `id${++n}`;

function beispiel() {
  const data = importStammdaten(readFileSync(join(root, 'app/demo/demo-stammdaten.xml')));
  const project = { id: 'p1', name: 'Demo Musterweg', auftragNummer: 'A-2026/17', auftragBezeichnung: 'Schachtinspektion', auftragKennung: 1, kodiersystem: '10', crsHoehe: data.crsHoehe };
  const items = data.manholes.slice(1, 3).map((m, i) => {
    const insp = newInspection({ id: id(), project, manhole: m, inspector: 'Erika Müller', now: new Date(2026, 9, 3, 9, 30) });
    insp.connections = connectionsFromStamm(m, id);
    insp.connections[0].photoId = `anschluss-${i}`;
    insp.overview.photoId = `oben-${i}`;
    insp.berichtNr = String(i + 7).padStart(3, '0');
    insp.findings = [{ id: id(), code: 'DAB', c1: 'B', c2: 'A', q1: '0.8', clockFrom: 3, bereich: 'C', lageMode: 'oben', lageValue: 0.9, photoId: `riss-${i}` }];
    return { inspection: insp, manhole: m };
  });
  return { project, items };
}

test('Dateinamen: Umlaute, Sonderzeichen, leere Platzhalter', () => {
  assert.equal(dateiTeil('Schacht Ö/12 „Süd“'), 'Schacht_Oe_12_Sued');
  assert.equal(musterAnwenden('{Schacht}_{Datum}_{Bericht}_{Nr}', { schacht: 'S 10', datum: '20261003', bericht: '', nr: '001' }), 'S_10_20261003_001');
  assert.equal(musterAnwenden('{schacht}-{NR}', { schacht: 'S1005', nr: '002' }), 'S1005-002', 'Platzhalter ohne Groß-/Kleinschreibung');
  assert.equal(musterAnwenden('Foto {Unbekannt} {Nr}', { nr: '003' }), 'Foto_003');
});

test('Fotos: Übersichtsfoto zuerst (001), Muster mit Datum und Bericht, eindeutig im Export', () => {
  const { project, items } = beispiel();
  const muster = '{Schacht}_{Datum}_{Bericht}_{Nr}';
  const out = exportZustandsdaten({ project, items, version: '2017-07', fotoMuster: muster });
  const [a] = items;
  const name = a.manhole.name;
  const erstes = out.photos.find((p) => p.id === 'oben-0');
  assert.equal(erstes.file, `${dateiTeil(name)}_20261003_007_001.jpg`);
  assert.match(out.xml, new RegExp(`<InspektionsKode>DDA</InspektionsKode>[\\s\\S]*?<Fotodatei>${erstes.file}</Fotodatei>`));
  assert.equal(new Set(out.photos.map((p) => p.file.toLowerCase())).size, out.photos.length);
  // ohne {Nr}: trotzdem eindeutige Namen
  const ohneNr = exportZustandsdaten({ project, items, version: '2017-07', fotoMuster: '{Auftrag}' });
  assert.deepEqual(ohneNr.photos.slice(0, 3).map((p) => p.file), ['A-2026_17.jpg', 'A-2026_17_2.jpg', 'A-2026_17_3.jpg']);
  // mit Kode: Übersicht = DDA
  const kode = exportZustandsdaten({ project, items, version: '2017-07', fotoMuster: '{Schacht}_{Kode}_{Nr}' });
  assert.equal(kode.photos[0].file, `${dateiTeil(name)}_DDA_001.jpg`);
  assert.ok(kode.photos.some((p) => p.file === `${dateiTeil(name)}_DAB_003.jpg`));
});

test('Fotos: DWA-M 150 nutzt dieselben Namen, Übersichtsfoto in KI118', () => {
  const { project, items } = beispiel();
  const out = exportM150({ project, items, fotoMuster: '{Schacht}_{Datum}_{Nr}' });
  const ueb = `${dateiTeil(items[0].manhole.name)}_20261003_001.jpg`;
  assert.match(out.xml, new RegExp(`<KI118>${ueb}</KI118>`));
  assert.ok(out.photos.some((p) => p.file === ueb));
});

test('Fotos: XSD-gültig mit eigenem Muster (falls Schemata geladen)', { skip: !existsSync(join(root, '.cache/isybau-xsd/2017/1707-metadaten.xsd')) && 'XSD fehlt (npm run xsd)' }, () => {
  const { project, items } = beispiel();
  const out = exportZustandsdaten({ project, items, version: '2017-07', fotoMuster: '{Auftrag}_{Schacht}_{Datum}_{Nr}' });
  const f = join(mkdtempSync(join(tmpdir(), 'sbnamen-')), 'x.xml');
  writeFileSync(f, out.bytes);
  execFileSync('xmllint', ['--noout', '--schema', join(root, '.cache/isybau-xsd/2017/1707-metadaten.xsd'), f], { stdio: 'pipe' });
});

test('Protokoll nennt dieselben Fotonamen wie der Export', () => {
  const { project, items } = beispiel();
  const muster = '{Schacht}_{Datum}_{Nr}';
  const pdf = protokollPdf({ project, entries: items.map(({ manhole, inspection }) => ({ manhole, inspection })), optionen: { fotoMuster: muster } });
  let text = null;
  try { text = execFileSync('pdftotext', ['-', '-'], { input: Buffer.from(pdf) }).toString(); } catch { /* pdftotext fehlt */ }
  if (text) {
    const exp = exportZustandsdaten({ project, items, version: '2017-07', fotoMuster: muster });
    const riss = exp.photos.find((p) => p.id === 'riss-0').file;
    assert.ok(text.includes(riss), `${riss} fehlt im Protokoll`);
    assert.match(text, /Bericht-Nr\.\s+007/);
  }
});

test('Berichtnamen je Schacht, doppelte Schächte, Berichtnummern', () => {
  const { project, items } = beispiel();
  const namen = berichtNamen(items, { muster: '{Bericht}_{Schacht}', project });
  assert.equal(namen[0], `007_${dateiTeil(items[0].manhole.name)}.pdf`);
  assert.deepEqual(berichtNamen([items[0], items[0]], { muster: 'Protokoll', project }), ['Protokoll.pdf', 'Protokoll_2.pdf']);
  assert.deepEqual(doppelteSchaechte([{ manhole: { name: 'S1' } }, { manhole: { name: ' s1 ' } }, { manhole: { name: 'S2' } }]), ['S1']);
  const alle = [{ berichtNr: '004' }, { berichtNr: '' }, { berichtNr: 'B-7' }, {}];
  const neu = berichtNummernVergeben(alle, alle);
  assert.deepEqual(alle.map((i) => i.berichtNr), ['004', '005', 'B-7', '006']);
  assert.equal(neu.length, 2);
  assert.ok(FOTO_MUSTER.every(([m]) => /\{Schacht\}/.test(m)));
});
