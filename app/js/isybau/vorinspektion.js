// Import vorhandener Schachtinspektionen (Vorinspektionen) aus
// ISYBAU-Zustandsdaten (XML 2006–2024) und DWA-M 150 (KG mit KI/KZ).
// Ergebnis je Schacht ist ein inspektionsähnliches Objekt mit Befunden und Anschlüssen
// im App-Datenmodell (Lagen „über Sohle“ bzw. „ab Deckel“ wie in der Datei).

import { child, children, text, num } from './xml.js';
import { numDe } from './m150.js';

const SKIP = new Set(['DDB', 'DDA', 'DDC', 'DDD']); // Anfang/Ende, Fotos, Hinweise
const CLASS_KEYS = { D: 'Dichtheit/SKDv', S: 'Standsicherheit/SKSv', B: 'Betriebssicherheit/SKBv' };

function clock(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/**
 * Wandelt eine Liste neutraler Datensätze in Befunde und Anschlüsse.
 * rec: {lage, code, c1, c2, q1, q2, strecke:'A'|'B'|'C'|'', nr, von, bis, bereich, verbindung, kommentar, klassen}
 */
export function recordsToInspection(recs, { bezugVertikal = '1' } = {}) {
  const lageMode = bezugVertikal === '2' ? 'oben' : 'unten';
  const findings = [];
  const connections = [];
  const open = new Map(); // offene Streckenschäden: code+nr -> Befund
  let tiefe = null;
  let n = 0;
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.code === 'DDB' && r.strecke === 'B' && r.lage != null) tiefe = r.lage;
    if (SKIP.has(r.code)) continue;
    if (r.code === 'DCA') {
      const g = recs[i + 1]?.code === 'DCG' ? recs[i + 1] : null;
      if (g) i++;
      connections.push({
        id: `v${++n}`, dir: g?.c2 === 'B' ? 'out' : g?.c2 === 'C' ? 'closed' : 'in',
        clock: clock(r.von), dn: g?.q1 ?? null, dnB: g?.q2 ?? null, form: g?.c1 || 'A',
        dca: r.c1 || 'B', dcaC2: r.c2 || '', bereich: r.bereich || 'J',
        lageMode, lageValue: r.lage ?? '', kommentar: r.kommentar || '', fromVorinspektion: true,
      });
      continue;
    }
    if (r.code === 'DCG') continue;
    const key = `${r.code}|${r.nr || ''}`;
    if (r.strecke === 'B' || r.strecke === 'C') {
      const a = open.get(key);
      if (a) { a.lageEndValue = r.lage ?? ''; if (r.strecke === 'B') open.delete(key); }
      continue;
    }
    const f = {
      id: `v${++n}`, code: r.code, c1: r.c1 || '', c2: r.c2 || '', q1: r.q1 ?? '', q2: r.q2 ?? '',
      clockFrom: clock(r.von), clockTo: clock(r.bis), bereich: r.bereich || '',
      lageMode, lageValue: r.lage ?? '', strecke: r.strecke === 'A', lageEndValue: '',
      verbindung: !!r.verbindung, kommentar: r.kommentar || '', photoId: null, source: 'vorinspektion',
      klassenDatei: r.klassen || null,
    };
    if (r.strecke === 'A') open.set(key, f);
    findings.push(f);
  }
  return { findings, connections, tiefe };
}

function isyRecord(z) {
  const klassen = {};
  for (const [k, path] of Object.entries(CLASS_KEYS)) {
    const [grp, pre] = path.split('/');
    const g = child(z, `Klassifizierung/${grp}`);
    const v = text(g, `${pre}Manu`) || text(g, `${pre}Auto`);
    if (v) klassen[k] = Number(v);
  }
  return {
    lage: num(z, 'VertikaleLage'),
    code: text(z, 'InspektionsKode'),
    c1: text(z, 'Charakterisierung1'),
    c2: text(z, 'Charakterisierung2'),
    q1: num(z, 'Quantifizierung1Numerisch'),
    q2: num(z, 'Quantifizierung2Numerisch'),
    strecke: text(z, 'Streckenschaden'),
    nr: text(z, 'StreckenschadenLfdNr'),
    von: text(z, 'PositionVon'),
    bis: text(z, 'PositionBis'),
    bereich: text(z, 'Schachtbereich'),
    verbindung: text(z, 'Verbindung') === '1' || text(z, 'Verbindung') === 'true',
    kommentar: text(z, 'Kommentar'),
    klassen: Object.keys(klassen).length ? klassen : null,
  };
}

