import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { PdfDoc, A4, winAnsi, textWidth, wrapText, jpegInfo } from '../app/js/lib/pdf.js';
import { xlsxBytes } from '../app/js/lib/xlsx.js';
import { protokollPdf } from '../app/js/report/protokoll.js';
import { aufmassDaten, aufmassPdf, aufmassXlsx, parseStaffel, staffelName } from '../app/js/report/aufmass.js';
import { importDatei } from '../app/js/isybau/import.js';
import { newInspection, connectionsFromStamm } from '../app/js/isybau/model.js';
import { VENDOR, VENDOR_WEB } from '../app/js/brand.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 16×12 px JPEG (orange), reicht für Bild-Objekte im PDF
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAMABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKABiz//2Q==', 'base64'));

const has = (cmd) => { try { execFileSync(cmd, ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } };
const tmp = mkdtempSync(join(tmpdir(), 'sb-pdf-'));
const pdfText = (bytes, name) => {
  const f = join(tmp, name);
  writeFileSync(f, bytes);
  return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
};

/** Struktur prüfen: Kopf, Ende, Querverweistabelle zeigt auf die Objekte. */
function checkPdf(bytes) {
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'), 'PDF-Kopf');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'PDF-Ende');
  const start = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)[1]);
  assert.equal(s.slice(start, start + 4), 'xref');
  const [, first, count] = /xref\s+(\d+) (\d+)/.exec(s.slice(start)).map(Number);
  const entries = s.slice(start).split('\n').slice(2, 2 + count);
  entries.forEach((e, i) => {
    if (i + first === 0) return;
    const off = Number(e.slice(0, 10));
    assert.ok(s.startsWith(`${i + first} 0 obj`, off), `Objekt ${i + first} an Offset ${off}`);
  });
  return (s.match(/\/Type \/Page\b/g) || []).length;
}

function beispiel() {
  const data = importDatei(readFileSync(join(root, 'app/demo/demo-stammdaten.xml'))).stamm;
  const project = { id: 'p', name: 'Testprojekt Größenweg', ort: 'Musterstadt', auftraggeber: 'Stadtentwässerung Musterstadt', auftragKennung: 1, kodiersystem: '10' };
  let n = 0;
  const id = () => `c${++n}`;
  const entries = data.manholes.slice(0, 3).map((m, i) => {
    const insp = newInspection({ id: `i${i}`, project, manhole: m, inspector: 'Jörg Prüfer', now: new Date(2025, 2, 3 + i, 8, 0) });
    insp.connections = connectionsFromStamm(m, id);
    insp.status = i < 2 ? 'fertig' : 'offen';
    insp.reinigung = i === 0;
    insp.findings = i === 1 ? [] : [
      { id: `a${i}`, code: 'DAB', c1: 'B', c2: 'A', q1: '4', clockFrom: 3, bereich: 'C', lageMode: 'unten', lageValue: 0.9, photoId: `p${i}` },
      { id: `b${i}`, code: 'DAQ', c1: 'C', q1: '3', bereich: 'C', lageMode: 'unten', lageValue: 0.4, strecke: true, lageEndValue: 1.2, bemerkung: 'Wurzeleinwuchs an Fuge' },
    ];
    if (i === 2) insp.tiefe = null;
    return { manhole: m, inspection: insp };
  });
  return { project, entries };
}

test('PDF-Grundlagen: WinAnsi, Textbreite, Umbruch, JPEG-Kopf', () => {
  const bytes = (s) => String.fromCharCode(...winAnsi(s));
  assert.equal(bytes('Öl – Maß €'), 'Öl \x96 Maß \x80');
  assert.equal(bytes('≥ 1 m ✓'), '>= 1 m ?');
  assert.ok(Math.abs(textWidth('Hello', 10) - 22.78) < 0.01); // Helvetica-AFM: 722+556+222+222+556
  assert.ok(textWidth('Prüfer', 10, true) > textWidth('Prüfer', 10));
  const lines = wrapText('Wurzeleinwuchs im Bereich der Rohrverbindung, mehrere Fugen betroffen', 9, 120);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => textWidth(l, 9) <= 120));
  assert.deepEqual(jpegInfo(JPEG), { width: 16, height: 12, components: 3 });
  assert.throws(() => jpegInfo(new Uint8Array([1, 2, 3])));
});

test('PdfDoc: gültige Struktur, Umlaute und Bilder', () => {
  const doc = new PdfDoc({ title: 'Prüfbericht', author: 'Müller GmbH' });
  const img = doc.addJpeg(JPEG);
  const p = doc.addPage();
  p.text('Schachtprüfung – Größe ≥ 1 m', 40, 60, { size: 14, bold: true });
  p.rect(40, 80, 200, 40, { fill: '#e6ecf5', stroke: '#0a5bd3', radius: 6 });
  p.image(img, 40, 140, 160, 120);
  doc.addPage().text('Seite 2', A4.w - 40, 60, { align: 'right' });
  const bytes = doc.toBytes();
  assert.equal(checkPdf(bytes), 2);
  if (has('pdftotext')) {
    const txt = pdfText(bytes, 'basis.pdf');
    assert.match(txt, /Schachtprüfung – Größe >= 1 m/);
    assert.match(txt, /Seite 2/);
  }
});

