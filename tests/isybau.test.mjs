import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseXml, decodeXmlBytes, text, children } from '../app/js/isybau/xml.js';
import { importStammdaten } from '../app/js/isybau/import.js';
import { newInspection, connectionsFromStamm, verticalPosition, buildRecords } from '../app/js/isybau/model.js';
import { exportZustandsdaten } from '../app/js/isybau/export.js';
import { validateFinding, validateInspection } from '../app/js/isybau/validate.js';
import { zipParts, concat, crc32 } from '../app/js/lib/zip.js';
import { toWgs84, bearingToClock } from '../app/js/lib/geo.js';
import { CODES, c2Options, quantDef } from '../app/js/data/codes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = readFileSync(join(root, 'app/demo/demo-stammdaten.xml'));

let n = 0;
const id = () => `id${++n}`;

function sampleProject() {
  const data = importStammdaten(demo);
  const project = { id: 'p1', name: 'Demo Musterweg', auftragBezeichnung: 'Schachtinspektion Musterweg', auftragKennung: 1, kodiersystem: '10', crsHoehe: data.crsHoehe };
  const items = data.manholes.slice(1, 4).map((m, i) => {
    m.id = `m${i}`;
    const insp = newInspection({ id: id(), project, manhole: m, inspector: 'Erika Müller', now: new Date(2026, 4, 12, 9, 30) });
    insp.connections = connectionsFromStamm(m, id);
    insp.overview.photoId = `overview-${i}`;
    insp.findings = [
      { id: id(), code: 'DAB', c1: 'B', c2: 'A', q1: '0.8', clockFrom: 3, bereich: 'C', lageMode: 'oben', lageValue: 0.9 },
      { id: id(), code: 'DAQ', c1: 'C', q1: '3', bereich: 'C', lageMode: 'oben', lageValue: 0.6, strecke: true, lageEndValue: 1.6, photoId: `ph-${i}` },
      { id: id(), code: 'DAR', c1: 'G', q1: '20', bereich: 'A', lageMode: 'oben', lageValue: 0 },
      { id: id(), code: 'DBF', c1: 'B', c2: 'A', clockFrom: 9, clockTo: 11, bereich: 'C', lageMode: 'unten', lageValue: 1.1, kommentar: 'Feuchte Fuge – Ø 3 cm', source: 'ai' },
    ];
    return { inspection: insp, manhole: m };
  });
  return { data, project, items };
}

test('XML-Parser: Entities, CDATA, Kommentare, Namespaces', () => {
  const x = parseXml('<?xml version="1.0"?><!-- c --><a:Root xmlns:a="x"><B k="1&amp;2">T&lt;&#x20AC;&#228;</B><C><![CDATA[<raw>]]></C><D/></a:Root>');
  assert.equal(x.name, 'Root');
  assert.equal(text(x, 'B'), 'T<€ä');
  assert.equal(children(x, 'B')[0].attrs.k, '1&2');
  assert.equal(text(x, 'C'), '<raw>');
  assert.equal(children(x, 'D').length, 1);
});

