// Fachmodell einer Schachtinspektion und Umwandlung in ISYBAU-Zustandsdatensätze (KZustand).

import { normBauteile } from './bauteile.js';
import { CODES } from '../data/codes.js';

export const round2 = (v) => Math.round(v * 100) / 100;

/** Neue, leere Inspektion für einen Schacht (vorbelegt aus Stammdaten und Einstellungen). */
export function newInspection({ id, project, manhole, inspector, now = new Date() }) {
  const pad = (n) => String(n).padStart(2, '0');
  const insp = {
    id,
    projectId: project.id,
    manholeId: manhole.id,
    manholeName: manhole.name,
    status: 'offen',
    datum: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    uhrzeit: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    inspekteur: inspector || '',
    wetter: '1',
    temperatur: '',
    reinigung: false,
    wasserhaltung: '1',
    verfahren: '2',
    bezugVertikal: project.bezugVertikal || '1',
    bezugHorizontal: '1',
    tiefe: manhole.tiefe ?? null,
    tiefeQuelle: manhole.tiefe != null ? 'stamm' : '',
    innenschutz: manhole.schacht?.innenschutz || '',
    // Bauteilbeschreibung (Abdeckung, Konus, Ringe, Unterteil, Gerinne …), vorbelegt aus den Stammdaten
    bauteile: manhole.bauteile ? normBauteile(manhole.bauteile) : null,
    artAuskleidung: '',
    bemerkung: '',
    overview: { photoId: null, clock: { cx: 0.5, cy: 0.5, r: 0.36, rot: 0 } },
    connections: [],
    findings: [],
  };
  return insp;
}

/** Anschlüsse aus den Stammdaten vorschlagen. */
export function connectionsFromStamm(manhole, makeId) {
  return (manhole.pipes || []).map((p) => {
    const h = p.hoeheUeberSohle;
    const high = h != null && h > 0.5;
    return {
      id: makeId(),
      dir: p.dir,
      clock: p.clock ?? null,
      dn: p.dnHoehe ?? null,
      dnB: p.dnBreite ?? null,
      form: 'A',
      dca: high ? 'Z' : 'B',
      dcaC2: '',
      bereich: high ? 'C' : 'J',
      lageMode: h != null ? 'unten' : (p.tiefeVonOben != null ? 'oben' : 'unten'),
      lageValue: h != null ? h : (p.tiefeVonOben ?? null),
      pipeName: p.name,
      nachbar: p.nachbar,
      material: p.material || '',
      isReference: !!p.isReference,
      fromStamm: true,
      clockFromStamm: p.clock != null,
      kommentar: '',
    };
  });
}

/**
 * Vertikale Lage bezogen auf den gewählten Bezugspunkt.
 * mode 'unten' = Höhe über Sohle des tiefsten Auslaufs, 'oben' = Tiefe ab OK Abdeckung.
 */
export function verticalPosition(insp, mode, value) {
  if (value === null || value === undefined || value === '') return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const T = insp.tiefe != null && insp.tiefe !== '' ? Number(insp.tiefe) : null;
  const ref = String(insp.bezugVertikal || '1');
  if (ref === '2') {
    if (mode === 'oben') return round2(v);
    return T == null ? null : round2(T - v);
  }
  if (mode === 'unten') return round2(v);
  return T == null ? null : round2(T - v);
}

/** Lage in beide Richtungen (für Anzeige). */
export function bothDepths(insp, mode, value) {
  const T = insp.tiefe != null && insp.tiefe !== '' ? Number(insp.tiefe) : null;
  const v = Number(value);
  if (value === null || value === '' || !Number.isFinite(v)) return { oben: null, unten: null };
  if (mode === 'oben') return { oben: v, unten: T == null ? null : round2(T - v) };
  return { unten: v, oben: T == null ? null : round2(T - v) };
}

const pad2 = (n) => String(n).padStart(2, '0');

