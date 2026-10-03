// Vertrag (AVV oder Nutzungsbedingungen) als PDF für die Unterlagen des Kunden – mit den Vertragsparteien
// und dem Nachweis der elektronischen Annahme (Name, Funktion, Zeitpunkt, Fassung). Ohne DOM.

import { PdfDoc, A4, wrapText } from '../lib/pdf.js';
import { APP_NAME, CREATED_WITH } from '../brand.js';

const M = 50;
const CW = A4.w - 2 * M;
const BOTTOM = A4.h - 50;
const BLUE = '#0a5bd3';
const GREY = '#5b6b82';
// Zeichen außerhalb von Windows-1252 ersetzen
const pdfText = (s) => String(s ?? '').replace(/→/g, '>').replace(/[‐‑]/g, '-');

function zeit(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())} Uhr`;
}

/**
 * @param v Vertrag aus data/vertraege.js
 * @param kunde { name, anschrift }
 * @param annahme { am (Unix-Sekunden), name, funktion, email, version } oder null (unbestätigter Entwurf)
 */
export function vertragPdf(v, { kunde = {}, annahme = null } = {}) {
  const doc = new PdfDoc({ title: v.titel, author: APP_NAME, subject: v.kurz, creator: CREATED_WITH });
  let page;
  let y;
  const neueSeite = () => {
    page = doc.addPage();
    page.text(`${APP_NAME} · ${v.kurz} · Fassung ${v.version}`, M, 30, { size: 7.5, color: GREY });
    page.line(M, 44, A4.w - M, 44, { width: 0.6, color: BLUE });
    y = 60;
  };
  // Absatz mit Zeilenumbruch; lange Absätze laufen auf der nächsten Seite weiter
  const absatz = (text, { size = 9, bold = false, einzug = 0, abstand = 4, color } = {}) => {
    const lh = size * 1.3;
    for (const zeile of wrapText(pdfText(text), size, CW - einzug, bold)) {
      if (y + lh > BOTTOM) neueSeite();
      page.text(zeile, M + einzug, y, { size, bold, color });
      y += lh;
    }
    y += abstand;
  };
  neueSeite();
  absatz(v.titel, { size: 14, bold: true, abstand: 2 });
  absatz(`Fassung ${v.version} · Stand ${v.stand}`, { size: 8.5, color: GREY, abstand: 12 });
  if (v.parteien) {
    const ag = kunde.name ? `${kunde.name}${kunde.anschrift ? ', ' + String(kunde.anschrift).replace(/\s*\n\s*/g, ', ') : ''} (Verantwortlicher, im Folgenden „Auftraggeber“)` : v.parteien.auftraggeber;
    absatz('zwischen', { size: 9, color: GREY, abstand: 2 });
    absatz(ag, { size: 9.5, bold: true, abstand: 6 });
    absatz('und', { size: 9, color: GREY, abstand: 2 });
    absatz(v.parteien.auftragnehmer, { size: 9.5, bold: true, abstand: 12 });
  } else if (kunde.name) {
    absatz(`Kunde: ${kunde.name}`, { size: 9.5, bold: true, abstand: 12 });
  }
  for (const a of v.abschnitte) {
    if (y + 40 > BOTTOM) neueSeite();
    absatz(a.titel, { size: 10.5, bold: true, abstand: 4 });
    for (const p of a.absaetze) {
      if (Array.isArray(p)) p.forEach((x) => absatz(`–  ${x}`, { einzug: 10, abstand: 2.5 }));
      else absatz(p);
    }
    y += 6;
  }
  // Nachweis der Annahme
  if (y + 90 > BOTTOM) neueSeite();
  page.rect(M, y, CW, 74, { fill: '#eef3fb', stroke: '#c6d4ea', radius: 4 });
  const x = M + 12;
  page.text('Elektronischer Vertragsschluss', x, y + 10, { size: 10, bold: true, color: BLUE });
  if (annahme) {
    const zeilen = [
      `Angenommen am ${zeit(annahme.am)} für ${kunde.name || 'den Auftraggeber'}`,
      `durch ${annahme.name}${annahme.funktion ? ` (${annahme.funktion})` : ''}${annahme.email ? `, ${annahme.email}` : ''}`,
      `Fassung ${annahme.version || v.version}. Die Annahme ist beim Auftragnehmer gespeichert und wurde per E-Mail bestätigt.`,
    ];
    zeilen.forEach((z, i) => page.text(pdfText(z), x, y + 28 + i * 12, { size: 8.8, maxWidth: CW - 24 }));
  } else {
    page.paragraph('Noch nicht angenommen. Der Vertrag wird in der App unter Einstellungen > Abo & Verträge bzw. bei der Registrierung elektronisch geschlossen.', x, y + 28, CW - 24, { size: 8.8 });
  }
  doc.pages.forEach((p, i) => p.text(`Seite ${i + 1} von ${doc.pages.length}`, A4.w - M, A4.h - 30, { size: 7.5, color: GREY, align: 'right' }));
  return doc.toBytes();
}
