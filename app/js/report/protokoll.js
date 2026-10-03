// PDF-Schachtprotokolle (einzeln oder als Projektbericht mit Übersicht).
// Rein rechnerisch (ohne DOM): Bilder werden als fertige JPEG-Bytes übergeben,
// damit dieselbe Logik im Browser und in den Tests läuft.

import { PdfDoc, A4, wrapText, textWidth } from '../lib/pdf.js';
import { buildRecords } from '../isybau/model.js';
import { bewerteInspektion, klassenKurz, OBJEKTKLASSEN } from '../isybau/bewertung.js';
import { CODES, codeLabel } from '../data/codes.js';
import { refLabel } from '../data/reflists.js';
import { hatBauteile, bauteileZeilen, hoehenbilanz } from '../isybau/bauteile.js';
import { APP_NAME, CREATED_WITH } from '../brand.js';
import { fotoBenenner } from '../isybau/dateinamen.js';

const M = 40; // Seitenrand
const CW = A4.w - 2 * M; // Inhaltsbreite
const TOP = 96; // Beginn Inhalt unter dem Kopf
const BOTTOM = A4.h - 46; // Ende Inhalt über dem Fuß
const BLUE = '#0a5bd3';
const GREY = '#5b6b82';
const LINE = '#cfd6e2';
const ROW = '#f3f6fa';
export const KLASSE_FARBE = ['#2b8a3e', '#74b816', '#f2c200', '#f08c00', '#e03131', '#862e2e'];

const fmt = (v, d = 2) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? '–' : Number(v).toFixed(d).replace('.', ','));
const fmtDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso || '–');

/** Seitenverwaltung mit Kopf/Fuß und Zeilenvorschub. */
class Layout {
  constructor(doc, { header }) { this.doc = doc; this.header = header; this.page = null; this.y = TOP; }
  newPage() { this.page = this.doc.addPage(); this.header(this.page); this.y = TOP; return this.page; }
  ensure(h) { if (!this.page || this.y + h > BOTTOM) this.newPage(); }
}

function kopf(page, { firma, logo }) {
  let x = M;
  if (logo) {
    const s = Math.min(130 / logo.width, 46 / logo.height);
    page.image(logo, M, 26, logo.width * s, logo.height * s);
    x = M + logo.width * s + 12;
  }
  const lines = [firma.name, ...(firma.anschrift || '').split(/\r?\n/), firma.kontakt].map((l) => (l || '').trim()).filter(Boolean);
  lines.forEach((l, i) => page.text(l, A4.w - M, 26 + i * 10.5, { size: i ? 7.8 : 9.5, bold: i === 0, color: i ? GREY : '#111111', align: 'right', maxWidth: A4.w - M - x - 10 }));
  if (!logo && !lines.length) page.text(APP_NAME, M, 30, { size: 12, bold: true, color: BLUE });
  page.line(M, 80, A4.w - M, 80, { width: 0.8, color: BLUE });
}

function fuss(page, nr, gesamt, datum) {
  page.line(M, A4.h - 36, A4.w - M, A4.h - 36, { width: 0.4, color: LINE });
  page.text(`${CREATED_WITH} · ${datum}`, M, A4.h - 30, { size: 6.8, color: GREY });
  page.text(`Seite ${nr} von ${gesamt}`, A4.w - M, A4.h - 30, { size: 7.5, color: GREY, align: 'right' });
}