function pos(from, to) {
  if (!from) return {};
  return { PositionVon: pad2(from), PositionBis: to ? pad2(to) : '00' };
}

/**
 * Erzeugt die geordnete Liste der KZustand-Datensätze einer Inspektion.
 * photoName(photoId, kode) liefert den Dateinamen für die Fotoreferenz. Das Übersichtsfoto kommt
 * immer zuerst – es ist das Hauptbild des Schachts (Nr. 001).
 */
export function buildRecords(insp, { photoName = () => null, version = '2017-07' } = {}) {
  const T = insp.tiefe != null && insp.tiefe !== '' ? Number(insp.tiefe) : null;
  // „von unten“ (1): Sohle = 0,00, Deckel = Tiefe; „von oben“ (2): Deckel = 0,00, Sohle = Tiefe.
  // Die Inspektion beginnt immer am Bezugspunkt (0,00) und endet am gegenüberliegenden Ende.
  const top = insp.bezugVertikal === '2' ? 0 : T;
  const entries = [];
  let seq = 0;
  const add = (vert, rec, prio = 5) => entries.push({ vert, prio, seq: seq++, rec });

  // Übersichtsfoto (von oben) als DDA
  if (insp.overview?.photoId) {
    add(top ?? 0, {
      InspektionsKode: 'DDA',
      Fotodatei: photoName(insp.overview.photoId, 'DDA'),
      Kommentar: 'Übersichtsfoto von oben, tiefster Auslauf bei 12 Uhr',
    }, 2);
  }

  // Anschlüsse: DCA direkt gefolgt von DCG
  for (const c of insp.connections || []) {
    const v = verticalPosition(insp, c.lageMode, c.lageValue);
    const p = pos(c.clock, 0);
    const bereich = c.bereich || 'J';
    const dca = {
      InspektionsKode: 'DCA', Charakterisierung1: c.dca || 'B',
      Charakterisierung2: c.dca === 'A' ? c.dcaC2 || null : null,
      Verbindung: '0', Schachtbereich: bereich, ...p,
      Kommentar: c.kommentar || (c.pipeName ? `${c.dir === 'out' ? 'Ablauf' : 'Zulauf'} ${c.pipeName}` : null),
      Fotodatei: c.photoId ? photoName(c.photoId, 'DCA') : null,
    };
    const dcg = {
      InspektionsKode: 'DCG', Charakterisierung1: c.form || 'A',
      Charakterisierung2: c.dir === 'out' ? 'B' : c.dir === 'closed' ? 'C' : 'A',
      Verbindung: '0', Quantifizierung1Numerisch: c.dn ?? null,
      Quantifizierung2Numerisch: c.dnB ?? null, Schachtbereich: bereich, ...p,
    };
    const prio = c.isReference ? 3 : 4;
    add(v ?? 0, dca, prio);
    entries.push({ vert: v ?? 0, prio, seq: seq++, rec: dcg, glue: true });
  }

  // Feststellungen
  let strecke = 0;
  for (const f of insp.findings || []) {
    const def = CODES[f.code] || {};
    const v1 = verticalPosition(insp, f.lageMode, f.lageValue);
    const base = {
      InspektionsKode: f.code,
      Charakterisierung1: f.c1 || null,
      Charakterisierung2: f.c2 || null,
      Verbindung: def.group === 'A' || def.group === 'B' ? (f.verbindung ? '1' : '0') : (f.verbindung ? '1' : null),
      Quantifizierung1Numerisch: f.q1 === '' ? null : f.q1 ?? null,
      Quantifizierung2Numerisch: f.q2 === '' ? null : f.q2 ?? null,
      Schachtbereich: f.bereich || null,
      ...pos(f.clockFrom, f.clockTo),
      BezeichnungSanierung: f.sanBez || null,
      DAKZustandSanierung: f.code === 'DAK' && f.c1 === 'Z' ? f.sanZustand || null : null,
      KVerfahrenSanierung: f.code === 'DCB' ? f.sanVerfahren || null : null,
      Fotodatei: f.photoId ? photoName(f.photoId, f.code) : null,
      Kommentar: f.kommentar || null,
      DDEZulaufDrainage: f.code === 'DDE' && f.drainage ? '1' : null,
      _erfassung: f.source === 'ai' ? '3' : '1',
      _fid: f.id, // Zuordnung Datensatz -> Befund (z. B. für die Zustandsklassen)
    };
    if (f.strecke && f.lageEndValue !== '' && f.lageEndValue != null) {
      const v2 = verticalPosition(insp, f.lageMode, f.lageEndValue);
      strecke += 1;
      const lo = Math.min(v1 ?? 0, v2 ?? 0);
      const hi = Math.max(v1 ?? 0, v2 ?? 0);
      add(lo, { ...base, Streckenschaden: 'A', StreckenschadenLfdNr: String(strecke) });
      add(hi, {
        InspektionsKode: f.code, Charakterisierung1: base.Charakterisierung1, Charakterisierung2: base.Charakterisierung2,
        Schachtbereich: base.Schachtbereich, ...pos(f.clockFrom, f.clockTo),
        Streckenschaden: 'B', StreckenschadenLfdNr: String(strecke), _erfassung: base._erfassung,
      }, 6);
    } else {
      add(v1 ?? 0, base);
    }
  }

  // Sortierung: aufsteigend nach vertikaler Lage; DCG bleibt direkt hinter DCA
  const groups = [];
  for (const e of entries) {
    if (e.glue) groups[groups.length - 1].items.push(e);
    else groups.push({ ...e, items: [e] });
  }
  groups.sort((a, b) => a.vert - b.vert || a.prio - b.prio || a.seq - b.seq);

  const ordered = [];
  ordered.push({ vert: 0, rec: { InspektionsKode: 'DDB', Streckenschaden: 'A', _erfassung: '1' } });
  for (const g of groups) for (const e of g.items) ordered.push({ vert: e.vert, rec: e.rec });
  const endVert = Math.max(T ?? 0, ...ordered.map((o) => o.vert));
  ordered.push({
    vert: endVert,
    rec: { InspektionsKode: 'DDB', Streckenschaden: 'B', Kommentar: insp.schlussbemerkung || null, _erfassung: '1' },
  });

  return ordered.map((o, i) => {
    const r = { Index: String(i + 1), VertikaleLage: (o.vert ?? 0).toFixed(2), ...o.rec };
    for (const k of ['Quantifizierung1Numerisch', 'Quantifizierung2Numerisch']) {
      if (r[k] != null && r[k] !== '') r[k] = Number(r[k]).toFixed(2);
    }
    if (version >= '2024') r.Erfassungsart = r._erfassung;
    delete r._erfassung;
    return r;
  });
}

/** Reihenfolge der Elemente in KZustandType gemäß XSD. */
export const KZUSTAND_ORDER = [
  'Index', 'VertikaleLage', 'Timecode', 'Frame', 'Videozaehler', 'Parameter', 'InspektionsKode',
  'Charakterisierung1', 'Charakterisierung2', 'Verbindung', 'Quantifizierung1Numerisch', 'Quantifizierung1Text',
  'Quantifizierung2Numerisch', 'Quantifizierung2Text', 'Streckenschaden', 'StreckenschadenLfdNr',
  'Schachtbereich', 'PositionVon', 'PositionBis', 'BezeichnungSanierung', 'DAKZustandSanierung',
  'DALZustandSanierung', 'QZustandSanierung', 'KVerfahrenSanierung', 'Fotodatei', 'FotoSpeichermedium',
  'Fotonummer', 'Kommentar', 'Klassifizierung', 'Gruppe', 'DDEZulaufDrainage', 'Erfassungsart',
];