test('ISO-8859-1 wird anhand der XML-Deklaration erkannt', () => {
  const bytes = Uint8Array.from([...Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><a>'), 0xfc, ...Buffer.from('</a>')]);
  assert.equal(text({ name: '#', children: [parseXml(decodeXmlBytes(bytes))] }, 'a'), 'ü');
});

test('Stammdaten-Import: Schächte, Tiefen und Anschlüsse', () => {
  const r = importStammdaten(demo);
  assert.equal(r.version, '2017-07');
  assert.equal(r.manholes.length, 8);
  const s5 = r.manholes.find((m) => m.name === 'S1005');
  assert.equal(s5.tiefe, 2.42);
  assert.equal(s5.pipes.length, 4);
  const out = s5.pipes.find((p) => p.dir === 'out');
  assert.equal(out.clock, 12);
  assert.equal(out.isReference, true);
  const se = s5.pipes.find((p) => p.name === 'S1005-SE1');
  assert.equal(se.dir, 'in');
  assert.equal(se.hoeheUeberSohle, 0.95);
  assert.equal(se.dnHoehe, 150);
  assert.ok(se.clock >= 1 && se.clock <= 12);
});

test('Uhrzeit aus Richtung (Draufsicht, im Uhrzeigersinn)', () => {
  assert.equal(bearingToClock(90, 0), 3);
  assert.equal(bearingToClock(180, 0), 6);
  assert.equal(bearingToClock(270, 0), 9);
  assert.equal(bearingToClock(0, 0), 12);
  assert.equal(bearingToClock(10, 100), 9);
});

test('Vertikale Lage: Umrechnung oben/unten je Bezugspunkt', () => {
  const insp = { tiefe: 2.5, bezugVertikal: '1' };
  assert.equal(verticalPosition(insp, 'unten', 0.4), 0.4);
  assert.equal(verticalPosition(insp, 'oben', 0.4), 2.1);
  insp.bezugVertikal = '2';
  assert.equal(verticalPosition(insp, 'oben', 0.4), 0.4);
  assert.equal(verticalPosition(insp, 'unten', 0.4), 2.1);
  assert.equal(verticalPosition({ tiefe: null, bezugVertikal: '1' }, 'oben', 1), null);
});

test('Datensätze: DDB A zuerst, DDB B zuletzt, DCG direkt nach DCA, Strecke A/B', () => {
  const { items } = sampleProject();
  const recs = buildRecords(items[0].inspection, { photoName: (x) => x + '.jpg' });
  assert.equal(recs[0].InspektionsKode, 'DDB');
  assert.equal(recs[0].Streckenschaden, 'A');
  assert.equal(recs.at(-1).InspektionsKode, 'DDB');
  assert.equal(recs.at(-1).Streckenschaden, 'B');
  recs.forEach((r, i) => {
    assert.equal(r.Index, String(i + 1));
    if (r.InspektionsKode === 'DCA') assert.equal(recs[i + 1].InspektionsKode, 'DCG');
  });
  const verts = recs.map((r) => Number(r.VertikaleLage));
  assert.deepEqual(verts, [...verts].sort((a, b) => a - b));
  const st = recs.filter((r) => r.InspektionsKode === 'DAQ');
  assert.deepEqual(st.map((r) => [r.Streckenschaden, r.StreckenschadenLfdNr]), [['A', '1'], ['B', '1']]);
});

test('Höhenangaben von oben: Anfang am Deckel = 0,00, Ende an der Sohle = Tiefe', () => {
  const { items } = sampleProject();
  const insp = items[0].inspection;
  insp.bezugVertikal = '2';
  const recs = buildRecords(insp, { photoName: (x) => x + '.jpg' });
  assert.equal(recs[0].InspektionsKode, 'DDB');
  assert.equal(recs[0].Streckenschaden, 'A');
  assert.equal(recs[0].VertikaleLage, '0.00');
  assert.equal(recs.at(-1).InspektionsKode, 'DDB');
  assert.equal(recs.at(-1).VertikaleLage, Number(insp.tiefe).toFixed(2));
  const verts = recs.map((r) => Number(r.VertikaleLage));
  assert.deepEqual(verts, [...verts].sort((a, b) => a - b));
  // DAB wurde „0,90 m ab Deckel“ erfasst -> von oben 0,90
  assert.equal(recs.find((r) => r.InspektionsKode === 'DAB').VertikaleLage, '0.90');
  // und von unten: Tiefe - 0,90
  insp.bezugVertikal = '1';
  const up = buildRecords(insp, { photoName: (x) => x + '.jpg' });
  assert.equal(up[0].VertikaleLage, '0.00');
  assert.equal(up.find((r) => r.InspektionsKode === 'DAB').VertikaleLage, (Number(insp.tiefe) - 0.9).toFixed(2));
});

test('Stammdaten nur mit Haltungen: Schächte werden aus den Haltungsenden abgeleitet', () => {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<Identifikation xmlns="http://www.ofd-hannover.la/Identifikation"><Version>2006-10</Version><Admindaten/><Datenkollektive><Stammdatenkollektiv><Kennung>STA01</Kennung>
<AbwassertechnischeAnlage><Objektbezeichnung>H1</Objektbezeichnung><Objektart>1</Objektart><Kante><KantenTyp>0</KantenTyp>
  <KnotenZulauf>S1</KnotenZulauf><KnotenZulaufTyp>0</KnotenZulaufTyp><KnotenAblauf>S2</KnotenAblauf><KnotenAblaufTyp>0</KnotenAblaufTyp>
  <SohlhoeheZulauf>100.50</SohlhoeheZulauf><SohlhoeheAblauf>100.20</SohlhoeheAblauf><Profil><Profilhoehe>300</Profilhoehe></Profil></Kante>
  <Lage><Strassenname>Testweg</Strassenname></Lage>
  <Geometrie><Geometriedaten><Kanten><Kante><Start><Rechtswert>500000</Rechtswert><Hochwert>5600040</Hochwert></Start><Ende><Rechtswert>500000</Rechtswert><Hochwert>5600000</Hochwert></Ende></Kante></Kanten></Geometriedaten></Geometrie></AbwassertechnischeAnlage>
<AbwassertechnischeAnlage><Objektbezeichnung>H2</Objektbezeichnung><Objektart>1</Objektart><Kante><KantenTyp>0</KantenTyp>
  <KnotenZulauf>S2</KnotenZulauf><KnotenZulaufTyp>0</KnotenZulaufTyp><KnotenAblauf>S3</KnotenAblauf><KnotenAblaufTyp>0</KnotenAblaufTyp>
  <SohlhoeheZulauf>100.10</SohlhoeheZulauf><Profil><Profilhoehe>400</Profilhoehe></Profil></Kante>
  <Geometrie><Geometriedaten><Kanten><Kante><Start><Rechtswert>500000</Rechtswert><Hochwert>5600000</Hochwert></Start><Ende><Rechtswert>499960</Rechtswert><Hochwert>5600000</Hochwert></Ende></Kante></Kanten></Geometriedaten></Geometrie></AbwassertechnischeAnlage>
</Stammdatenkollektiv></Datenkollektive></Identifikation>`;
  const r = importStammdaten(xml);
  assert.deepEqual(r.manholes.map((m) => m.name), ['S1', 'S2', 'S3']);
  const s2 = r.manholes[1];
  assert.equal(s2.abgeleitet, true);
  assert.equal(s2.strasse, 'Testweg');
  assert.equal(s2.x, 500000);
  const zu = s2.pipes.find((p) => p.dir === 'in');
  assert.equal(zu.clock, 3); // Zulauf von Norden, Ablauf nach Westen
  assert.equal(zu.hoeheUeberSohle, 0.1);
  assert.equal(s2.tiefe, null);
});

test('Export: Struktur, Fotonamen, Kodierung', () => {
  const { project, items } = sampleProject();
  const out = exportZustandsdaten({ project, items, settings: { company: 'Kanalservice Müller GmbH' }, version: '2017-07' });
  assert.equal(out.count, 3);
  assert.match(out.photos[0].file, /^S1002-001\.jpg$/);
  // Latin-1: ü als einzelnes Byte, Zeichen außerhalb als Referenz
  const s = Buffer.from(out.bytes).toString('latin1');
  assert.ok(s.includes('Müller'));
  assert.ok(s.includes('&#x2013;'));
  const doc = parseXml(decodeXmlBytes(out.bytes));
  assert.equal(text(doc, 'Version'), '2017-07');
  const anlagen = children(doc, 'Datenkollektive/Zustandsdatenkollektiv/InspizierteAbwassertechnischeAnlage');
  assert.equal(anlagen.length, 3);
  assert.equal(text(anlagen[0], 'Anlagentyp'), '3');
});

const xsd = {
  '2006-10': join(root, '.cache/isybau-xsd/2006/0610-metadaten.xsd'),
  '2013-02': join(root, '.cache/isybau-xsd/2013/1302-metadaten.xsd'),
  '2017-07': join(root, '.cache/isybau-xsd/2017/1707-metadaten.xsd'),
  '2024-06': join(root, '.cache/isybau-xsd/2024/2406-metadaten.xsd'),
};
const hasXmllint = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

for (const version of Object.keys(xsd)) {
  for (const kodiersystem of ['10', '9']) {
    test(`Export ${version} (Kodiersystem ${kodiersystem}) ist gültig gegen das offizielle XSD`, { skip: !hasXmllint || !existsSync(xsd[version]) ? 'XSD nicht vorhanden (npm run xsd)' : false }, () => {
      const { project, items } = sampleProject();
      project.kodiersystem = kodiersystem;
      if (kodiersystem === '9') items.forEach((i) => { i.inspection.bezugVertikal = '2'; }); // auch „von oben“ prüfen
      items[0].inspection.findings.push({ id: id(), code: 'DDE', c1: 'A', bereich: 'J', lageMode: 'unten', lageValue: 0.2, drainage: true });
      const out = exportZustandsdaten({ project, items, settings: { company: 'Test GmbH' }, version });
      const dir = mkdtempSync(join(tmpdir(), 'isy-'));
      const f = join(dir, 'export.xml');
      writeFileSync(f, out.bytes);
      execFileSync('xmllint', ['--noout', '--schema', xsd[version], f], { stdio: 'pipe' });
      const s = Buffer.from(out.bytes).toString('latin1');
      assert.equal(s.includes('<Erfassungsart>3</Erfassungsart>'), version >= '2024');
      assert.equal(s.includes('<Index>'), version >= '2017');
      assert.equal(s.includes('<Liegenschaft>'), version < '2017');
      assert.match(s, new RegExp(`<Kodiersystem>${version < '2013' ? '2' : kodiersystem}</Kodiersystem>`));
    });
  }
}

test('Demo-Stammdaten sind gültig gegen das XSD', { skip: !hasXmllint || !existsSync(xsd['2017-07']) }, () => {
  execFileSync('xmllint', ['--noout', '--schema', xsd['2017-07'], join(root, 'app/demo/demo-stammdaten.xml')], { stdio: 'pipe' });
});

test('Plausibilität: Regeln aus dem Kodierhandbuch', () => {
  const insp = { tiefe: 2, bezugVertikal: '1' };
  const errs = (f) => validateFinding({ lageMode: 'unten', lageValue: 1, bereich: 'C', clockFrom: 3, ...f }, insp).filter((x) => x.level === 'error').map((x) => x.msg);
  assert.equal(errs({ code: 'DAB', c1: 'B', c2: 'A', q1: '1' }).length, 0);
  assert.ok(errs({ code: 'DAB', c1: 'A', c2: 'A', q1: '1' }).some((m) => m.includes('keine Quantifizierung')));
  assert.ok(errs({ code: 'DAB', c1: 'B' }).some((m) => m.includes('Charakterisierung 2')));
  assert.ok(errs({ code: 'DBE', c1: 'Z', q1: '50' }).some((m) => m.includes('Anmerkung')));
  assert.ok(errs({ code: 'DAF', c1: 'H', c2: 'A' }).some((m) => m.includes('passt nicht')));
  assert.ok(errs({ code: 'DAB', c1: 'B', c2: 'A', q1: '1', clockFrom: null }).some((m) => m.includes('Lage am Umfang')));
  assert.ok(validateFinding({ code: 'DAA', c1: 'A', q1: 5, bereich: 'C', lageMode: 'oben', lageValue: 1 }, { tiefe: null, bezugVertikal: '1' })
    .some((x) => x.msg.includes('Schachttiefe')));
  const v = validateInspection({ datum: '2026-01-01', inspekteur: 'X', tiefe: 2, bezugVertikal: '1', connections: [], findings: [
    { id: 'a', code: 'DAO', bereich: 'C', clockFrom: 2, lageMode: 'unten', lageValue: 1 },
  ] });
  assert.ok(v.byFinding.a.some((x) => x.msg.includes('Primärschaden')));
});

test('Kodekatalog: jede Charakterisierung hat Kürzel und Text', () => {
  for (const [code, def] of Object.entries(CODES)) {
    assert.match(code, /^(D[A-D][A-R]|CED)$/);
    for (const e of def.c1 || []) {
      assert.ok(e.k && e.t, code);
      for (const e2 of c2Options(code, e.k)) assert.ok(e2.k && e2.t, code + e.k);
      const q = quantDef(code, e.k);
      if (q) assert.ok(q.unit && q.label, code + e.k);
    }
  }
});

test('ZIP-Writer erzeugt gültige Archive', (t) => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = concat(zipParts([
    { name: 'a.txt', data: new TextEncoder().encode('Hallo') },
    { name: 'fotos/Schacht-001.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
  ]));
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const f = join(dir, 't.zip');
  writeFileSync(f, zip);
  try {
    const outp = execFileSync('python3', ['-c', `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());print(z.read('a.txt').decode())`, f]).toString();
    assert.match(outp, /None\s+Hallo/);
  } catch (e) {
    if (e.code === 'ENOENT') t.skip('python3 nicht vorhanden');
    else throw e;
  }
});

test('Koordinaten: UTM und Gauß-Krüger nach WGS84', () => {
  const p = toWgs84(32500000, 5800000, 'ETRS89_UTM32');
  assert.ok(Math.abs(p.lon - 9) < 1e-6);
  assert.ok(Math.abs(p.lat - 52.35029) < 1e-4); // Referenz: Krüger-Reihen
  const g = toWgs84(3500000, 5800000, '');
  assert.ok(Math.abs(g.lon - 9) < 0.01 && Math.abs(g.lat - 52.333) < 0.01);
});

test('Messwerte von Tastatur/Laser: Dezimalkomma, Einheiten', async () => {
  const { parseMeasure } = await import('../app/js/core/util.js');
  assert.equal(parseMeasure('2,345', 'm'), '2.345');
  assert.equal(parseMeasure('2.345 m', 'm'), '2.345');
  assert.equal(parseMeasure('2345mm', 'm'), '2.345');
  assert.equal(parseMeasure('234,5 cm', 'm'), '2.345');
  assert.equal(parseMeasure('0,95 m', 'mm'), '950');
  assert.equal(parseMeasure('300', 'mm'), '300');
  assert.equal(parseMeasure('', 'm'), '');
  assert.equal(parseMeasure('abc', 'm'), null);
});
