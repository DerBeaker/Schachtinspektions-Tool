// Kleiner PDF-Generator ohne Abhängigkeiten (läuft im Browser und in Node):
// A4-Seiten, Standardschriften Helvetica/Helvetica-Bold (WinAnsi, also mit Umlauten, €, „“, –),
// Linien, Rechtecke, Text mit Zeilenumbruch und JPEG-Bilder. Koordinaten in Punkt (1/72 Zoll),
// Ursprung oben links (wird intern in das PDF-Koordinatensystem umgerechnet).

import { HELVETICA, HELVETICA_BOLD } from './pdf-fonts.js';

export const A4 = { w: 595.28, h: 841.89 };
export const mm = (v) => (v * 72) / 25.4;

// Unicode -> WinAnsi (cp1252) für die Zeichen 0x80–0x9F
const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const REPLACE = { 0x2264: '<=', 0x2265: '>=', 0x2192: '->', 0x00a0: ' ', 0x2212: '-', 0x2011: '-', 0x200b: '' };

/** Text in WinAnsi-Bytes umwandeln (nicht darstellbare Zeichen werden ersetzt). */
export function winAnsi(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0);
    if (REPLACE[c] !== undefined) { for (const r of REPLACE[c]) out.push(r.charCodeAt(0)); continue; }
    if (c === 9 || c === 10 || c === 13) { out.push(32); continue; }
    if (c >= 32 && c < 127) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (CP1252[c]) out.push(CP1252[c]);
    else out.push(63); // ?
  }
  return out;
}

const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
const num = (v) => (Math.round(v * 100) / 100).toString();

function parseColor(c) {
  if (!c) return null;
  if (Array.isArray(c)) return c;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0];
}

/** Breite eines Textes in Punkt. */
export function textWidth(str, size, bold = false) {
  const t = bold ? HELVETICA_BOLD : HELVETICA;
  let w = 0;
  for (const b of winAnsi(str)) w += t[b - 32] || 556;
  return (w * size) / 1000;
}

