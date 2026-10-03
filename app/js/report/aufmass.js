// Aufmaß der inspizierten Schächte für die Abrechnung: Liste je Schacht mit Tiefe,
// Tiefenstaffel und Leistungsmerkmalen, Summen je Staffel und Mehrtiefe über der Grenztiefe.
// Ausgabe als PDF (mit Unterschriftsfeldern) und als Excel-Datei (XLSX).

import { PdfDoc, A4, textWidth, wrapText } from '../lib/pdf.js';
import { xlsxBytes } from '../lib/xlsx.js';
import { refLabel } from '../data/reflists.js';
import { APP_NAME, CREATED_WITH } from '../brand.js';

const de = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? '–' : Number(v).toFixed(d).replace('.', ','));
const fmtDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

/** Staffelgrenzen aus Text wie „2; 3; 5“ oder „2,0 / 3,0 / 5,0“. */
export function parseStaffel(text) {
  return String(text || '').split(/[;/\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
}

export function staffelName(grenzen, i) {
  const f = (v) => de(v);
  if (!grenzen.length) return 'alle Tiefen';
  if (i === 0) return `bis ${f(grenzen[0])} m`;
  if (i === grenzen.length) return `über ${f(grenzen[i - 1])} m`;
  return `über ${f(grenzen[i - 1])} bis ${f(grenzen[i])} m`;
}

/**
 * @param {Array} entries [{manhole, inspection}]
 * @param {{staffel?:number[], grenztiefe?:number}} opt
 */
export function aufmassDaten(entries, { staffel = [2, 3, 5], grenztiefe = 3 } = {}) {
  const rows = entries
    .slice()
    .sort((a, b) => String(a.inspection.datum).localeCompare(String(b.inspection.datum)) || a.manhole.name.localeCompare(b.manhole.name, 'de', { numeric: true }))
    .map((e, i) => {
      const insp = e.inspection;
      const t = insp.tiefe != null && insp.tiefe !== '' ? Math.round(Number(insp.tiefe) * 100) / 100 : null;
      const si = t == null ? null : staffel.findIndex((g) => t <= g);
      const stufe = t == null ? null : (si === -1 ? staffel.length : si);
      const fotos = new Set([insp.overview?.photoId, ...(insp.findings || []).map((f) => f.photoId), ...(insp.connections || []).map((c) => c.photoId)].filter(Boolean)).size;
      return {
        pos: i + 1,
        schacht: e.manhole.name,
        strasse: e.manhole.strasse || '',
        datum: insp.datum || '',
        tiefe: t,
        stufe,
        staffel: stufe == null ? 'Tiefe fehlt' : staffelName(staffel, stufe),
        mehrtiefe: t != null && grenztiefe ? Math.max(0, Math.round((t - grenztiefe) * 100) / 100) : 0,
        verfahren: refLabel('U108', insp.verfahren) || '',
        reinigung: insp.reinigung ? 'ja' : 'nein',
        fotos,
        befunde: (insp.findings || []).length,
        status: insp.status === 'fertig' ? 'fertig' : 'in Arbeit',
        bemerkung: insp.bemerkung || '',
      };
    });
  const summe = {
    anzahl: rows.length,
    tiefe: Math.round(rows.reduce((s, r) => s + (r.tiefe || 0), 0) * 100) / 100,
    mehrtiefe: Math.round(rows.reduce((s, r) => s + r.mehrtiefe, 0) * 100) / 100,
    ohneTiefe: rows.filter((r) => r.tiefe == null).length,
    reinigung: rows.filter((r) => r.reinigung === 'ja').length,
    fotos: rows.reduce((s, r) => s + r.fotos, 0),
    staffeln: [...Array(staffel.length + 1)].map((_, i) => {
      const rs = rows.filter((r) => r.stufe === i);
      return { name: staffelName(staffel, i), anzahl: rs.length, tiefe: Math.round(rs.reduce((s, r) => s + r.tiefe, 0) * 100) / 100 };
    }),
  };
  const daten = rows.map((r) => r.datum).filter(Boolean).sort();
  return { rows, summe, staffel, grenztiefe, zeitraum: daten.length ? [daten[0], daten[daten.length - 1]] : null };
}

// ---- PDF -------------------------------------------------------------------

const M = 36;
const BLUE = '#0a5bd3';
const GREY = '#5b6b82';
const LINE = '#cfd6e2';

export function aufmassPdf({ project, settings = {}, daten, logoJpeg = null }) {
  const W = A4.w, CW = W - 2 * M;
  const doc = new PdfDoc({ title: `Aufmaß ${project.name}`, author: settings.company || APP_NAME, subject: 'Aufmaß Schachtinspektion', creator: CREATED_WITH });
  const logo = logoJpeg ? doc.addJpeg(logoJpeg) : null;
  const firma = [settings.company, ...(settings.companyAddress || '').split(/\r?\n/), settings.companyContact].map((x) => (x || '').trim()).filter(Boolean);
  let page, y;
  const BOTTOM = A4.h - 48;
  const newPage = () => {
    page = doc.addPage();
    if (logo) { const s = Math.min(120 / logo.width, 42 / logo.height); page.image(logo, M, 24, logo.width * s, logo.height * s); }
    firma.forEach((l, i) => page.text(l, W - M, 24 + i * 10, { size: i ? 7.6 : 9.2, bold: i === 0, color: i ? GREY : '#111111', align: 'right' }));
    page.line(M, 74, W - M, 74, { width: 0.8, color: BLUE });
    y = 86;
  };
  newPage();
  page.text('Aufmaß Schachtinspektion', M, y, { size: 16, bold: true });
  y += 22;
  const info = [
    ['Projekt', project.name],
    ['Auftraggeber', project.auftraggeber || '–'],
    ['Auftrag', [project.auftragBezeichnung, project.auftragNummer].filter(Boolean).join(' · ') || '–'],
    ['Zeitraum', daten.zeitraum ? `${fmtDate(daten.zeitraum[0])} – ${fmtDate(daten.zeitraum[1])}` : '–'],
  ];
  info.forEach(([k, v]) => { page.text(k, M, y, { size: 8.4, color: GREY }); page.text(v, M + 80, y, { size: 8.4, bold: true, maxWidth: CW - 80 }); y += 12; });
  y += 8;

  const cols = [
    { k: 'pos', t: 'Pos.', w: 26, a: 'right' },
    { k: 'schacht', t: 'Schacht', w: 70 },
    { k: 'strasse', t: 'Straße', w: 108 },
    { k: 'datum', t: 'Datum', w: 50 },
    { k: 'tiefe', t: 'Tiefe [m]', w: 44, a: 'right' },
    { k: 'staffel', t: 'Tiefenstaffel', w: 82 },
    { k: 'mehrtiefe', t: `> ${de(daten.grenztiefe)} m`, w: 40, a: 'right' },
    { k: 'reinigung', t: 'Reinig.', w: 34 },
    { k: 'fotos', t: 'Fotos', w: 30, a: 'right' },
  ];
  cols.push({ k: 'status', t: 'Status', w: CW - cols.reduce((s, c) => s + c.w, 0) });
  const size = 7.6, lh = 12;
  const head = () => {
    page.rect(M, y, CW, lh + 2, { fill: '#e6ecf5' });
    let x = M;
    for (const c of cols) { page.text(c.t, c.a === 'right' ? x + c.w - 3 : x + 3, y + 3, { size, bold: true, color: '#26364d', align: c.a === 'right' ? 'right' : 'left', maxWidth: c.w - 6 }); x += c.w; }
    y += lh + 2;
  };
  head();
  daten.rows.forEach((r, i) => {
    if (y + lh > BOTTOM) { newPage(); head(); }
    if (i % 2) page.rect(M, y, CW, lh, { fill: '#f3f6fa' });
    const vals = { ...r, datum: fmtDate(r.datum), tiefe: de(r.tiefe), mehrtiefe: r.mehrtiefe ? de(r.mehrtiefe) : '', fotos: String(r.fotos), pos: String(r.pos) };
    let x = M;
    for (const c of cols) { page.text(vals[c.k] ?? '', c.a === 'right' ? x + c.w - 3 : x + 3, y + 2.5, { size, align: c.a === 'right' ? 'right' : 'left', maxWidth: c.w - 6, bold: c.k === 'schacht' }); x += c.w; }
    y += lh;
  });
  page.line(M, y, M + CW, y, { width: 0.6, color: '#26364d' });
  y += 14;

  // Zusammenstellung
  const zus = [
    ['Inspizierte Schächte', `${daten.summe.anzahl} Stück`],
    ['Summe Schachttiefen', `${de(daten.summe.tiefe)} m`],
    ...daten.summe.staffeln.map((s) => [`Tiefenstaffel ${s.name}`, `${s.anzahl} Stück · ${de(s.tiefe)} m`]),
    [`Mehrtiefe über ${de(daten.grenztiefe)} m`, `${de(daten.summe.mehrtiefe)} m`],
    ['Reinigung vor Inspektion', `${daten.summe.reinigung} Stück`],
    ['Fotos', `${daten.summe.fotos} Stück`],
  ];
  if (daten.summe.ohneTiefe) zus.push(['ohne Tiefenangabe', `${daten.summe.ohneTiefe} Stück – bitte nachtragen`]);
  if (y + zus.length * 13 + 30 > BOTTOM) newPage();
  page.text('Zusammenstellung', M, y, { size: 10.5, bold: true, color: BLUE });
  y += 16;
  zus.forEach(([k, v], i) => {
    if (i % 2 === 0) page.rect(M, y - 2, 330, 13, { fill: '#f3f6fa' });
    page.text(k, M + 4, y, { size: 8.6 });
    page.text(v, M + 326, y, { size: 8.6, bold: true, align: 'right' });
    y += 13;
  });

  // Unterschriften
  if (y + 90 > BOTTOM) newPage();
  y = Math.max(y + 40, BOTTOM - 70);
  const sw = (CW - 40) / 2;
  [['Auftragnehmer', settings.company || ''], ['Auftraggeber', project.auftraggeber || '']].forEach(([t, n], i) => {
    const x = M + i * (sw + 40);
    page.line(x, y + 30, x + sw, y + 30, { width: 0.6 });
    page.text(`Ort, Datum, Unterschrift ${t}`, x, y + 34, { size: 7.4, color: GREY });
    if (n) page.text(n, x, y + 44, { size: 7.4, color: GREY });
  });

  const heute = new Date().toLocaleDateString('de-DE');
  doc.pages.forEach((p, i) => {
    p.line(M, A4.h - 34, W - M, A4.h - 34, { width: 0.4, color: LINE });
    p.text(`${CREATED_WITH} · ${heute}`, M, A4.h - 28, { size: 6.8, color: GREY });
    p.text(`Seite ${i + 1} von ${doc.pages.length}`, W - M, A4.h - 28, { size: 7.4, color: GREY, align: 'right' });
  });
  void textWidth; void wrapText;
  return doc.toBytes();
}

// ---- Excel -------------------------------------------------------------------

export function aufmassXlsx({ project, settings = {}, daten }) {
  const h = (v) => ({ v, head: true });
  const kopf = [
    [{ v: 'Aufmaß Schachtinspektion', bold: true }],
    ['Projekt', project.name],
    ['Auftraggeber', project.auftraggeber || ''],
    ['Auftrag', [project.auftragBezeichnung, project.auftragNummer].filter(Boolean).join(' · ')],
    ['Auftragnehmer', settings.company || ''],
    ['Zeitraum', daten.zeitraum ? `${fmtDate(daten.zeitraum[0])} – ${fmtDate(daten.zeitraum[1])}` : ''],
    [],
  ];
  const header = [h('Pos.'), h('Schacht'), h('Straße'), h('Datum'), h('Tiefe [m]'), h('Tiefenstaffel'), h(`Mehrtiefe > ${de(daten.grenztiefe)} m`), h('Verfahren'), h('Reinigung'), h('Fotos'), h('Befunde'), h('Status'), h('Bemerkung')];
  const rows = daten.rows.map((r) => [r.pos, r.schacht, r.strasse, fmtDate(r.datum), r.tiefe == null ? '' : { v: r.tiefe, fmt: '0.00' }, r.staffel, { v: r.mehrtiefe, fmt: '0.00' }, r.verfahren, r.reinigung, r.fotos, r.befunde, r.status, r.bemerkung]);
  const sum = [
    [],
    [{ v: 'Zusammenstellung', bold: true }],
    ['Inspizierte Schächte', { v: daten.summe.anzahl, bold: true }, 'Stück'],
    ['Summe Schachttiefen', { v: daten.summe.tiefe, fmt: '0.00', bold: true }, 'm'],
    ...daten.summe.staffeln.map((s) => [`Tiefenstaffel ${s.name}`, { v: s.anzahl }, 'Stück', { v: s.tiefe, fmt: '0.00' }, 'm']),
    [`Mehrtiefe über ${de(daten.grenztiefe)} m`, { v: daten.summe.mehrtiefe, fmt: '0.00', bold: true }, 'm'],
    ['Reinigung vor Inspektion', { v: daten.summe.reinigung }, 'Stück'],
    ['Fotos', { v: daten.summe.fotos }, 'Stück'],
    [],
    [CREATED_WITH],
  ];
  return xlsxBytes({
    title: `Aufmaß ${project.name}`,
    creator: settings.company || APP_NAME,
    sheets: [{ name: 'Aufmaß', rows: [...kopf, header, ...rows, ...sum], cols: [16, 14, 26, 11, 10, 20, 14, 22, 10, 7, 8, 14, 40], freeze: kopf.length + 1 }],
  });
}
