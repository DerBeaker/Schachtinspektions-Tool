export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
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
