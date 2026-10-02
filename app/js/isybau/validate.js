// Plausibilitätsprüfung nach den Anwendungsregeln der BFR Abwasser (A-2.3.5 / A-2.3.8).

import { CODES, c1Options, c2Options, quantDef, c1Entry } from '../data/codes.js';
import { REF } from '../data/reflists.js';
import { verticalPosition } from './model.js';

const empty = (v) => v === null || v === undefined || v === '';

/** Prüft eine einzelne Feststellung. */
export function validateFinding(f, insp, { kodiersystem = '10' } = {}) {
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });
  const def = CODES[f.code];
  if (!def) { err(`Unbekannter Hauptkode ${f.code}.`); return out; }

  const c1s = c1Options(f.code, REF);
  if (c1s.length && empty(f.c1)) err('Charakterisierung 1 fehlt.');
  if (!empty(f.c1) && c1s.length && !c1s.some((x) => x.k === f.c1)) err(`Charakterisierung 1 „${f.c1}“ ist für ${f.code} nicht zulässig.`);

  const c2s = c2Options(f.code, f.c1);
  if (c2s.length && def.c2req && empty(f.c2)) err('Charakterisierung 2 fehlt.');
  if (!empty(f.c2) && !c2s.some((x) => x.k === f.c2)) err(`Charakterisierung 2 „${f.c2}“ passt nicht zu ${f.code}${f.c1 || ''}.`);

  const isIsybau = kodiersystem === '10';
  if (isIsybau && (f.c1 === 'Y' || f.c2 === 'Y') && !(f.code === 'DDC' || (f.code === 'DDE' && f.c1 === 'Y'))) {
    err('Die Charakterisierung „Y“ ist nach ISYBAU nur bei ausdrücklich zugelassenen Kodes erlaubt.');
  }

  const z = c1Entry(f.code, f.c1)?.z || c2s.find((x) => x.k === f.c2)?.z;
  if ((z || def.commentReq) && empty(f.kommentar)) err('Anmerkung erforderlich (Charakterisierung „Z“ bzw. Kode verlangt eine Erläuterung).');

  for (const n of [1, 2]) {
    const q = quantDef(f.code, f.c1, n);
    const val = n === 1 ? f.q1 : f.q2;
    if (!q && !empty(val)) err(`Für ${f.code}${f.c1 || ''} ist keine Quantifizierung ${n} vorgesehen.`);
    if (q && q.req && empty(val)) (n === 1 ? err : warn)(`Quantifizierung ${n} (${q.label}, ${q.unit}) fehlt.`);
    if (q && !empty(val)) {
      const v = Number(val);
      if (!Number.isFinite(v) || v < 0) err(`Quantifizierung ${n} ist keine gültige Zahl.`);
      else {
        const dec = (String(val).split(/[.,]/)[1] || '').length;
        if (!(q.dec && v < 1) && dec > 0 && q.unit !== '%') warn(`Quantifizierung ${n}: ganzzahlige Werte verwenden.`);
        if (q.min && v < q.min) warn(`${q.label} unter ${q.min} ${q.unit} – laut Regelwerk nicht aufzuzeichnen.`);
      }
    }
  }
  const e1 = c1Entry(f.code, f.c1);
  if (e1?.min && !empty(f.q1) && Number(f.q1) < e1.min) {
    warn(`${f.code}${f.c1} gilt erst ab ${e1.min} mm – Charakterisierung prüfen.`);
  }
  if (f.code === 'DAB' && f.c1 === 'B' && !empty(f.q1) && Number(f.q1) >= 5) warn('Rissbreite ≥ 5 mm → klaffender Riss (DABC).');

  if (def.lage === 'req' && empty(f.clockFrom)) err('Lage am Umfang (Uhrzeit) fehlt.');
  if (f.code === 'DAA' && f.c1 === 'B' && empty(f.clockFrom)) err('Bei punktueller Verformung ist die Lage am Umfang Pflicht.');
  if (def.bereich === 'req' && empty(f.bereich)) err('Schachtbereich fehlt.');
  if (def.photoReq && empty(f.photoId)) warn('Für ein allgemeines Foto sollte ein Foto angehängt sein.');

  const v = verticalPosition(insp, f.lageMode, f.lageValue);
  if (empty(f.lageValue)) err('Vertikale Lage fehlt.');
  else if (v == null) err('Vertikale Lage kann nicht umgerechnet werden – Schachttiefe fehlt.');
  else if (v < -0.05) warn('Vertikale Lage liegt unterhalb des Bezugspunkts.');
  else if (insp.tiefe && v > Number(insp.tiefe) + 0.05) warn('Vertikale Lage liegt außerhalb der Schachttiefe.');

  if (f.strecke) {
    if (empty(f.lageEndValue)) err('Ende der Streckenfeststellung fehlt.');
    else if (Math.abs(Number(f.lageEndValue) - Number(f.lageValue)) <= 0.5) warn('Streckenfeststellungen sind erst ab einer Ausdehnung über 0,50 m zu kodieren.');
  }
  if (def.sanierung && f.code === 'DCB' && empty(f.sanBez)) warn('Bezeichnung der Sanierungsmaßnahme (z. B. SAN1) angeben.');
  return out;
}

