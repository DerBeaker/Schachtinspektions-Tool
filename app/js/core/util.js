export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UNIT_TO_M = { mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, "'": 0.3048, in: 0.0254, '"': 0.0254 };

/**
 * Zahl aus Tastatur oder Laser-Entfernungsmesser (Bluetooth im Tastaturmodus) lesen:
 * „2,345“, „2.345 m“, „2345mm“, „234,5 cm“. Mit Einheit wird in `unit` ('m' oder 'mm')
 * umgerechnet. Liefert den Wert als String mit Punkt, '' für leer, null für ungültig.
 */
export function parseMeasure(raw, unit) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  const m = /^([+-]?[\d.,]*\d[\d.,]*)(mm|cm|m|ft|in|'|")?$/.exec(s);
  if (!m) return null;
  let n = m[1];
  // letztes Trennzeichen = Dezimalzeichen („1.234,5“, „1,234.5“, „2,35“, „2.345“)
  const last = Math.max(n.lastIndexOf(','), n.lastIndexOf('.'));
  if (last >= 0) n = n.slice(0, last).replace(/[.,]/g, '') + '.' + n.slice(last + 1);
  let v = Number(n);
  if (!Number.isFinite(v)) return null;
  if (m[2] && (unit === 'm' || unit === 'mm')) v = v * UNIT_TO_M[m[2]] * (unit === 'mm' ? 1000 : 1);
  return String(Math.round(v * 1000) / 1000);
}

export const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));

export function fmtNum(v, dec = 2) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '–';
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtM(v) {
  return v === null || v === undefined || v === '' ? '–' : `${fmtNum(v, 2)} m`;
}

export function fmtDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function fmtRelative(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return new Date(ts).toLocaleDateString('de-DE');
}

export function debounce(fn, ms = 300) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function clockLabel(from, to) {
  if (!from) return '';
  return to ? `${from}–${to} Uhr` : `${from} Uhr`;
}

export function download(blobOrParts, filename, type = 'application/octet-stream') {
  const blob = blobOrParts instanceof Blob ? blobOrParts : new Blob(blobOrParts, { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export function readFile(file, as = 'arrayBuffer') {
  return file[as] ? file[as]() : new Response(file)[as]();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