/** Tabelle mit Zeilenumbruch in Zellen, Kopfzeile wird nach Seitenwechsel wiederholt. */
function tabelle(L, cols, rows, { size = 7.6, head = true, zebra = true } = {}) {
  const pad = 3;
  const lh = size * 1.25;
  const drawHead = () => {
    const hgt = lh + 2 * pad;
    L.ensure(hgt + lh + 2 * pad);
    L.page.rect(M, L.y, CW, hgt, { fill: '#e6ecf5' });
    let x = M;
    for (const c of cols) { L.page.text(c.title, c.align === 'right' ? x + c.w - pad : x + pad, L.y + pad, { size, bold: true, color: '#26364d', align: c.align === 'right' ? 'right' : 'left', maxWidth: c.w - 2 * pad }); x += c.w; }
    L.y += hgt;
  };
  if (head) drawHead();
  rows.forEach((r, i) => {
    const cells = cols.map((c) => wrapText(r[c.key] ?? '', size, c.w - 2 * pad, !!c.bold));
    const hgt = Math.max(...cells.map((l) => l.length)) * lh + 2 * pad;
    if (L.y + hgt > BOTTOM) { L.newPage(); if (head) drawHead(); }
    if (zebra && i % 2) L.page.rect(M, L.y, CW, hgt, { fill: ROW });
    let x = M;
    cols.forEach((c, j) => {
      if (c.badge && r[`${c.key}_k`] != null) {
        const k = r[`${c.key}_k`];
        const w = textWidth(r[c.key], size, true) + 8;
        L.page.rect(x + pad, L.y + pad - 1, w, lh + 1, { fill: KLASSE_FARBE[k] || GREY, radius: 3 });
        L.page.text(r[c.key], x + pad + 4, L.y + pad, { size, bold: true, color: k === 2 ? '#2b2400' : '#ffffff' });
      } else {
        cells[j].forEach((line, li) => L.page.text(line, c.align === 'right' ? x + c.w - pad : x + pad, L.y + pad + li * lh, { size, bold: !!c.bold, align: c.align === 'right' ? 'right' : 'left' }));
      }
      x += c.w;
    });
    L.page.line(M, L.y + hgt, M + CW, L.y + hgt, { width: 0.3, color: LINE });
    L.y += hgt;
  });
}

function abschnitt(L, titel, minHeight = 60) {
  L.ensure(minHeight);
  L.y += 6;
  L.page.text(titel, M, L.y, { size: 10.5, bold: true, color: BLUE });
  L.y += 16;
}

function infoRaster(L, paare) {
  const size = 8.2, colW = CW / 2, lw = 92, lh = 12.5;
  const rows = Math.ceil(paare.length / 2);
  L.ensure(rows * lh + 6);
  for (let i = 0; i < rows; i++) {
    if (i % 2 === 0) L.page.rect(M, L.y - 2, CW, lh, { fill: ROW });
    [paare[i], paare[i + rows]].forEach((p, c) => {
      if (!p) return;
      const x = M + c * colW + 4;
      L.page.text(p[0], x, L.y, { size, color: GREY });
      L.page.text(p[1] ?? '–', x + lw, L.y, { size, bold: true, maxWidth: colW - lw - 10 });
    });
    L.y += lh;
  }
  L.y += 6;
}

function klassenKachel(page, x, y, k, text, { s = 34, size = 8.5 } = {}) {
  page.rect(x, y, s, s, { fill: KLASSE_FARBE[k] ?? GREY, radius: s / 5.5 });
  page.text(String(k), x + s / 2, y + s * 0.24, { size: s * 0.53, bold: true, color: k === 2 ? '#2b2400' : '#ffffff', align: 'center' });
  if (text) page.text(text, x + s + 6, y + (s - size) / 2, { size, bold: true });
}

