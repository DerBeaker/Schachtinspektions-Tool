// Bautechnische Zustandsklassifizierung und -bewertung von Schächten nach
// BFR Abwasser, Anhang A-3.1 (Verfahren) und A-3.2.2 (Tabellen), Stand Januar 2025.
//
// Ablauf je Inspektion:
//   1. vorläufige Einzelschadensklassen SKv (1–5) je Schutzziel D/S/B aus den Tabellen
//   2. vorläufige Schadenszahl SZv (10/100/200/300/400) + Zusatzpunkte der Randbedingungen
//      = endgültige Schadenszahl SZe (mind. 10) -> endgültige Klasse SKe, Maximum MaxSZe/MaxSKe
//   3. Objekt: OZv = größte MaxSZe, Schadenslängenzahl SLZ = Σ MaxSZe · dl (Punkt = 0,5 m),
//      Zusatzpunkte SL aus SLZ / (OZv · Schachttiefe), OZe = OZv + SL -> Objektklasse 0–5
// Pauschale Einordnungen werden markiert; sie sind laut BFR vom Fachingenieur zu prüfen.

import { BFR_REGELN, BIEGEWEICH, BFR_ZUSATZPUNKTE as ZP } from '../data/bfr-klassen.js';
import { verticalPosition } from './model.js';

export const ZIELE = ['D', 'S', 'B'];
export const ZIEL_NAME = { D: 'Dichtheit', S: 'Standsicherheit', B: 'Betriebssicherheit' };

/** Bedeutung der Objektklassen (Tab. A-3 - 9). */
export const OBJEKTKLASSEN = {
  0: 'schadensfrei, kein Handlungsbedarf',
  1: 'geringfügige Schäden, ohne unmittelbaren Handlungsbedarf',
  2: 'langfristiger Handlungsbedarf',
  3: 'mittelfristiger Handlungsbedarf',
  4: 'kurzfristiger Handlungsbedarf',
  5: 'umgehender Handlungsbedarf (i. d. R. Sofortmaßnahme)',
};

const SZ_VORL = { 1: 10, 2: 100, 3: 200, 4: 300, 5: 400 };

/** Klasse aus Schadenszahl (Tab. A-3 - 5 / A-3 - 7). */
export function klasseAusZahl(z) {
  if (z == null) return null;
  if (z <= 0) return 0;
  if (z < 100) return 1;
  if (z < 200) return 2;
  if (z < 300) return 3;
  if (z < 400) return 4;
  return 5;
}

/** Bedingung wie '10<=x<20', 'x>=40', '10<x<=100' auswerten. */
function erfuellt(bed, x) {
  const m = /^(?:([\d.]+)(<=|<))?x(?:(<=|<|>=|>)([\d.]+))?$/.exec(bed);
  if (!m) return false;
  const [, lo, loOp, op, v] = m;
  if (lo != null && !(loOp === '<=' ? x >= +lo : x > +lo)) return false;
  if (op === '<' && !(x < +v)) return false;
  if (op === '<=' && !(x <= +v)) return false;
  if (op === '>=' && !(x >= +v)) return false;
  if (op === '>' && !(x > +v)) return false;
  return true;
}

const passt = (liste, wert) => liste === '' || (!!wert && liste.includes(wert));

/**
 * Vorläufige Einzelschadensklassen eines Befundes.
 * @returns {{D,S,B: {k:number, pauschal:boolean}|null, fehlt: string|null, klassifizierbar: boolean}}
 */
export function klassifiziereBefund(f, { werkstoff = '' } = {}) {
  const res = { D: null, S: null, B: null, fehlt: null, klassifizierbar: false };
  const regeln = BFR_REGELN.filter((r) => r[0] === f.code);
  if (!regeln.length) return res; // Feststellung ohne Klassifizierung (z. B. DCA, DDB)
  res.klassifizierbar = true;
  if (!f.bereich) { res.fehlt = 'Schachtbereich fehlt'; return res; }
  const weich = BIEGEWEICH.includes(String(werkstoff).toUpperCase());
  const x = f.q1 === '' || f.q1 == null ? null : Number(f.q1);
  for (const [, c1, c2, bereiche, ziel, klassen, mat] of regeln) {
    if (!passt(c1, f.c1) || !passt(c2, f.c2) || !bereiche.includes(f.bereich)) continue;
    if (mat && (mat === 'weich') !== weich) continue;
    let k = null, pauschal = false;
    if (typeof klassen === 'number') { k = klassen; pauschal = true; }
    else if (x == null || !Number.isFinite(x)) { res.fehlt = 'Quantifizierung fehlt'; continue; }
    else {
      for (const [kl, bed] of Object.entries(klassen)) if (erfuellt(bed, x)) { k = Number(kl); break; }
    }
    if (k == null) continue;
    if (!res[ziel] || k > res[ziel].k) res[ziel] = { k, pauschal };
  }
  return res;
}

