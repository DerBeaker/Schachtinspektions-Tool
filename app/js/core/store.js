// Datenzugriff für Projekte, Schächte, Inspektionen und Fotos (lokal, mit Sync-Markierung).

import { db } from './db.js';
import { uid } from './util.js';
import { importDatei } from '../isybau/import.js';
import { newInspection, connectionsFromStamm } from '../isybau/model.js';
import { toWgs84 } from '../lib/geo.js';

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind, item) { for (const fn of listeners) fn(kind, item); }

function touch(rec) {
  rec.updatedAt = Date.now();
  rec.dirty = true;
  return rec;
}

// ---- Einstellungen ---------------------------------------------------------
export const DEFAULT_SETTINGS = {
  inspector: '',
  company: '',
  companyAddress: '',
  companyContact: '',
  logo: '', // Firmenlogo als JPEG-Data-URL (für PDF-Berichte)
  bezugVertikal: '1',
  exportVersion: '2017-07',
  serverUrl: '',
  ai: true,
};

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await db.getMeta('settings', {})) };
}
export async function saveSettings(s) {
  await db.setMeta('settings', s);
  emit('settings', s);
}

// ---- Projekte --------------------------------------------------------------
export async function listProjects() {
  const [projects, manholes, inspections] = await Promise.all([db.all('projects'), db.all('manholes'), db.all('inspections')]);
  return projects.filter((p) => !p.deleted).map((p) => {
    const ms = manholes.filter((m) => m.projectId === p.id && !m.deleted);
    const is = inspections.filter((i) => i.projectId === p.id && !i.deleted);
    return {
      ...p,
      stats: {
        total: ms.length,
        fertig: is.filter((i) => i.status === 'fertig').length,
        inArbeit: is.filter((i) => i.status !== 'fertig').length,
      },
    };
  }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export const getProject = (id) => db.get('projects', id);

export async function saveProject(p) {
  await db.put('projects', touch(p));
  emit('project', p);
  return p;
}

export async function createProject(data = {}) {
  const settings = await getSettings();
  const p = {
    id: uid(),
    name: data.name || 'Neues Projekt',
    ort: data.ort || '',
    auftragBezeichnung: data.auftragBezeichnung || data.name || '',
    auftragNummer: '',
    auftragKennung: 1,
    auftragDatum: '',
    zweck: '2',
    kodiersystem: '10',
    bezugVertikal: settings.bezugVertikal || '1',
    crsLage: data.crsLage || '',
    crsHoehe: data.crsHoehe || '',
    stammdatenDatei: data.stammdatenDatei || '',
    createdAt: Date.now(),
  };
  return saveProject(p);
}

export async function deleteProject(id) {
  const [ms, is, ps] = await Promise.all([
    db.byIndex('manholes', 'projectId', id), db.byIndex('inspections', 'projectId', id), db.byIndex('photos', 'projectId', id),
  ]);
  const p = await getProject(id);
  // Für den Sync als gelöscht markieren statt sofort entfernen
  for (const r of [...ms, ...is]) { r.deleted = true; touch(r); }
  await db.putMany('manholes', ms);
  await db.putMany('inspections', is);
  await db.delMany('photos', ps.map((x) => x.id));
  if (p) { p.deleted = true; await db.put('projects', touch(p)); }
  emit('project', null);
}

/**
 * Importiert eine Austauschdatei (ISYBAU 2006–2024 oder DWA-M 150) in ein neues oder
 * bestehendes Projekt: Stammdaten -> Schächte, vorhandene Inspektionen -> Vorinspektion je Schacht.
 */
export async function importIntoProject(buffer, { projectId, fileName } = {}) {
  const { stamm, zustand, format } = importDatei(buffer);
  const vors = zustand?.vorinspektionen || [];
  const version = stamm?.version || zustand?.version || '';
  const warnings = [...(stamm?.warnings || [])];
  let project = projectId ? await getProject(projectId) : null;
  if (!project) {
    project = await createProject({
      name: stamm?.liegenschaft || (fileName || 'Import').replace(/\.xml$/i, ''),
      ort: stamm?.manholes[0]?.ortsteil || vors[0]?.ortsteil || '',
      crsLage: stamm?.crsLage || '', crsHoehe: stamm?.crsHoehe || '', stammdatenDatei: fileName || '',
    });
    // Abgabe standardmäßig im Format der gelieferten Datei
    if (format === 'm150') project.exportFormat = 'm150';
    else if (['2006-10', '2013-02', '2017-07', '2024-06'].includes(version)) project.exportFormat = version;
  } else if (stamm) {
    project.crsLage = stamm.crsLage || project.crsLage;
    project.crsHoehe = stamm.crsHoehe || project.crsHoehe;
    project.stammdatenDatei = fileName || project.stammdatenDatei;
  }
  if (stamm?.liegenschaftDaten) {
    project.liegenschaftNummer ||= stamm.liegenschaftDaten.nummer;
    project.liegenschaftBezeichnung ||= stamm.liegenschaftDaten.bezeichnung;
  }
  const existing = await db.byIndex('manholes', 'projectId', project.id);
  const byName = new Map(existing.filter((m) => !m.deleted).map((m) => [m.name, m]));
  let added = 0, updated = 0;
  for (const m of stamm?.manholes || []) {
    const old = byName.get(m.name);
    if (old) updated++; else added++;
    const wgs = m.x != null ? toWgs84(m.x, m.y, m.crs || stamm.crsLage) : null;
    byName.set(m.name, { ...(old || {}), ...m, id: old?.id || uid(), projectId: project.id, source: format || 'isybau', wgs, createdAt: old?.createdAt || Date.now() });
  }
  // Vorinspektionen: je Schacht die jüngste behalten; unbekannte Schächte anlegen
  let vorCount = 0;
  for (const v of vors.sort((a, b) => String(a.datum).localeCompare(String(b.datum)))) {
    if (!v.objekt) continue;
    let m = byName.get(v.objekt);
    if (!m) {
      m = { id: uid(), projectId: project.id, name: v.objekt, strasse: v.strasse || '', ortsteil: v.ortsteil || '', tiefe: v.tiefe ?? null, pipes: [], source: 'vorinspektion', createdAt: Date.now() };
      added++;
    }
    const { objekt, strasse, ortsteil, ...vi } = v;
    m = { ...m, vorinspektion: { ...vi, importiert: Date.now(), datei: fileName || '' } };
    if (m.tiefe == null && v.tiefe != null) m.tiefe = v.tiefe;
    byName.set(v.objekt, m);
    vorCount++;
  }
  const touched = new Set([...(stamm?.manholes || []).map((m) => m.name), ...vors.map((v) => v.objekt)]);
  await db.putMany('manholes', [...byName.values()].filter((m) => touched.has(m.name)).map(touch));
  await saveProject(project);
  return { project, added, updated, vorinspektionen: vorCount, warnings, version, format };
}

// ---- Schächte --------------------------------------------------------------
export async function listManholes(projectId) {
  const [ms, is] = await Promise.all([db.byIndex('manholes', 'projectId', projectId), db.byIndex('inspections', 'projectId', projectId)]);
  const byM = new Map();
  for (const i of is) if (!i.deleted) byM.set(i.manholeId, i);
  return ms.filter((m) => !m.deleted).map((m) => ({ ...m, inspection: byM.get(m.id) || null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
}

export const getManhole = (id) => db.get('manholes', id);

export async function saveManhole(m) {
  await db.put('manholes', touch(m));
  emit('manhole', m);
  return m;
}

export async function addManhole(projectId, data) {
  return saveManhole({
    id: uid(), projectId, name: data.name, strasse: data.strasse || '', ortsteil: data.ortsteil || '',
    tiefe: data.tiefe ?? null, pipes: [], source: 'manuell', createdAt: Date.now(),
  });
}

// ---- Inspektionen ----------------------------------------------------------
export async function getInspectionForManhole(manholeId) {
  const list = (await db.byIndex('inspections', 'manholeId', manholeId)).filter((i) => !i.deleted);
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}

export const getInspection = (id) => db.get('inspections', id);

export async function openOrCreateInspection(manholeId) {
  const existing = await getInspectionForManhole(manholeId);
  if (existing) return existing;
  const manhole = await getManhole(manholeId);
  const project = await getProject(manhole.projectId);
  const settings = await getSettings();
  const insp = newInspection({ id: uid(), project, manhole, inspector: settings.inspector });
  insp.connections = connectionsFromStamm(manhole, uid);
  // ohne Stammdaten-Leitungen: Anschlüsse (Lage, DN) aus der Vorinspektion vorbelegen
  if (!insp.connections.length && manhole.vorinspektion?.connections?.length) {
    insp.connections = manhole.vorinspektion.connections.map((c) => ({ ...structuredClone(c), id: uid() }));
  }
  insp.createdAt = Date.now();
  await saveInspection(insp);
  return insp;
}

export async function saveInspection(insp) {
  await db.put('inspections', touch(insp));
  emit('inspection', insp);
  return insp;
}

export async function deleteInspection(insp) {
  const photos = await db.byIndex('photos', 'inspectionId', insp.id);
  await db.delMany('photos', photos.map((p) => p.id));
  insp.deleted = true;
  await db.put('inspections', touch(insp));
  emit('inspection', insp);
}

// ---- Fotos -----------------------------------------------------------------
export async function addPhoto(insp, processed, kind = 'finding') {
  const rec = {
    id: uid(), inspectionId: insp.id, projectId: insp.projectId, kind,
    blob: processed.blob, width: processed.width, height: processed.height, exif: processed.exif || {},
    createdAt: Date.now(), uploaded: false,
  };
  await db.put('photos', rec);
  return rec;
}

export const getPhoto = (id) => (id ? db.get('photos', id) : Promise.resolve(null));
export const deletePhoto = (id) => db.del('photos', id);

const urlCache = new Map();
/** Objekt-URL für ein Foto (zwischengespeichert). */
export async function photoUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const p = await getPhoto(id);
  if (!p) return null;
  let blob = p.blob;
  if (!blob && p.remote) {
    const { sync } = await import('../sync.js');
    blob = await sync.fetchPhoto(p).catch(() => null);
  }
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urlCache.set(id, u);
  return u;
}

export async function storageInfo() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage || 0, quota: e.quota || 0 };
}