/** Ein Schacht (beginnt auf neuer Seite). */
function schacht(L, { project, settings, manhole, inspection: insp, overview, modell, photos = [], optionen, benenner }) {
  const bt = hatBauteile(insp.bauteile) ? insp.bauteile : hatBauteile(manhole.bauteile) ? manhole.bauteile : null;
  const dn = bt?.aufbau?.laenge || bt?.unterteil?.laenge || manhole.schacht?.dn;
  const werkstoff = bt?.aufbau?.material || bt?.unterteil?.material || manhole.schacht?.material;
  // mit Fotomuster dieselben Dateinamen wie im Export (Übersichtsfoto = Nr. 001), sonst „Foto 1, 2 …“
  const namer = benenner?.fuer(manhole, insp);
  const names = new Map();
  const photoName = (id, kode) => { if (!names.has(id)) names.set(id, namer ? namer.name(id, kode) : `Foto ${names.size + 1}`); return names.get(id); };
  const recs = buildRecords(insp, { photoName });
  const bew = optionen.klassen ? bewerteInspektion(insp, manhole, project) : null;
  const klById = new Map((bew?.befunde || []).map((e) => [e.id, e]));
  const vonOben = insp.bezugVertikal === '2';

  L.newPage();
  const p = L.page;
  p.text(`Schachtprotokoll ${manhole.name}`, M, L.y, { size: 16, bold: true, maxWidth: CW - 200 });
  p.text([manhole.strasse, manhole.ortsteil].filter(Boolean).join(', ') || project.name, M, L.y + 20, { size: 9, color: GREY, maxWidth: CW - 200 });
  if (bew) {
    const kx = A4.w - M - 190;
    klassenKachel(p, kx, L.y - 2, bew.OK, null);
    p.text(`Objektklasse ${bew.OK}`, kx + 40, L.y, { size: 9.5, bold: true });
    p.paragraph(OBJEKTKLASSEN[bew.OK], kx + 40, L.y + 13, 150, { size: 7.5, color: GREY, maxLines: 2 });
  }
  L.y += 44;

  infoRaster(L, [
    ['Projekt', project.name],
    ['Auftraggeber', project.auftraggeber || '–'],
    ['Auftrag', [project.auftragBezeichnung, project.auftragNummer].filter(Boolean).join(' · ') || '–'],
    ['Lage', manhole.x != null ? `${fmt(manhole.x, 2)} / ${fmt(manhole.y, 2)}` : '–'],
    ['Deckel-/Sohlhöhe', manhole.deckelhoehe != null || manhole.sohlhoehe != null ? `${fmt(manhole.deckelhoehe, 3)} / ${fmt(manhole.sohlhoehe, 3)} m` : '–'],
    ['Schacht', [dn ? `DN ${Math.round(dn * 1000)}` : null, werkstoff ? refLabel('G102', werkstoff) : null].filter(Boolean).join(', ') || '–'],
    ['Datum / Uhrzeit', `${fmtDate(insp.datum)} ${insp.uhrzeit || ''}`.trim()],
    ['Inspekteur', insp.inspekteur || '–'],
    ['Bericht-Nr.', insp.berichtNr || '–'],
    ['Schachttiefe', insp.tiefe != null && insp.tiefe !== '' ? `${fmt(insp.tiefe)} m${insp.tiefeQuelle === 'foto' ? ' (geschätzt)' : ''}` : '–'],
    ['Höhenangaben', vonOben ? 'von oben (Deckel = 0,00 m)' : 'von unten (Sohle = 0,00 m)'],
    ['Wetter / Wasserh.', `${refLabel('U106', insp.wetter) || '–'} / ${refLabel('U107', insp.wasserhaltung) || '–'}`],
    ['Kodiersystem', project.kodiersystem === '9' ? 'DIN EN 13508-2 / DWA-M 149-2' : 'DIN EN 13508-2 / BFR Abwasser'],
  ]);

  // Übersichtsfoto und Anschlüsse
  const conns = insp.connections || [];
  if (overview || conns.length) {
    abschnitt(L, overview ? 'Draufsicht und Anschlüsse' : 'Anschlüsse', overview ? 210 : 60);
    const top = L.y;
    let fotoH = 0;
    if (overview) {
      const w = 230, h = Math.min(230 * overview.height / overview.width, 230);
      const s = Math.min(w / overview.width, h / overview.height);
      L.page.image(overview, M, top, overview.width * s, overview.height * s);
      const ovName = namer && insp.overview?.photoId ? names.get(insp.overview.photoId) : null;
      L.page.text(`Tiefster Auslauf = 12 Uhr (Draufsicht)${ovName ? ' · ' + ovName : ''}`, M, top + overview.height * s + 3, { size: 6.8, color: GREY, maxWidth: 230 });
      fotoH = overview.height * s + 14;
    }
    if (conns.length) {
      const x0 = overview ? M + 244 : M;
      const w0 = overview ? CW - 244 : CW;
      const cols = [['Richtung', 0.22], ['Uhr', 0.1], ['DN', 0.14], [vonOben ? 'ab Deckel' : 'ü. Sohle', 0.18], ['Leitung', 0.36]];
      let y = top;
      L.page.rect(x0, y, w0, 13, { fill: '#e6ecf5' });
      let x = x0;
      for (const [t, f] of cols) { L.page.text(t, x + 3, y + 3, { size: 7.4, bold: true, color: '#26364d' }); x += w0 * f; }
      y += 13;
      conns.forEach((c, i) => {
        if (i % 2) L.page.rect(x0, y, w0, 12, { fill: ROW });
        const T = insp.tiefe != null && insp.tiefe !== '' ? Number(insp.tiefe) : null;
        const v = c.lageValue === '' || c.lageValue == null ? null : Number(c.lageValue);
        const unten = c.lageMode === 'unten' ? v : (T != null && v != null ? T - v : null);
        const oben = c.lageMode === 'oben' ? v : (T != null && v != null ? T - v : null);
        const vals = [c.dir === 'out' ? 'Ablauf' : c.dir === 'closed' ? 'verschlossen' : 'Zulauf', c.clock ? `${c.clock}` : '–', c.dn ? `${c.dn}${c.dnB ? '/' + c.dnB : ''}` : '–', fmt(vonOben ? oben : unten), c.pipeName || c.kommentar || ''];
        x = x0;
        vals.forEach((t, j) => { L.page.text(t, x + 3, y + 2.5, { size: 7.4, maxWidth: w0 * cols[j][1] - 6 }); x += w0 * cols[j][1]; });
        y += 12;
      });
      L.y = Math.max(top + fotoH, y + 6);
    } else {
      L.y = top + fotoH;
    }
  }

  // Bauteilbeschreibung mit 3D-Modell
  const zeilen = bt ? bauteileZeilen(bt) : [];
  if (zeilen.length) {
    abschnitt(L, 'Schachtaufbau (Bauteile)', modell ? 190 : 24 + zeilen.length * 13);
    const top = L.y;
    let bildH = 0;
    const x0 = modell ? M + 186 : M;
    const w0 = modell ? CW - 186 : CW;
    if (modell) {
      const s = Math.min(172 / modell.width, 172 / modell.height);
      L.page.image(modell, M, top, modell.width * s, modell.height * s);
      L.page.text('3D-Modell aus der Bauteilbeschreibung', M, top + modell.height * s + 3, { size: 6.8, color: GREY });
      bildH = modell.height * s + 14;
    }
    let y = top;
    zeilen.forEach(([k, t], i) => {
      const n = wrapText(t, 7.6, w0 - 104).length;
      const hRow = Math.max(12, n * 7.6 * 1.3 + 4);
      if (i % 2 === 0) L.page.rect(x0, y, w0, hRow, { fill: ROW });
      L.page.text(k, x0 + 3, y + 2.5, { size: 7.6, bold: true, color: '#26364d' });
      L.page.paragraph(t, x0 + 100, y + 2.5, w0 - 104, { size: 7.6 });
      y += hRow;
    });
    const hb = hoehenbilanz(bt, insp.tiefe);
    if (hb.vollstaendig && hb.rest != null) {
      L.page.paragraph(`Höhenbilanz: Bauteile ${fmt(hb.summe)} m + Abdeckung/Rahmen ${fmt(hb.rest)} m = Schachttiefe ${fmt(insp.tiefe)} m`
        + (hb.ok ? '' : ' – Abweichung prüfen'), x0 + 3, y + 4, w0 - 6, { size: 7, color: GREY });
      y += 16;
    }
    L.y = Math.max(top + bildH, y + 6);
  }

  // Zustandsdaten
  abschnitt(L, 'Zustandsdaten', 70);
  const cols = [
    { key: 'nr', title: 'Nr.', w: 22 },
    { key: 'lage', title: 'Lage [m]', w: 38, align: 'right' },
    { key: 'kode', title: 'Kode', w: 52, bold: true },
    { key: 'text', title: 'Beschreibung', w: 150 },
    { key: 'quant', title: 'Quant.', w: 46 },
    { key: 'uhr', title: 'Uhr', w: 30 },
    { key: 'ber', title: 'Ber.', w: 24 },
  ];
  if (bew) cols.push({ key: 'kl', title: 'Klassen', w: 50, badge: false });
  cols.push({ key: 'anm', title: 'Anmerkung / Foto', w: CW - cols.reduce((s, c) => s + c.w, 0) });
  tabelle(L, cols, recs.map((r) => ({
    nr: r.Index,
    lage: r.VertikaleLage.replace('.', ','),
    kode: `${r.InspektionsKode}${r.Charakterisierung1 || ''}${r.Charakterisierung2 || ''}${r.Streckenschaden ? ' ' + r.Streckenschaden + (r.StreckenschadenLfdNr || '') : ''}`,
    text: CODES[r.InspektionsKode] ? codeLabel({ code: r.InspektionsKode, c1: r.Charakterisierung1, c2: r.Charakterisierung2 }) : '',
    quant: [r.Quantifizierung1Numerisch, r.Quantifizierung2Numerisch].filter(Boolean).map((x) => x.replace('.', ',')).join(' / '),
    uhr: r.PositionVon ? (r.PositionBis && r.PositionBis !== '00' ? `${+r.PositionVon}–${+r.PositionBis}` : `${+r.PositionVon}`) : '',
    ber: r.Schachtbereich || '',
    kl: r._fid && r.Streckenschaden !== 'B' ? klassenKurz(klById.get(r._fid)?.klassen) : '',
    anm: [r.Kommentar, r.Fotodatei].filter(Boolean).join(' · '),
  })));
  if (bew) {
    L.ensure(30);
    L.y += 4;
    L.y += L.page.paragraph(`Zustandsbewertung nach BFR Abwasser Anhang A-3 (Stand 01/2025): Objektzahl ${bew.OZe}`
      + (bew.OZv ? ` (größter Einzelschaden ${bew.massgebend?.code}: ${bew.OZv}, Zuschlag Schadensdichte ${bew.SL})` : '')
      + `, Objektklasse ${bew.OK} – ${OBJEKTKLASSEN[bew.OK]}. Klassen je Befund: D Dichtheit, S Standsicherheit, B Betriebssicherheit`
      + (bew.pauschal ? '; * pauschale Einordnung, vom Fachingenieur zu prüfen.' : '.'), M, L.y, CW, { size: 7.2, color: GREY });
  }
  if (insp.bemerkung) {
    abschnitt(L, 'Bemerkung', 40);
    const h = wrapText(insp.bemerkung, 8.5, CW).length * 8.5 * 1.3;
    L.ensure(h);
    L.y += L.page.paragraph(insp.bemerkung, M, L.y, CW, { size: 8.5 });
  }

  // Fotos (2 je Zeile)
  const fotos = photos.filter((f) => f.image);
  if (fotos.length) {
    abschnitt(L, 'Fotos', 200);
    const w = (CW - 14) / 2;
    for (let i = 0; i < fotos.length; i += 2) {
      const pair = fotos.slice(i, i + 2);
      const hs = pair.map((f) => Math.min(w * f.image.height / f.image.width, 200));
      const rowH = Math.max(...hs) + 22;
      L.ensure(rowH);
      pair.forEach((f, j) => {
        const s = Math.min(w / f.image.width, hs[j] / f.image.height);
        const x = M + j * (w + 14);
        L.page.image(f.image, x, L.y, f.image.width * s, f.image.height * s);
        L.page.paragraph(`${names.get(f.id) || ''}${f.caption ? ': ' + f.caption : ''}`, x, L.y + f.image.height * s + 3, w, { size: 7.2, color: GREY, maxLines: 2 });
      });
      L.y += rowH;
    }
  }
}

