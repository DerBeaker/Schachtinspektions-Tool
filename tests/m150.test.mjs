import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseXml, decodeXmlBytes, child, children, text } from '../app/js/isybau/xml.js';
import { importStammdaten } from '../app/js/isybau/import.js';
import { newInspection, connectionsFromStamm } from '../app/js/isybau/model.js';
import { exportM150 } from '../app/js/isybau/m150.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = readFileSync(join(root, 'tests/fixtures/m150-stammdaten.xml'));

test('DWA-M 150: Stammdaten-Import mit Dezimalkomma, Geometrie und Rohrsohlen', () => {
  const r = importStammdaten(fixture);
  assert.equal(r.format, 'm150');
  assert.equal(r.crsLage, 'GK');
  assert.deepEqual(r.manholes.map((m) => m.name), ['S10', 'S11', 'S12']); // E1 ist kein Schacht
  const s11 = r.manholes.find((m) => m.name === 'S11');
  assert.equal(s11.tiefe, 2.1);
  assert.equal(s11.deckelhoehe, 102.1);
  assert.equal(s11.strasse, 'Testgasse');
  assert.equal(s11.schacht.dn, 1);
  const out = s11.pipes.find((p) => p.dir === 'out');
  assert.equal(out.name, 'H11-10');
  assert.equal(out.clock, 12);
  assert.equal(out.dnHoehe, 400);
  const zu = s11.pipes.find((p) => p.dir === 'in');
  assert.equal(zu.clock, 3); // Zulauf von Norden, Ablauf nach Westen -> 3 Uhr
  assert.equal(zu.hoeheUeberSohle, 0.3);
  assert.equal(zu.tiefeVonOben, 1.8);
  // Endschacht ohne Sohlpunkt: Bezug aus Deckelhöhe - Schachttiefe
  assert.equal(r.manholes[0].sohlhoehe, 99.8);
});

function sample(kodiersystem = '9') {
  const data = importStammdaten(fixture);
  let n = 0;
  const id = () => `id${++n}`;
  const project = { id: 'p', name: 'Test', auftraggeber: 'Stadt Neustadt', auftragNummer: '2026-017', kodiersystem, zweck: '1', crsHoehe: data.crsHoehe, crsLage: data.crsLage };
  const items = data.manholes.slice(1, 3).map((m, i) => {
    const insp = newInspection({ id: id(), project, manhole: m, inspector: 'Erika Müller', now: new Date(2026, 4, 12, 9, 30) });
    insp.connections = connectionsFromStamm(m, id);
    insp.overview.photoId = `ov${i}`;
    insp.status = 'fertig';
    insp.findings = [
      { id: id(), code: 'DAB', c1: 'B', c2: 'A', q1: '0.8', clockFrom: 3, bereich: 'C', lageMode: 'oben', lageValue: 0.9 },
      { id: id(), code: 'DAQ', c1: 'C', q1: '3', bereich: 'C', lageMode: 'oben', lageValue: 0.6, strecke: true, lageEndValue: 1.6, photoId: `ph${i}` },
    ];
    return { inspection: insp, manhole: m };
  });
  return { project, items };
}

test('DWA-M 150: Export Typ B (KG/KI/KZ, Dezimalkomma, Referenztabellen)', () => {
  const { project, items } = sample();
  const out = exportM150({ project, items, settings: { company: 'Kanalservice Müller GmbH' } });
  const s = Buffer.from(out.bytes).toString('latin1');
  assert.ok(s.startsWith('<?xml version="1.0" encoding="ISO-8859-1"'));
  assert.ok(s.includes('Müller')); // Latin-1
  const doc = parseXml(decodeXmlBytes(out.bytes));
  assert.equal(doc.name, 'DATA');
  assert.equal(text(doc, 'FD/FD001'), '04-2010');
  assert.equal(text(doc, 'FD/FD002'), 'B');
  const kgs = children(doc, 'KG');
  assert.deepEqual(kgs.map((k) => text(k, 'KG001')), ['S11', 'S12']);
  assert.equal(text(kgs[0], 'KG211'), '2,10');
  assert.equal(text(kgs[0], 'GO/GP/GP003'), '3456140,000');
  const ki = child(kgs[0], 'KI');
  assert.equal(text(ki, 'KI005'), 'DWAM149-2:2013');
  assert.equal(text(ki, 'KI101'), 'A');
  assert.equal(text(ki, 'KI104'), '12.05.2026');
  assert.equal(text(ki, 'KI118'), 'S11-001.jpg');
  const kz = children(ki, 'KZ');
  assert.equal(text(kz[0], 'KZ002'), 'DDB');
  assert.equal(text(kz[0], 'KZ017'), 'A');
  assert.equal(text(kz.at(-1), 'KZ002'), 'DDB');
  assert.equal(text(kz.at(-1), 'KZ017'), 'B');
  kz.forEach((z, i) => { if (text(z, 'KZ002') === 'DCA') assert.equal(text(kz[i + 1], 'KZ002'), 'DCG'); });
  const tiefen = kz.map((z) => Number(text(z, 'KZ001').replace(',', '.')));
  assert.deepEqual(tiefen, [...tiefen].sort((a, b) => a - b));
  assert.deepEqual(kz.filter((z) => text(z, 'KZ002') === 'DAQ').map((z) => text(z, 'KZ005')), ['A1', 'B1']);
  const dab = kz.find((z) => text(z, 'KZ002') === 'DAB');
  assert.equal(text(dab, 'KZ003'), '0,8');
  assert.equal(text(dab, 'KZ006'), '03');
  assert.match(text(kz.find((z) => text(z, 'KZ002') === 'DCG' && text(z, 'KZ015') === 'A'), 'KZ003'), /^300$/);
  // Referenztabellen: Straßen aus dem Import, Standardtabellen mit Text
  const rt = children(doc, 'RT').map((r) => `${text(r, 'RT001')}:${text(r, 'RT002')}=${text(r, 'RT004')}`);
  assert.ok(rt.includes('001:7=Testgasse'));
  assert.ok(rt.includes('124:J=Sohle'));
  assert.ok(rt.includes('202:DWAM149-2:2013=DWA-M 149 Teil 2:2013'));
  assert.equal(out.photos.length, 4);
  // erneuter Import der eigenen Datei
  const again = importStammdaten(out.bytes);
  assert.deepEqual(again.manholes.map((m) => m.name), ['S11', 'S12']);
  assert.equal(again.manholes[0].tiefe, 2.1);
});

test('DWA-M 150: BFR-Kodierung wird als EN 13508 gekennzeichnet', () => {
  const { project, items } = sample('10');
  const doc = parseXml(decodeXmlBytes(exportM150({ project, items }).bytes));
  assert.equal(text(children(doc, 'KG')[0], 'KI/KI005'), 'EN13508');
});