/** Prüft eine komplette Inspektion. Liefert {errors, warnings, byFinding}. */
export function validateInspection(insp, opts = {}) {
  const byFinding = {};
  const general = [];
  const warn = (msg) => general.push({ level: 'warn', msg });
  const err = (msg) => general.push({ level: 'error', msg });

  if (empty(insp.datum)) err('Inspektionsdatum fehlt.');
  if (empty(insp.inspekteur)) warn('Name des Inspekteurs fehlt.');
  if (empty(insp.tiefe)) err('Schachttiefe fehlt (wird für die vertikale Lage benötigt).');
  if (!insp.overview?.photoId) warn('Kein Übersichtsfoto vorhanden.');

  const cons = insp.connections || [];
  if (!cons.length) warn('Keine Anschlüsse erfasst (DCA/DCG).');
  if (cons.length && !cons.some((c) => c.dir === 'out')) warn('Kein Ablauf erfasst – der tiefste Auslauf ist der Bezug für 12 Uhr.');
  cons.forEach((c, i) => {
    const label = `Anschluss ${i + 1}${c.pipeName ? ' (' + c.pipeName + ')' : ''}`;
    if (empty(c.clock)) err(`${label}: Lage am Umfang fehlt.`);
    if (empty(c.dn)) warn(`${label}: Nennweite fehlt.`);
    if (empty(c.lageValue)) err(`${label}: Höhenlage fehlt.`);
    if (c.dca === 'Z' && empty(c.kommentar) && !c.pipeName) warn(`${label}: Anmerkung zum Anschluss „Z“ empfohlen.`);
  });
  const ref = cons.find((c) => c.isReference) || cons.find((c) => c.dir === 'out');
  if (ref && !empty(ref.clock) && Number(ref.clock) !== 12 && insp.bezugHorizontal !== '2') {
    warn('Der tiefste Auslauf sollte bei 12 Uhr liegen (horizontaler Bezugspunkt).');
  }

  const findings = insp.findings || [];
  for (const f of findings) byFinding[f.id] = validateFinding(f, insp, opts);
  const hasPrimary = findings.some((f) => CODES[f.code]?.group === 'A' && !CODES[f.code]?.secondary);
  for (const f of findings) {
    if (CODES[f.code]?.secondary && !hasPrimary) {
      byFinding[f.id].push({ level: 'error', msg: `${f.code} darf nur zusammen mit einem Primärschaden verwendet werden.` });
    }
  }
  const all = [...general, ...Object.values(byFinding).flat()];
  return {
    general,
    byFinding,
    errors: all.filter((x) => x.level === 'error').length,
    warnings: all.filter((x) => x.level === 'warn').length,
  };
}