/** Projektübersicht als erste Seite eines Sammelberichts. */
function uebersicht(L, { project, entries, optionen }) {
  L.newPage();
  const p = L.page;
  p.text('Inspektionsbericht Schächte', M, L.y, { size: 18, bold: true });
  p.text(project.name, M, L.y + 24, { size: 11, color: GREY });
  L.y += 48;
  const daten = entries.map((e) => e.inspection.datum).filter(Boolean).sort();
  infoRaster(L, [
    ['Auftraggeber', project.auftraggeber || '–'],
    ['Auftrag', [project.auftragBezeichnung, project.auftragNummer].filter(Boolean).join(' · ') || '–'],
    ['Ort', project.ort || '–'],
    ['Zeitraum', daten.length ? `${fmtDate(daten[0])} – ${fmtDate(daten[daten.length - 1])}` : '–'],
    ['Schächte', String(entries.length)],
    ['Kodiersystem', project.kodiersystem === '9' ? 'DWA-M 149-2' : 'BFR Abwasser'],
  ]);
  abschnitt(L, 'Übersicht', 60);
  const cols = [
    { key: 'nr', title: 'Nr.', w: 24 },
    { key: 'name', title: 'Schacht', w: 80, bold: true },
    { key: 'str', title: 'Straße', w: 118 },
    { key: 'datum', title: 'Datum', w: 56 },
    { key: 'tiefe', title: 'Tiefe [m]', w: 46, align: 'right' },
    { key: 'bef', title: 'Befunde', w: 44, align: 'right' },
  ];
  if (optionen.klassen) cols.push({ key: 'kl', title: 'Objektklasse', w: 64, badge: true });
  cols.push({ key: 'st', title: 'Status', w: CW - cols.reduce((s, c) => s + c.w, 0) });
  const rows = entries.map((e, i) => {
    const ok = optionen.klassen ? bewerteInspektion(e.inspection, e.manhole, project).OK : null;
    return {
      nr: String(i + 1), name: e.manhole.name, str: e.manhole.strasse || '', datum: fmtDate(e.inspection.datum),
      tiefe: fmt(e.inspection.tiefe), bef: String(e.inspection.findings?.length || 0),
      kl: ok != null ? ` ${ok} ` : '', kl_k: ok, st: e.inspection.status === 'fertig' ? 'abgeschlossen' : 'in Bearbeitung',
    };
  });
  tabelle(L, cols, rows);
  if (optionen.klassen) {
    const verteilung = [0, 1, 2, 3, 4, 5].map((k) => rows.filter((r) => r.kl_k === k).length);
    L.ensure(40);
    L.y += 8;
    let x = M;
    L.page.text('Verteilung der Objektklassen', M, L.y, { size: 8, color: GREY });
    L.y += 12;
    verteilung.forEach((n, k) => {
      klassenKachel(L.page, x, L.y, k, `${n} ${n === 1 ? 'Schacht' : 'Schächte'}`, { s: 24, size: 7.8 });
      x += CW / 6;
    });
    L.y += 34;
  }
}