/** Zeilenumbruch nach Wörtern (überlange Wörter werden hart getrennt). */
export function wrapText(str, size, maxWidth, bold = false) {
  const lines = [];
  for (const para of String(str ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (textWidth(test, size, bold) <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      if (textWidth(word, size, bold) <= maxWidth) { line = word; continue; }
      // Wort zu lang: zeichenweise trennen
      let part = '';
      for (const ch of word) {
        if (textWidth(part + ch, size, bold) > maxWidth && part) { lines.push(part); part = ''; }
        part += ch;
      }
      line = part;
    }
    lines.push(line);
  }
  return lines;
}

/** Abmessungen und Farbkanäle eines JPEG aus dem SOF-Segment lesen. */
export function jpegInfo(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Kein JPEG-Bild');
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error('JPEG ohne Größenangabe');
}

class Page {
  constructor(doc) { this.doc = doc; this.ops = []; this.fonts = new Set(); this.images = new Set(); }
  y(v) { return A4.h - v; }

  text(str, x, y, { size = 10, bold = false, color = '#000000', align = 'left', maxWidth } = {}) {
    let s = String(str ?? '');
    if (maxWidth) while (s.length > 1 && textWidth(s, size, bold) > maxWidth) s = s.slice(0, -2) + '…';
    const w = textWidth(s, size, bold);
    const dx = align === 'right' ? -w : align === 'center' ? -w / 2 : 0;
    const f = bold ? 'F2' : 'F1';
    this.fonts.add(f);
    const [r, g, b] = parseColor(color);
    this.ops.push(`BT /${f} ${num(size)} Tf ${num(r)} ${num(g)} ${num(b)} rg ${num(x + dx)} ${num(this.y(y) - size * 0.8)} Td <${hex(winAnsi(s))}> Tj ET`);
    return w;
  }

  /** Mehrzeiliger Text; liefert die benötigte Höhe. */
  paragraph(str, x, y, width, { size = 10, bold = false, color = '#000000', lineHeight = 1.3, maxLines } = {}) {
    let lines = wrapText(str, size, width, bold);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += ' …'; }
    lines.forEach((l, i) => this.text(l, x, y + i * size * lineHeight, { size, bold, color }));
    return lines.length * size * lineHeight;
  }

  line(x1, y1, x2, y2, { width = 0.5, color = '#000000' } = {}) {
    const [r, g, b] = parseColor(color);
    this.ops.push(`${num(width)} w ${num(r)} ${num(g)} ${num(b)} RG ${num(x1)} ${num(this.y(y1))} m ${num(x2)} ${num(this.y(y2))} l S`);
  }

  rect(x, y, w, h, { fill, stroke, width = 0.5, radius = 0 } = {}) {
    const parts = [];
    if (fill) { const [r, g, b] = parseColor(fill); parts.push(`${num(r)} ${num(g)} ${num(b)} rg`); }
    if (stroke) { const [r, g, b] = parseColor(stroke); parts.push(`${num(width)} w ${num(r)} ${num(g)} ${num(b)} RG`); }
    if (radius > 0) {
      const k = 0.5523 * radius, X = x, Y = this.y(y), W = w, H = h;
      parts.push(`${num(X + radius)} ${num(Y)} m ${num(X + W - radius)} ${num(Y)} l ${num(X + W - radius + k)} ${num(Y)} ${num(X + W)} ${num(Y - radius + k)} ${num(X + W)} ${num(Y - radius)} c`
        + ` ${num(X + W)} ${num(Y - H + radius)} l ${num(X + W)} ${num(Y - H + radius - k)} ${num(X + W - radius + k)} ${num(Y - H)} ${num(X + W - radius)} ${num(Y - H)} c`
        + ` ${num(X + radius)} ${num(Y - H)} l ${num(X + radius - k)} ${num(Y - H)} ${num(X)} ${num(Y - H + radius - k)} ${num(X)} ${num(Y - H + radius)} c`
        + ` ${num(X)} ${num(Y - radius)} l ${num(X)} ${num(Y - radius + k)} ${num(X + radius - k)} ${num(Y)} ${num(X + radius)} ${num(Y)} c h`);
    } else {
      parts.push(`${num(x)} ${num(this.y(y) - h)} ${num(w)} ${num(h)} re`);
    }
    parts.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    this.ops.push(parts.join(' '));
  }

  image(img, x, y, w, h) {
    this.images.add(img.name);
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.y(y) - h)} cm /${img.name} Do Q`);
  }
}

export class PdfDoc {
  constructor({ title = '', author = '', subject = '', creator = '' } = {}) {
    this.info = { title, author, subject, creator };
    this.pages = [];
    this.imgs = [];
  }

  addPage() { const p = new Page(this); this.pages.push(p); return p; }

  /** JPEG-Bild registrieren (einmal, auf beliebig vielen Seiten nutzbar). */
  addJpeg(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const info = jpegInfo(b);
    const img = { name: `Im${this.imgs.length + 1}`, bytes: b, ...info };
    this.imgs.push(img);
    return img;
  }

  /** @returns {Uint8Array} */
  toBytes() {
    const enc = new TextEncoder();
    const chunks = [];
    let length = 0;
    const offsets = [];
    const push = (data) => { const u = typeof data === 'string' ? latin1(data) : data; chunks.push(u); length += u.length; };
    const latin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; };
    const obj = (id, body) => { offsets[id] = length; push(`${id} 0 obj\n`); for (const part of [].concat(body)) push(part); push('\nendobj\n'); };
    const textString = (s) => {
      const str = String(s ?? '');
      if (/^[\x20-\x7e]*$/.test(str)) return `(${str.replace(/[\\()]/g, '\\$&')})`;
      let h = 'FEFF';
      for (let i = 0; i < str.length; i++) h += str.charCodeAt(i).toString(16).padStart(4, '0');
      return `<${h}>`;
    };
    void enc;

    // Objektnummern: 1 Katalog, 2 Seitenbaum, 3/4 Schriften, 5 Info, danach Bilder, danach Seiten+Inhalte
    const imgBase = 6;
    const pageBase = imgBase + this.imgs.length;
    const pageIds = this.pages.map((_, i) => pageBase + i * 2);
    push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const date = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    obj(5, `<< /Title ${textString(this.info.title)} /Author ${textString(this.info.author)} /Subject ${textString(this.info.subject)} /Creator ${textString(this.info.creator)} /Producer ${textString(this.info.creator)} /CreationDate (${date}) >>`);
    this.imgs.forEach((img, i) => {
      const cs = img.components === 1 ? '/DeviceGray' : img.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      const decode = img.components === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
      obj(imgBase + i, [`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${decode} /Length ${img.bytes.length} >>\nstream\n`, img.bytes, '\nendstream']);
    });
    this.pages.forEach((p, i) => {
      const id = pageIds[i];
      const fonts = `/Font << /F1 3 0 R /F2 4 0 R >>`;
      const xo = p.images.size ? `/XObject << ${[...p.images].map((n) => `/${n} ${imgBase + this.imgs.findIndex((x) => x.name === n)} 0 R`).join(' ')} >>` : '';
      obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << ${fonts} ${xo} >> /Contents ${id + 1} 0 R >>`);
      const content = p.ops.join('\n');
      obj(id + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    });
    const xref = length;
    const count = pageBase + this.pages.length * 2;
    push(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let i = 1; i < count; i++) push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(length);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}
