import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { klassifiziereBefund, bewerteInspektion, klasseAusZahl, zusatzpunkte } from '../app/js/isybau/bewertung.js';
import { importDatei } from '../app/js/isybau/import.js';
import { newInspection, connectionsFromStamm } from '../app/js/isybau/model.js';
import { exportZustandsdaten } from '../app/js/isybau/export.js';
import { exportM150 } from '../app/js/isybau/m150.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const f = (o) => ({ id: 'f1', c1: '', c2: '', q1: '', lageMode: 'unten', lageValue: 1, ...o });

test('Einzelschadensklassen nach BFR-Tabelle (Schutzziele, Bereiche, Schwellwerte)', () => {
  // DAB B A (Riss längs) im Schachtaufbau: Dichtheit pauschal 2, Standsicherheit nach Rissbreite
  let k = klassifiziereBefund(f({ code: 'DAB', c1: 'B', c2: 'A', q1: 4, bereich: 'C' }));
  assert.deepEqual(k.D, { k: 2, pauschal: true });
  assert.deepEqual(k.S, { k: 3, pauschal: false }); // 3 ≤ x < 5
  assert.equal(k.B, null);
  k = klassifiziereBefund(f({ code: 'DAB', c1: 'B', c2: 'A', q1: 8, bereich: 'C' }));
  assert.equal(k.S.k, 5);
  // Gerinne: Dichtheit höher eingestuft, keine Standsicherheitszeile
  k = klassifiziereBefund(f({ code: 'DAB', c1: 'B', c2: 'A', q1: 4, bereich: 'I' }));
  assert.equal(k.D.k, 3);
  assert.equal(k.S, null);
  // Verformung: biegeweich/biegesteif unterschiedlich
  assert.equal(klassifiziereBefund(f({ code: 'DAA', c1: 'A', q1: 25, bereich: 'C' }), { werkstoff: 'PE' }).S.k, 2);
  assert.equal(klassifiziereBefund(f({ code: 'DAA', c1: 'A', q1: 25, bereich: 'C' }), { werkstoff: 'B' }).S.k, 3);
  assert.equal(klassifiziereBefund(f({ code: 'DAA', c1: 'A', q1: 25, bereich: 'C' }), { werkstoff: 'B' }).B.k, 3);
  // Feststellungen ohne Tabelle und fehlende Angaben
  assert.equal(klassifiziereBefund(f({ code: 'DCA', c1: 'B' })).klassifizierbar, false);
  assert.equal(klassifiziereBefund(f({ code: 'DAB', c1: 'B', c2: 'A', q1: 2 })).fehlt, 'Schachtbereich fehlt');
});

test('Zusatzpunkte, Schadenszahlen und Objektklasse', () => {
  assert.deepEqual(zusatzpunkte({ entwaesserungsart: 'KM', wasserschutzzone: '2', bodenart: '3' }), [70, 40, 40]);
  assert.equal(klasseAusZahl(0), 0);
  assert.equal(klasseAusZahl(99), 1);
  assert.equal(klasseAusZahl(400), 5);
  const manhole = { entwaesserungsart: 'KR', schacht: { material: 'B' } };
  const insp = {
    tiefe: 2.0, bezugVertikal: '1',
    findings: [
      // Strecke über 1,0 m: DAB B A 4 mm -> S3 (200) -> MaxSZe 200
      f({ id: 'a', code: 'DAB', c1: 'B', c2: 'A', q1: 4, bereich: 'C', strecke: true, lageValue: 0.5, lageEndValue: 1.5 }),
      // Punkt: DAQ B -> B5 pauschal (400), Regenwasser B +0
      f({ id: 'b', code: 'DAQ', c1: 'B', q1: 1, bereich: 'C' }),
    ],
  };
  const b = bewerteInspektion(insp, manhole, {});
  const a = b.befunde.find((e) => e.id === 'a');
  assert.equal(a.SZe.D, 70); // pauschal 2 -> 100, Regenwasser -30
  assert.equal(a.SZe.S, 200);
  assert.equal(a.MaxSZe, 200);
  assert.equal(a.dl, 1);
  assert.equal(b.OZv, 400);
  // SLZ = 200·1,0 + 400·0,5 = 400; 400/(400·2,0) = 0,5 -> 0,5·100 − 10 = 40
  assert.equal(b.SLZ, 400);
  assert.equal(b.SL, 40);
  assert.equal(b.OZe, 440);
  assert.equal(b.OK, 5);
  assert.equal(b.massgebend.code, 'DAQ B');
  assert.equal(b.pauschal, true);
  // schadensfrei
  assert.equal(bewerteInspektion({ tiefe: 2, findings: [] }, manhole, {}).OK, 0);
});