test('Schachtprotokolle: Einzel- und Sammelbericht mit Logo, Fotos und Klassen', () => {
  const { project, entries } = beispiel();
  const settings = { company: 'Kanal-Service Müller GmbH', companyAddress: 'Hauptstraße 1\n12345 Musterstadt', companyContact: 'Tel. 0123 456' };
  const einzel = protokollPdf({
    project, settings, logoJpeg: JPEG,
    entries: [{ ...entries[0], overviewJpeg: JPEG, photos: [{ id: 'p0', jpeg: JPEG, caption: 'DAB B A' }] }],
  });
  assert.ok(checkPdf(einzel) >= 1);
  const alle = protokollPdf({ project, settings, entries });
  const seiten = checkPdf(alle);
  assert.ok(seiten >= 4, `Übersicht + 3 Schächte, war ${seiten}`);
  if (has('pdftotext')) {
    const t = pdfText(einzel, 'einzel.pdf');
    assert.match(t, /Kanal-Service Müller GmbH/);
    assert.match(t, new RegExp(entries[0].manhole.name));
    assert.match(t, /DAB/);
    assert.match(t, /Objektklasse/);
    assert.match(t, new RegExp(VENDOR_WEB.replace(/\./g, '\\.')));
    assert.match(t, /Seite 1 von/);
    const t2 = pdfText(alle, 'alle.pdf');
    for (const e of entries) assert.match(t2, new RegExp(e.manhole.name));
    assert.match(t2, new RegExp(VENDOR));
  }
});

test('Aufmaß: Tiefenstaffel, Mehrtiefe, Summen', () => {
  assert.deepEqual(parseStaffel('3; 2,0 / 5'), [2, 3, 5]);
  assert.deepEqual(parseStaffel(''), []);
  assert.equal(staffelName([2, 3, 5], 0), 'bis 2,00 m');
  assert.equal(staffelName([2, 3, 5], 1), 'über 2,00 bis 3,00 m');
  assert.equal(staffelName([2, 3, 5], 3), 'über 5,00 m');
  const { entries } = beispiel();
  entries[0].inspection.tiefe = 1.85;
  entries[1].inspection.tiefe = 3.4;
  const d = aufmassDaten(entries, { staffel: [2, 3, 5], grenztiefe: 3 });
  assert.equal(d.rows.length, 3);
  const r = Object.fromEntries(d.rows.map((x) => [x.schacht, x]));
  assert.equal(r[entries[0].manhole.name].staffel, 'bis 2,00 m');
  assert.equal(r[entries[1].manhole.name].staffel, 'über 3,00 bis 5,00 m');
  assert.equal(r[entries[1].manhole.name].mehrtiefe, 0.4);
  assert.equal(r[entries[2].manhole.name].staffel, 'Tiefe fehlt');
  assert.equal(r[entries[0].manhole.name].fotos, 1);
  assert.equal(d.summe.anzahl, 3);
  assert.equal(d.summe.tiefe, 5.25);
  assert.equal(d.summe.mehrtiefe, 0.4);
  assert.equal(d.summe.ohneTiefe, 1);
  assert.equal(d.summe.reinigung, 1);
  assert.deepEqual(d.summe.staffeln.map((s) => s.anzahl), [1, 0, 1, 0]);
  assert.deepEqual(d.zeitraum, ['2025-03-03', '2025-03-05']);
});

test('Aufmaß als PDF und Excel', () => {
  const { project, entries } = beispiel();
  const daten = aufmassDaten(entries);
  const settings = { company: 'Kanal-Service Müller GmbH' };
  const pdf = aufmassPdf({ project, settings, daten, logoJpeg: JPEG });
  assert.ok(checkPdf(pdf) >= 1);
  if (has('pdftotext')) {
    const t = pdfText(pdf, 'aufmass.pdf');
    assert.match(t, /Aufmaß/);
    assert.match(t, /Auftraggeber/);
    for (const e of entries) assert.match(t, new RegExp(e.manhole.name));
  }
  const x = aufmassXlsx({ project, settings, daten });
  assert.equal(Buffer.from(x.slice(0, 2)).toString(), 'PK');
  const f = join(tmp, 'aufmass.xlsx');
  writeFileSync(f, x);
  if (has('unzip')) {
    const list = execFileSync('unzip', ['-Z1', f], { encoding: 'utf8' });
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(list.includes(part), part);
    const sheet = execFileSync('unzip', ['-p', f, 'xl/worksheets/sheet1.xml'], { encoding: 'utf8' });
    assert.match(sheet, new RegExp(entries[0].manhole.name));
    assert.match(sheet, /<v>\d+(\.\d+)?<\/v>/); // Tiefen als Zahlen
  }
});

test('XLSX-Writer: Escaping, Spaltennamen, Blattnamen', () => {
  const x = xlsxBytes({ sheets: [{ name: 'A/B: Test?', rows: [['<&>', 1.5, { v: 2, fmt: '0.00', bold: true }], [], Array(28).fill('z')], cols: [10, 12] }] });
  const f = join(tmp, 'w.xlsx');
  writeFileSync(f, x);
  if (!has('unzip')) return;
  const wb = execFileSync('unzip', ['-p', f, 'xl/workbook.xml'], { encoding: 'utf8' });
  assert.match(wb, /name="A B  Test "/);
  const s = execFileSync('unzip', ['-p', f, 'xl/worksheets/sheet1.xml'], { encoding: 'utf8' });
  assert.match(s, /&lt;&amp;&gt;/);
  assert.match(s, /r="AB3"/);
  assert.match(s, /<c r="C1" s="3"><v>2<\/v><\/c>/);
});
