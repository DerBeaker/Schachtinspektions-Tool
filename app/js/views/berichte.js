// Berichte im Browser erzeugen: Schachtprotokolle (PDF) und Aufmaß (PDF/Excel).
// Bereitet Bilder auf (Übersichtsfoto mit Uhr und Anschlüssen, Fotos verkleinert,
// Firmenlogo) und bietet die Datei zum Herunterladen bzw. Teilen an.

import { toast, sheet, h, btn } from '../core/ui.js';
import { getSettings, getPhoto, photoUrl } from '../core/store.js';
import { loadImage, canvasToBlob } from '../lib/image.js';
import { pointForHour } from '../components/photoview.js';
import { protokollPdf } from '../report/protokoll.js';
import { aufmassDaten, aufmassPdf, aufmassXlsx, parseStaffel } from '../report/aufmass.js';
import { codeLabel, fullCode } from '../data/codes.js';
import { download } from '../core/util.js';
import { hatBauteile } from '../isybau/bauteile.js';

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || '').split(',')[1];
  if (!b64) return null;
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function photoBlob(id) {
  if (!id) return null;
  const rec = await getPhoto(id);
  if (rec?.blob) return rec.blob;
  const u = await photoUrl(id); // lädt Fotos anderer Geräte vom Server
  return u ? (await fetch(u)).blob() : null;
}

/** Foto verkleinert als JPEG-Bytes (für kleine PDF-Dateien). */
async function photoJpeg(id, maxEdge = 1200) {
  const blob = await photoBlob(id);
  if (!blob) return null;
  const img = await loadImage(blob);
  const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return bytesOf(await canvasToBlob(c, 'image/jpeg', 0.8));
}

/** Übersichtsfoto mit Zifferblatt und Anschlüssen (wie in der App) als JPEG. */
async function overviewJpeg(insp, maxEdge = 1400) {
  const blob = await photoBlob(insp.overview?.photoId);
  if (!blob) return null;
  const img = await loadImage(blob);
  const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * s), H = Math.round(img.naturalHeight * s);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  const clock = insp.overview.clock || { cx: 0.5, cy: 0.5, r: 0.36, rot: 0 };
  const k = Math.max(W, H) / 400;
  const cx = clock.cx * W, cy = clock.cy * H, R = clock.r * Math.min(W, H);
  g.lineWidth = 2.2 * k; g.strokeStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.font = `bold ${11 * k}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let hr = 1; hr <= 12; hr++) {
    const [x1, y1] = pointForHour(clock, W, H, hr, 0.93);
    const [x2, y2] = pointForHour(clock, W, H, hr, 1.0);
    g.lineWidth = (hr % 3 ? 1.5 : 3) * k;
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    if (hr % 3 === 0) {
      const [tx, ty] = pointForHour(clock, W, H, hr, 1.12);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(tx, ty, 9 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.fillText(String(hr), tx, ty);
    }
  }
  for (const con of insp.connections || []) {
    if (!con.clock) continue;
    const [x, y] = pointForHour(clock, W, H, con.clock, 0.8);
    g.fillStyle = con.dir === 'out' ? '#2b8a3e' : con.dir === 'closed' ? '#868e96' : '#1c7ed6';
    g.strokeStyle = '#fff'; g.lineWidth = 2 * k;
    g.beginPath(); g.arc(x, y, 10 * k, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${9 * k}px Helvetica, Arial, sans-serif`;
    g.fillText(con.dir === 'out' ? 'A' : con.dir === 'closed' ? 'V' : 'Z', x, y);
    if (con.dn) {
      g.font = `bold ${8 * k}px Helvetica, Arial, sans-serif`;
      const t = `DN ${con.dn}`;
      const tw = g.measureText(t).width + 6 * k;
      const [lx, ly] = pointForHour(clock, W, H, con.clock, 0.6);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(lx - tw / 2, ly - 7 * k, tw, 14 * k);
      g.fillStyle = '#fff'; g.fillText(t, lx, ly);
    }
  }
  return bytesOf(await canvasToBlob(c, 'image/jpeg', 0.85));
}

/** 3D-Bild des Schachts, wenn Bauteile erfasst sind (ohne WebGL: null). */
async function modellJpeg(manhole, inspection) {
  const bauteile = hatBauteile(inspection.bauteile) ? inspection.bauteile : manhole.bauteile;
  if (!hatBauteile(bauteile)) return null;
  try {
    const { schachtModellBild } = await import('../components/modell3d.js');
    const blob = await schachtModellBild({ bauteile, inspection });
    return blob ? bytesOf(blob) : null;
  } catch { return null; }
}