/** ISYBAU-Zustandsdaten: alle inspizierten Schächte. */
export function parseIsybauZustand(root) {
  const version = text(root, 'Version');
  const out = [];
  for (const kol of children(root, 'Datenkollektive/Zustandsdatenkollektiv')) {
    for (const a of children(kol, 'InspizierteAbwassertechnischeAnlage')) {
      for (const oi of children(a, 'OptischeInspektion')) {
        const k = child(oi, 'Knoten');
        if (!k) continue;
        const bezugVertikal = text(k, 'BezugspunktVertikal') || '1';
        const recs = children(k, 'Inspektionsdaten/KZustand').map(isyRecord);
        const conv = recordsToInspection(recs, { bezugVertikal });
        const bw = child(k, 'Bewertung');
        out.push({
          objekt: text(a, 'Objektbezeichnung'),
          strasse: text(a, 'Lage/Strassenname'),
          ortsteil: text(a, 'Lage/Ortsteilname'),
          quelle: `ISYBAU ${version}`,
          datum: text(oi, 'Inspektionsdatum'),
          uhrzeit: text(oi, 'Uhrzeit'),
          inspekteur: text(oi, 'NameUntersucher'),
          bezugVertikal,
          ...conv,
          bewertungDatei: bw ? {
            klasse: text(bw, 'KlasseManuell') || text(bw, 'KlasseAutomatisch'),
            zahl: text(bw, 'ZahlEndgueltig'),
            massgebend: text(bw, 'MassgebenderSchaden'),
          } : null,
        });
      }
    }
  }
  return { version, vorinspektionen: out };
}

const m150Date = (s) => {
  const t = (s || '').trim();
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : t.slice(0, 10);
};

/** DWA-M 150: Knoten (KG) mit Inspektion (KI) und Zuständen (KZ). */
export function parseM150Zustand(root) {
  const out = [];
  for (const kg of children(root, 'KG')) {
    for (const ki of children(kg, 'KI')) {
      const b = text(ki, 'KI101').trim();
      const bezugVertikal = b === 'B' || b === '2' ? '2' : '1';
      const recs = children(ki, 'KZ').map((z) => {
        const sd = text(z, 'KZ005').trim();
        const ddb = text(z, 'KZ017').trim();
        return {
          lage: numDe(z, 'KZ001'),
          code: text(z, 'KZ002').trim(),
          c1: text(z, 'KZ014').trim(),
          c2: text(z, 'KZ015').trim(),
          q1: numDe(z, 'KZ003'),
          q2: numDe(z, 'KZ004'),
          strecke: sd ? sd[0] : (text(z, 'KZ002').trim() === 'DDB' ? ddb : ''),
          nr: sd.slice(1),
          von: text(z, 'KZ006'),
          bis: text(z, 'KZ007'),
          bereich: text(z, 'KZ013').trim(),
          verbindung: !!text(z, 'KZ011').trim(),
          kommentar: [text(z, 'KZ010').trim(), text(z, 'KZ999').trim()].filter(Boolean).join(' – '),
          klassen: null,
        };
      });
      out.push({
        objekt: text(kg, 'KG001').trim(),
        strasse: text(kg, 'KG102').trim(),
        ortsteil: text(kg, 'KG104').trim(),
        quelle: `DWA-M 150 ${text(root, 'FD/FD001')}`.trim(),
        datum: m150Date(text(ki, 'KI104')),
        uhrzeit: text(ki, 'KI105').trim(),
        inspekteur: text(ki, 'KI112').trim(),
        bezugVertikal,
        ...recordsToInspection(recs, { bezugVertikal }),
        bewertungDatei: null,
      });
    }
  }
  return { version: `DWA-M 150 ${text(root, 'FD/FD001')}`.trim(), vorinspektionen: out };
}