/**
 * @param {object} p
 * @param {object} p.project
 * @param {object} p.settings   {company, companyAddress, companyContact}
 * @param {Array}  p.entries    [{manhole, inspection, overviewJpeg?, modellJpeg?, photos?: [{id, jpeg, caption}]}]
 * @param {Uint8Array} [p.logoJpeg]
 * @param {object} [p.optionen] {klassen: true, uebersicht: auto, fotoMuster | benenner: Dateinamen der Fotos wie im Export}
 * @returns {Uint8Array}
 */
export function protokollPdf({ project, settings = {}, entries, logoJpeg = null, optionen = {} }) {
  const opt = { klassen: true, uebersicht: entries.length > 1, ...optionen };
  const firma = { name: settings.company || '', anschrift: settings.companyAddress || '', kontakt: settings.companyContact || '' };
  const doc = new PdfDoc({
    title: entries.length === 1 ? `Schachtprotokoll ${entries[0].manhole.name}` : `Inspektionsbericht ${project.name}`,
    author: firma.name || APP_NAME,
    subject: project.name,
    creator: CREATED_WITH,
  });
  const logo = logoJpeg ? doc.addJpeg(logoJpeg) : null;
  const L = new Layout(doc, { header: (page) => kopf(page, { firma, logo }) });
  const benenner = opt.benenner || (opt.fotoMuster ? fotoBenenner({ muster: opt.fotoMuster, project }) : null);
  if (opt.uebersicht) uebersicht(L, { project, entries, optionen: opt });
  for (const e of entries) {
    const overview = e.overviewJpeg ? doc.addJpeg(e.overviewJpeg) : null;
    const modell = e.modellJpeg ? doc.addJpeg(e.modellJpeg) : null;
    const photos = (e.photos || []).map((f) => ({ ...f, image: f.jpeg ? doc.addJpeg(f.jpeg) : null }));
    schacht(L, { project, settings, manhole: e.manhole, inspection: e.inspection, overview, modell, photos, optionen: opt, benenner });
  }
  const heute = new Date().toLocaleDateString('de-DE');
  doc.pages.forEach((p, i) => fuss(p, i + 1, doc.pages.length, heute));
  return doc.toBytes();
}