async function logoJpeg(settings) {
  return settings.logo ? dataUrlBytes(settings.logo) : null;
}

/** Datei anbieten: auf dem Handy über „Teilen“, sonst als Download. */
export async function offerFile(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  if (window.SB_DEMO) {
    // In der Vorschau sind Downloads gesperrt: im neuen Tab öffnen, wenn möglich
    const u = URL.createObjectURL(blob);
    const w = window.open(u, '_blank');
    if (!w) toast('In der Demo-Vorschau können keine Dateien gespeichert werden.', 'info', 5000);
    return;
  }
  const file = typeof File === 'function' ? new File([blob], name, { type }) : null;
  const mobile = matchMedia('(pointer: coarse)').matches;
  if (mobile && file && navigator.canShare?.({ files: [file] })) {
    const s = sheet({
      title: name,
      body: h('p', { class: 'muted' }, 'Datei ist fertig. Teilen (z. B. per E-Mail) oder auf dem Gerät speichern?'),
      actions: [
        btn('Speichern', { icon: 'download', onClick: () => { s.close(); download(blob, name, type); } }),
        btn('Teilen', { icon: 'upload', variant: 'primary', onClick: async () => { s.close(); try { await navigator.share({ files: [file], title: name }); } catch { /* abgebrochen */ } } }),
      ],
    });
    return;
  }
  download(blob, name, type);
}

const safe = (s) => String(s || 'Projekt').replace(/[^\wäöüÄÖÜß.-]+/g, '_').slice(0, 40);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Schachtprotokolle als PDF. items: [{manhole, inspection}]
 */
export async function protokollErzeugen({ project, items, fotos = true }) {
  const settings = await getSettings();
  const t = toast(`PDF wird erstellt … (${items.length} ${items.length === 1 ? 'Schacht' : 'Schächte'})`, 'info', 60000);
  try {
    const entries = [];
    for (const { manhole, inspection } of items) {
      const photos = [];
      if (fotos) {
        for (const f of inspection.findings || []) {
          if (!f.photoId) continue;
          photos.push({ id: f.photoId, jpeg: await photoJpeg(f.photoId).catch(() => null), caption: `${fullCode(f)} ${codeLabel(f)}`.trim() });
        }
        for (const c of inspection.connections || []) {
          if (c.photoId) photos.push({ id: c.photoId, jpeg: await photoJpeg(c.photoId).catch(() => null), caption: `Anschluss ${c.clock || ''} Uhr` });
        }
      }
      entries.push({ manhole, inspection, overviewJpeg: await overviewJpeg(inspection).catch(() => null), modellJpeg: await modellJpeg(manhole, inspection), photos });
    }
    const bytes = protokollPdf({ project, settings, entries, logoJpeg: await logoJpeg(settings) });
    const name = items.length === 1 ? `Schachtprotokoll_${safe(items[0].manhole.name)}_${today()}.pdf` : `Inspektionsbericht_${safe(project.name)}_${today()}.pdf`;
    t.remove?.();
    await offerFile(bytes, name, 'application/pdf');
    toast('PDF erstellt.', 'ok');
  } catch (e) {
    console.error(e);
    toast('PDF konnte nicht erstellt werden: ' + e.message, 'error', 6000);
  }
}

export function aufmassOptionen(project) {
  const a = project.aufmass || {};
  return { staffel: parseStaffel(a.staffel ?? '2; 3; 5'), grenztiefe: Number(String(a.grenztiefe ?? '3').replace(',', '.')) || 0 };
}

export async function aufmassErzeugen({ project, items, format = 'pdf' }) {
  const settings = await getSettings();
  try {
    const daten = aufmassDaten(items, aufmassOptionen(project));
    if (format === 'xlsx') {
      await offerFile(aufmassXlsx({ project, settings, daten }), `Aufmass_${safe(project.name)}_${today()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } else {
      await offerFile(aufmassPdf({ project, settings, daten, logoJpeg: await logoJpeg(settings) }), `Aufmass_${safe(project.name)}_${today()}.pdf`, 'application/pdf');
    }
  } catch (e) {
    console.error(e);
    toast('Aufmaß konnte nicht erstellt werden: ' + e.message, 'error', 6000);
  }
}

/** Logo-Datei (PNG/JPG/SVG) auf weißem Grund als JPEG-Data-URL (max. 600 px breit). */
export async function logoAusDatei(file) {
  const img = await loadImage(file);
  const s = Math.min(1, 600 / img.naturalWidth, 240 / img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