/** Zusatzpunkte [D, S, B] aus den Randbedingungen des Schachts. */
export function zusatzpunkte(rb = {}) {
  const sum = [0, 0, 0];
  const add = (v) => { if (v) v.forEach((p, i) => { sum[i] += p; }); };
  add(ZP.entwaesserungsart[rb.entwaesserungsart]);
  add(ZP.abwasserart[rb.abwasserart]);
  add(ZP.wasserschutzzone[rb.wasserschutzzone]);
  add(ZP.grundwasser[rb.grundwasser]);
  add(ZP.bodenart[rb.bodenart]);
  return sum;
}

/** Randbedingungen: Schacht (Stammdaten) vor Projektvorgabe. */
export function randbedingungen(manhole = {}, project = {}) {
  const u = manhole.umwelt || {};
  const pick = (k) => (u[k] !== undefined && u[k] !== '' ? u[k] : project.rb?.[k] ?? '');
  return {
    entwaesserungsart: manhole.entwaesserungsart || project.rb?.entwaesserungsart || '',
    abwasserart: pick('abwasserart'),
    wasserschutzzone: pick('wasserschutzzone'),
    grundwasser: pick('grundwasser'),
    bodenart: pick('bodenart'),
  };
}

/**
 * Bewertung einer Schachtinspektion.
 * @returns {{befunde: Array, OZv, SLZ, HL, SL, OZe, OK, massgebend, pauschal, offen: string[]}}
 */
export function bewerteInspektion(insp, manhole = {}, project = {}) {
  const rb = randbedingungen(manhole, project);
  const zpBasis = zusatzpunkte(rb);
  const werkstoff = insp.bauteile?.aufbau?.material || insp.bauteile?.unterteil?.material || manhole.schacht?.material || '';
  const T = insp.tiefe != null && insp.tiefe !== '' ? Number(insp.tiefe) : null;
  const befunde = [];
  const offen = [];
  for (const f of insp.findings || []) {
    const kl = klassifiziereBefund(f, { werkstoff });
    if (!kl.klassifizierbar) continue;
    const e = { id: f.id, code: f.code, c1: f.c1 || '', c2: f.c2 || '', q1: f.q1, klassen: kl, SZv: {}, SZe: {}, SKe: {}, MaxSZe: null, MaxSKe: null, dl: 0.5 };
    if (kl.fehlt) offen.push(`${f.code}${f.c1 || ''}${f.c2 || ''}: ${kl.fehlt}`);
    const zp = [...zpBasis];
    if (f.verbindung) ZP.verbindung.forEach((p, i) => { zp[i] += p; });
    ZIELE.forEach((z, i) => {
      if (!kl[z]) return;
      const v = SZ_VORL[kl[z].k];
      const end = Math.max(10, v + zp[i]);
      e.SZv[z] = v; e.SZe[z] = end; e.SKe[z] = klasseAusZahl(end);
      if (e.MaxSZe == null || end > e.MaxSZe) e.MaxSZe = end;
    });
    e.MaxSKe = klasseAusZahl(e.MaxSZe);
    // vertikale Ausdehnung: Streckenschaden, sonst 0,5 m (Grenze Punkt/Strecke)
    if (f.strecke && f.lageEndValue !== '' && f.lageEndValue != null) {
      const a = verticalPosition(insp, f.lageMode, f.lageValue);
      const b = verticalPosition(insp, f.lageMode, f.lageEndValue);
      if (a != null && b != null && Math.abs(b - a) > 0) e.dl = Math.abs(b - a);
    }
    befunde.push(e);
  }
  const bewertet = befunde.filter((e) => e.MaxSZe != null);
  if (!bewertet.length) {
    return { befunde, OZv: 0, SLZ: 0, HL: T, SL: 0, OZe: 0, OK: 0, massgebend: null, pauschal: false, offen, rb };
  }
  const top = bewertet.reduce((a, b) => (b.MaxSZe > a.MaxSZe ? b : a));
  const OZv = top.MaxSZe;
  const SLZ = bewertet.reduce((s, e) => s + e.MaxSZe * e.dl, 0);
  let SL = 0;
  if (T && T > 0) {
    // Rundung wie in den bewerteten BFR-Beispieldaten (113/113 identisch):
    // Verhältnis auf 3 Nachkommastellen, Zusatzpunkte ganzzahlig mit „,5 abrunden“
    const r = Math.round((SLZ / (OZv * T)) * 1000) / 1000;
    if (r > 0.5) SL = 40;
    else if (r > 0.1) SL = Math.ceil(Math.round((r * 100 - 10) * 1000) / 1000 - 0.5);
  } else {
    offen.push('Schachttiefe fehlt – Schadensdichte nicht berücksichtigt');
  }
  const OZe = OZv + SL;
  return {
    befunde, OZv, SLZ: Math.round(SLZ * 100) / 100, HL: T, SL, OZe, OK: klasseAusZahl(OZe),
    massgebend: { code: [top.code, top.c1, top.c2].filter(Boolean).join(' ').slice(0, 10), q1: top.q1 },
    pauschal: bewertet.some((e) => ZIELE.some((z) => e.klassen[z]?.pauschal)),
    offen, rb,
  };
}

/** Kurztext für Anzeigen, z. B. „D3 S1 B2“. */
export function klassenKurz(kl) {
  return ZIELE.filter((z) => kl?.[z]).map((z) => `${z}${kl[z].k}${kl[z].pauschal ? '*' : ''}`).join(' ');
}
