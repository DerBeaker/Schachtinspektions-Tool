// Fotoverarbeitung: Verkleinern/Komprimieren, Ausrichtung (EXIF) und Brennweite auslesen.

export const MAX_EDGE = 2400;

export function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden.')); };
    img.src = url;
  });
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Liest Brennweite (35-mm-äquivalent) aus den EXIF-Daten eines JPEG. */
export async function readExif(file) {
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) !== 0xffd8) return {};
    let off = 2;
    while (off < buf.byteLength - 4) {
      const marker = buf.getUint16(off);
      const len = buf.getUint16(off + 2);
      if (marker === 0xffe1 && buf.getUint32(off + 4) === 0x45786966) return parseTiff(buf, off + 10);
      if ((marker & 0xff00) !== 0xff00) break;
      off += 2 + len;
    }
  } catch { /* keine EXIF-Daten */ }
  return {};
}

function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, le);
  const u32 = (o) => v.getUint32(start + o, le);
  const out = {};
  const readIfd = (ifd, cb) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      cb(u16(e), u16(e + 2), e + 8);
    }
  };
  let exifPtr = null;
  readIfd(u32(4), (tag, type, valOff) => {
    if (tag === 0x8769) exifPtr = u32(valOff);
  });
  if (exifPtr) {
    readIfd(exifPtr, (tag, type, valOff) => {
      if (tag === 0xa405) out.f35 = u16(valOff);
      if (tag === 0x920a) { const p = u32(valOff); out.f = u32(p) / u32(p + 4); }
    });
  }
  return out;
}

/**
 * Verkleinert ein Foto auf max. MAX_EDGE Pixel und liefert JPEG + Maße + EXIF-Infos.
 */
export async function processPhoto(file, maxEdge = MAX_EDGE) {
  const exif = await readExif(file);
  const img = await loadImage(file);
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const s = Math.min(1, maxEdge / Math.max(w0, h0));
  const w = Math.round(w0 * s), hgt = Math.round(h0 * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  c.getContext('2d').drawImage(img, 0, 0, w, hgt);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.85);
  return { blob, width: w, height: hgt, origWidth: w0, origHeight: h0, exif };
}

/** Verkleinerte Fassung (z. B. für KI-Analyse oder Vorschau). */
export async function downscale(blob, maxEdge = 1568, quality = 0.82) {
  const img = await loadImage(blob);
  const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', quality);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Wählt ein Foto über die Kamera (Handy) bzw. Dateiauswahl (PC). */
export function pickPhoto({ camera = true } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (camera) inp.capture = 'environment';
    inp.style.display = 'none';
    inp.onchange = () => { resolve(inp.files[0] || null); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    inp.onchange = () => { resolve(inp.files[0] || null); inp.remove(); };
    document.body.appendChild(inp);
    inp.click();
  });
}