const samples = join(root, '.cache/isybau-samples/2024');
const stammFile = join(samples, 'ISYBAU_XML-2024-Stammdaten.xml');
const zustFile = join(samples, 'ISYBAU_XML-2024-Zustandsdaten_DIN_EN_13508-2_BFR_Abwasser_bewertet_Filme.xml');

test('Abgleich mit den bewerteten offiziellen ISYBAU-2024-Beispielschächten', { skip: !existsSync(zustFile) ? 'Beispieldaten fehlen (npm run xsd)' : false }, () => {
  const stamm = importDatei(readFileSync(stammFile)).stamm;
  const zust = importDatei(readFileSync(zustFile)).zustand;
  const byName = new Map(stamm.manholes.map((m) => [m.name, m]));
  let n = 0, befunde = 0;
  for (const v of zust.vorinspektionen) {
    if (!v.bewertungDatei) continue;
    const m = byName.get(v.objekt);
    const r = bewerteInspektion({ ...v, tiefe: m.tiefe }, m, {});
    assert.equal(r.OZe, Number(v.bewertungDatei.zahl), `Objektzahl ${v.objekt}`);
    assert.equal(r.OK, Number(v.bewertungDatei.klasse), `Objektklasse ${v.objekt}`);
    for (const x of v.findings.filter((y) => y.klassenDatei)) {
      const e = r.befunde.find((y) => y.id === x.id);
      const mine = Object.fromEntries(['D', 'S', 'B'].filter((z) => e.klassen[z]).map((z) => [z, e.klassen[z].k]));
      assert.deepEqual(mine, x.klassenDatei, `${v.objekt} ${x.code}`);
      befunde++;
    }
    n++;
  }
  assert.equal(n, 113);
  assert.ok(befunde > 100);
});

test('Vorinspektion: eigener ISYBAU- und M150-Export wird wieder eingelesen', () => {
  const data = importDatei(readFileSync(join(root, 'app/demo/demo-stammdaten.xml'))).stamm;
  const project = { id: 'p', name: 'Test', auftragKennung: 1, kodiersystem: '10' };
  const m = data.manholes.find((x) => x.name === 'S1005');
  const insp = newInspection({ id: 'i', project, manhole: m, now: new Date(2025, 2, 3, 8, 0) });
  insp.connections = connectionsFromStamm(m, (() => { let i = 0; return () => `c${++i}`; })());
  insp.findings = [
    { id: 'a', code: 'DAB', c1: 'B', c2: 'A', q1: '2', clockFrom: 3, bereich: 'C', lageMode: 'oben', lageValue: 0.9 },
    { id: 'b', code: 'DAQ', c1: 'C', q1: '3', bereich: 'C', lageMode: 'oben', lageValue: 0.6, strecke: true, lageEndValue: 1.6 },
  ];
  const items = [{ inspection: insp, manhole: m }];
  for (const out of [exportZustandsdaten({ project, items, version: '2017-07' }), exportM150({ project, items })]) {
    const r = importDatei(out.bytes);
    const v = r.zustand.vorinspektionen.find((x) => x.objekt === 'S1005');
    assert.ok(v, 'Vorinspektion fehlt');
    assert.equal(v.datum, '2025-03-03');
    assert.equal(v.tiefe, 2.42);
    assert.equal(v.connections.length, insp.connections.length);
    assert.ok(v.connections.some((c) => c.dir === 'out' && c.clock === 12));
    const dab = v.findings.find((x) => x.code === 'DAB');
    assert.deepEqual([dab.c1, dab.c2, Number(dab.q1), dab.clockFrom, dab.bereich, dab.lageMode, dab.lageValue], ['B', 'A', 2, 3, 'C', 'unten', 1.52]);
    const daq = v.findings.find((x) => x.code === 'DAQ');
    assert.equal(daq.strecke, true);
    assert.deepEqual([daq.lageValue, daq.lageEndValue], [0.82, 1.82]);
    // gleiche Bewertung wie das Original
    assert.equal(bewerteInspektion({ ...v }, m, project).OZe, bewerteInspektion(insp, m, project).OZe);
  }
});
