// Bauteilbeschreibung eines Schachts nach ISYBAU (Stammdaten Knoten/Schacht, BFR Abwasser A-7.4):
// Abdeckung, Auflageringe, Schachtaufbau (Ringe/Konus/Abdeckplatte), untere Schachtzone,
// Unterteil mit Gerinne und Steighilfen. Maße in m, Gesamthöhe der Auflageringe in cm –
// genau wie im Austauschformat. Gespeichert je Inspektion (insp.bauteile), vorbelegt aus den
// Stammdaten (manhole.bauteile). Dieselben Daten treiben Export, Protokoll und das 3D-Modell.

import { child, text, num } from './xml.js';
import { refLabel } from '../data/reflists.js';

const GRUPPEN = {
  deckel: { form: '', typ: '', laenge: null, breite: null, klasse: '', material: '', schmutzfaenger: null },
  auflage: { anzahl: null, hoehe: null },
  aufbau: { form: '', konus: null, abdeckplatte: null, laenge: null, breite: null, hoehe: null, material: '' },
  unten: { aktiv: false, form: '', uebergangsplatte: null, konus: null, laenge: null, breite: null, hoehe: null, material: '', podest: null },
  unterteil: { form: '', laenge: null, breite: null, hoehe: null, material: '', gerinneform: '', gerinneMaterial: '' },
  steig: { vorhanden: null, art: '', material: '', anzahl: null },
};

export function leereBauteile() {
  return { funktion: '', ...Object.fromEntries(Object.entries(GRUPPEN).map(([k, v]) => [k, { ...v }])) };
}

/** Teilobjekt (ältere Daten, Import) zur vollständigen Struktur ergänzen. */
export function normBauteile(b) {
  const n = leereBauteile();
  if (!b) return n;
  n.funktion = b.funktion || '';
  for (const k of Object.keys(GRUPPEN)) Object.assign(n[k], b[k] || {});
  if (b.quelle) n.quelle = b.quelle;
  return n;
}

const gesetzt = (v) => v !== null && v !== undefined && v !== '';

export function hatBauteile(b) {
  if (!b) return false;
  if (b.funktion) return true;
  return Object.keys(GRUPPEN).some((g) => Object.entries(b[g] || {}).some(([k, v]) => k !== 'aktiv' && gesetzt(v)));
}

const zahl = (v) => (gesetzt(v) && Number.isFinite(Number(v)) ? Number(v) : null);
const r2 = (v) => Math.round(v * 100) / 100;

// ---- Import ----------------------------------------------------------------

const bool = (n, p) => {
  const t = text(n, p);
  return t === '' ? null : t === '1' || t === 'true';
};

/**
 * Aus ISYBAU-Stammdaten lesen. schacht = Knoten/Schacht, deckel = Knoten/Abdeckungen/Deckel
 * (2017+) bzw. Schacht/Abdeckung (2006/2013, dort mit den Auflageringen).
 */
export function bauteileAusIsybau(schacht, deckel) {
  if (!schacht && !deckel) return null;
  const b = leereBauteile();
  b.funktion = text(schacht, 'SchachtFunktion');
  Object.assign(b.deckel, {
    form: text(deckel, 'Deckelform'),
    typ: text(deckel, 'Deckeltyp'),
    laenge: num(deckel, 'LaengeDeckel'),
    breite: num(deckel, 'BreiteDeckel'),
    klasse: text(deckel, 'Abdeckungsklasse'),
    material: text(deckel, 'MaterialAbdeckung'),
    schmutzfaenger: bool(deckel, 'Schmutzfaenger'),
  });
  b.auflage.anzahl = num(schacht, 'Auflagering/AnzahlAuflageringe') ?? num(deckel, 'AnzahlAuflageringe');
  b.auflage.hoehe = num(schacht, 'Auflagering/HoeheAuflageringe') ?? num(deckel, 'HoeheAuflageringe');
  Object.assign(b.aufbau, {
    form: text(schacht, 'Aufbau/Aufbauform'),
    abdeckplatte: bool(schacht, 'Aufbau/Abdeckplatte'),
    konus: bool(schacht, 'Aufbau/Konus'),
    laenge: num(schacht, 'Aufbau/LaengeAufbau'),
    breite: num(schacht, 'Aufbau/BreiteAufbau'),
    hoehe: num(schacht, 'Aufbau/HoeheAufbau'),
    material: text(schacht, 'Aufbau/MaterialAufbau'),
  });
  const u = child(schacht, 'UntereSchachtzone');
  Object.assign(b.unten, {
    form: text(u, 'UntereSchachtzoneForm'),
    uebergangsplatte: bool(u, 'Uebergangsplatte'),
    konus: bool(u, 'Konus'),
    laenge: num(u, 'LaengeUnten'),
    breite: num(u, 'BreiteUnten'),
    hoehe: num(u, 'HoeheUnten'),
    material: text(u, 'MaterialUnten'),
    podest: bool(u, 'Podest'),
  });
  // Regelschacht: untere Schachtzone nur, wenn sie wirklich beschrieben ist
  b.unten.aktiv = !!(b.unten.form || b.unten.hoehe || b.unten.laenge || b.unten.konus || b.unten.uebergangsplatte || b.unten.podest);
  Object.assign(b.unterteil, {
    form: text(schacht, 'Unterteil/Unterteilform'),
    laenge: num(schacht, 'Unterteil/LaengeUnterteil'),
    breite: num(schacht, 'Unterteil/BreiteUnterteil'),
    hoehe: num(schacht, 'Unterteil/HoeheUnterteil'),
    material: text(schacht, 'Unterteil/MaterialUnterteil'),
    gerinneform: text(schacht, 'Unterteil/Gerinneform'),
    gerinneMaterial: text(schacht, 'Unterteil/MaterialGerinne'),
  });
  Object.assign(b.steig, {
    vorhanden: bool(schacht, 'Einstieghilfe'),
    art: text(schacht, 'ArtEinstieghilfe'),
    material: text(schacht, 'MaterialSteighilfen'),
  });
  if (b.steig.art === '5') b.steig.vorhanden = false;
  return hatBauteile(b) ? { ...b, quelle: 'stamm' } : null;
}

const STEIG_DWA = { 1: 'SE1', 2: 'SE2', 3: 'SL', 4: 'Z' };
const STEIG_VON_DWA = { SE1: '1', SE2: '2', SL: '3', Z: '4', ML: '4' };

/** Aus DWA-M 150 (KG-Felder) lesen; get(feld) liefert den Text, len(feld) Längen in m. */
export function bauteileAusM150(get, len) {
  const b = leereBauteile();
  const form = { R: 'R', E: 'E', Q: 'E', Z: 'Z' }[get('KG307')] || '';
  b.aufbau.form = form;
  b.unterteil.form = form;
  b.aufbau.laenge = len('KG308');
  b.aufbau.breite = form === 'R' ? null : len('KG309');
  b.aufbau.material = get('KG304');
  const df = get('KG310');
  const verschraubt = /^(J|1|true)$/i.test(get('KG315'));
  b.deckel.form = ['RV', 'EV'].includes(df) ? df : ({ R: 'R', E: 'E', Q: 'E', Z: 'Z' }[df] || '') + (verschraubt && /^[RE]$/.test(df) ? 'V' : '');
  b.deckel.material = get('KG311');
  b.deckel.klasse = /^[A-FZ]$/.test(get('KG312')) ? get('KG312') : '';
  b.deckel.laenge = len('KG314') ?? len('KG313');
  b.deckel.breite = /^E/.test(b.deckel.form) ? len('KG313') : null;
  b.unterteil.gerinneform = /^[0-69]$/.test(get('KG316')) ? get('KG316') : '';
  b.unterteil.gerinneMaterial = get('KG317');
  const st = get('KG323');
  b.steig.art = /^[1-5]$/.test(st) ? st : STEIG_VON_DWA[st] || '';
  b.steig.vorhanden = b.steig.art ? b.steig.art !== '5' : null;
  b.steig.anzahl = zahl(get('KG324'));
  b.steig.material = /^[1-6]$/.test(get('KG325')) ? get('KG325') : '';
  return hatBauteile(b) ? { ...b, quelle: 'stamm' } : null;
}

// ---- Export ----------------------------------------------------------------

const dez = (v) => (zahl(v) == null || zahl(v) <= 0 || zahl(v) >= 100 ? null : zahl(v).toFixed(2));
const ganz = (v, max = 99) => (zahl(v) == null || zahl(v) < 0 ? null : String(Math.min(max, Math.round(zahl(v)))));
const jn = (v) => (v === null || v === undefined ? null : v ? '1' : '0');

/**
 * ISYBAU-Stammdaten „Schacht“ (und ab 2017 „Abdeckungen“) für eine Version.
 * Werte, die die Version nicht kennt (Schachtfunktion 13–22 vor 2024), entfallen.
 * @returns {{schacht: Array, abdeckungen: Array|null}}
 */
export function schachtXml(bt, { version, tiefe, innenschutz, anzahlAnschluesse }) {
  const b = normBauteile(bt);
  const ab2017 = version >= '2017';
  const funktion = /^\d+$/.test(b.funktion) && (Number(b.funktion) <= 12 || version >= '2024') ? b.funktion : null;
  const deckelFelder = [
    ['Deckelform', b.deckel.form || null],
    ['Deckeltyp', b.deckel.typ || null],
    ['LaengeDeckel', dez(b.deckel.laenge)],
    ['BreiteDeckel', dez(b.deckel.breite)],
    ['Abdeckungsklasse', b.deckel.klasse || null],
    ['MaterialAbdeckung', b.deckel.material || null],
  ];
  const deckelDa = deckelFelder.some(([, v]) => v != null) || b.deckel.schmutzfaenger != null;
  const auflage = [['AnzahlAuflageringe', ganz(b.auflage.anzahl)], ['HoeheAuflageringe', ganz(b.auflage.hoehe)]];
  const steigArt = b.steig.vorhanden === false ? '5' : b.steig.art || null;
  const schacht = [
    ['SchachtFunktion', funktion],
    ['Schachttiefe', zahl(tiefe) != null && zahl(tiefe) > 0 && zahl(tiefe) < 1000 ? zahl(tiefe).toFixed(2) : null],
    ['Einstieghilfe', b.steig.vorhanden == null ? (steigArt ? jn(steigArt !== '5') : null) : jn(b.steig.vorhanden)],
    ['ArtEinstieghilfe', steigArt],
    ['MaterialSteighilfen', b.steig.vorhanden === false ? null : b.steig.material || null],
    ['Innenschutz', innenschutz && !(innenschutz === 'NV' && version < '2013') ? innenschutz : null],
    ['AnzahlAnschluesse', ganz(anzahlAnschluesse)],
    ...(ab2017 ? [] : [
      ['AnzahlDeckel', deckelDa ? '1' : null],
      ['Abdeckung', deckelDa || auflage.some(([, v]) => v != null) ? [...deckelFelder, ...auflage, ['Schmutzfaenger', jn(b.deckel.schmutzfaenger)]] : null],
    ]),
    ab2017 ? ['Auflagering', auflage] : null,
    ['Aufbau', [
      ['Aufbauform', b.aufbau.form || null],
      ['Abdeckplatte', jn(b.aufbau.abdeckplatte)],
      ['Konus', jn(b.aufbau.konus)],
      ['LaengeAufbau', dez(b.aufbau.laenge)],
      ['BreiteAufbau', dez(b.aufbau.breite)],
      ['HoeheAufbau', dez(b.aufbau.hoehe)],
      ['MaterialAufbau', b.aufbau.material || null],
    ]],
    b.unten.aktiv || Object.entries(b.unten).some(([k, v]) => k !== 'aktiv' && gesetzt(v)) ? ['UntereSchachtzone', [
      ['UntereSchachtzoneForm', b.unten.form || null],
      ['Uebergangsplatte', jn(b.unten.uebergangsplatte)],
      ['Konus', jn(b.unten.konus)],
      ['LaengeUnten', dez(b.unten.laenge)],
      ['BreiteUnten', dez(b.unten.breite)],
      ['HoeheUnten', dez(b.unten.hoehe)],
      ['MaterialUnten', b.unten.material || null],
      ['Podest', jn(b.unten.podest)],
    ]] : null,
    ['Unterteil', [
      ['Unterteilform', b.unterteil.form || null],
      ['LaengeUnterteil', dez(b.unterteil.laenge)],
      ['BreiteUnterteil', dez(b.unterteil.breite)],
      ['HoeheUnterteil', dez(b.unterteil.hoehe)],
      ['MaterialUnterteil', b.unterteil.material || null],
      ['Gerinneform', b.unterteil.gerinneform || null],
      ['MaterialGerinne', b.unterteil.gerinneMaterial || null],
    ]],
  ];
  // Knoten verlangt ein Schacht-Element mit Inhalt
  if (!schacht.some((e) => e && e[1] != null && (!Array.isArray(e[1]) || e[1].some((x) => x && x[1] != null)))) schacht[0] = ['SchachtFunktion', '1'];
  const abdeckungen = ab2017 && deckelDa
    ? [['Deckel', [['Index', '1'], ...deckelFelder, ['Schmutzfaenger', jn(b.deckel.schmutzfaenger)]]]]
    : null;
  return { schacht, abdeckungen };
}

/**
 * KG-Felder für DWA-M 150 (Längen in mm). Variante 'isybau' schreibt ISYBAU-Schlüssel
 * (Deckelform RV/EV, Steighilfen 1–5), 'dwa' die Buchstabenschlüssel der DWA-Tabellen.
 */
export function bauteileM150(bt, { variante = 'isybau', innenschutz } = {}) {
  const b = normBauteile(bt);
  const isy = variante !== 'dwa';
  const mm = (v) => (zahl(v) == null || zahl(v) <= 0 ? null : String(Math.round(zahl(v) * 1000)));
  const f = {};
  const form = b.aufbau.form || (b.unterteil.form !== 'O' ? b.unterteil.form : '');
  if (form) f.KG307 = form;
  const laenge = b.aufbau.laenge ?? b.unterteil.laenge;
  f.KG308 = mm(laenge);
  f.KG309 = mm(form === 'R' ? (b.aufbau.breite ?? laenge) : (b.aufbau.breite ?? b.unterteil.breite));
  f.KG304 = b.aufbau.material || b.unterteil.material || null;
  const df = b.deckel.form;
  if (df) {
    if (isy) f.KG310 = df;
    else {
      f.KG310 = df[0];
      if (df.length === 2) f.KG315 = 'J';
    }
  }
  f.KG311 = b.deckel.material || null;
  f.KG312 = b.deckel.klasse || null;
  f.KG313 = mm(/^E/.test(df) ? b.deckel.breite : (b.deckel.breite ?? b.deckel.laenge));
  f.KG314 = mm(b.deckel.laenge);
  f.KG316 = b.unterteil.gerinneform || null;
  f.KG317 = b.unterteil.gerinneMaterial || null;
  const art = b.steig.vorhanden === false ? '5' : b.steig.art;
  if (art) f.KG323 = isy ? art : STEIG_DWA[art] || null;
  f.KG324 = b.steig.anzahl != null ? String(Math.round(b.steig.anzahl)) : null;
  f.KG325 = art !== '5' ? b.steig.material || null : null;
  if (isy && innenschutz) f.KG321 = innenschutz;
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== ''));
}

// ---- Anzeige ---------------------------------------------------------------

const de = (v, d = 2) => Number(v).toFixed(d).replace('.', ',');
function mass(form, laenge, breite) {
  if (zahl(laenge) == null) return '';
  if (form === 'R' || form === 'RV' || (!form && zahl(breite) == null)) return `DN ${Math.round(laenge * 1000)}`;
  return zahl(breite) != null ? `${de(laenge)} × ${de(breite)} m` : `${de(laenge)} m`;
}
const ja = (v, t) => (v ? t : null);

/** Lesbare Beschreibung je Bauteil: [[Bauteil, Text], …] (leere Bauteile entfallen). */
export function bauteileZeilen(bt) {
  const b = normBauteile(bt);
  const z = [];
  const add = (name, parts) => { const t = parts.filter(Boolean).join(', '); if (t) z.push([name, t]); };
  add('Schachtfunktion', [b.funktion ? refLabel('G301', b.funktion) : null]);
  add('Abdeckung', [
    b.deckel.form ? refLabel('G302', b.deckel.form) : null,
    b.deckel.klasse ? `Klasse ${refLabel('G304', b.deckel.klasse)}` : null,
    mass(b.deckel.form, b.deckel.laenge, b.deckel.breite).replace(/^DN (\d+)$/, 'Ø $1 mm'),
    b.deckel.material ? refLabel('G102', b.deckel.material) : null,
    b.deckel.typ ? refLabel('G303', b.deckel.typ) : null,
    ja(b.deckel.schmutzfaenger, 'mit Schmutzfänger'),
  ]);
  const keineRinge = !(b.auflage.anzahl > 0) && !(b.auflage.hoehe > 0) && (b.auflage.anzahl === 0 || b.auflage.hoehe === 0);
  add('Auflageringe', keineRinge ? ['keine'] : [
    b.auflage.anzahl != null ? `${b.auflage.anzahl} Stück` : null,
    b.auflage.hoehe != null ? `gesamt ${b.auflage.hoehe} cm` : null,
  ]);
  add('Schachtaufbau', [
    b.aufbau.form ? refLabel('G305', b.aufbau.form) : null,
    mass(b.aufbau.form, b.aufbau.laenge, b.aufbau.breite),
    b.aufbau.abdeckplatte === true ? 'mit Abdeckplatte' : b.aufbau.konus === true ? 'mit Konus'
      : b.aufbau.konus === false ? (b.aufbau.abdeckplatte === false ? 'ohne Konus/Abdeckplatte' : 'ohne Konus') : null,
    b.aufbau.hoehe != null ? `Höhe ${de(b.aufbau.hoehe)} m` : null,
    b.aufbau.material ? refLabel('G102', b.aufbau.material) : null,
  ]);
  if (b.unten.aktiv) {
    add('Untere Schachtzone', [
      b.unten.form ? refLabel('G308', b.unten.form) : null,
      mass(b.unten.form, b.unten.laenge, b.unten.breite),
      ja(b.unten.uebergangsplatte, 'mit Übergangsplatte'),
      ja(b.unten.konus, 'mit Konus'),
      ja(b.unten.podest, 'mit Podest'),
      b.unten.hoehe != null ? `Höhe ${de(b.unten.hoehe)} m` : null,
      b.unten.material ? refLabel('G102', b.unten.material) : null,
    ]);
  }
  add('Unterteil', [
    b.unterteil.form ? refLabel('G308', b.unterteil.form) : null,
    b.unterteil.form !== 'O' ? mass(b.unterteil.form, b.unterteil.laenge, b.unterteil.breite) : null,
    b.unterteil.hoehe != null ? `Höhe ${de(b.unterteil.hoehe)} m` : null,
    b.unterteil.material ? refLabel('G102', b.unterteil.material) : null,
  ]);
  add('Gerinne', [
    b.unterteil.gerinneform ? refLabel('G309', b.unterteil.gerinneform) : null,
    b.unterteil.gerinneMaterial ? refLabel('G102', b.unterteil.gerinneMaterial) : null,
  ]);
  add('Steighilfen', b.steig.vorhanden === false || b.steig.art === '5' ? ['nicht vorhanden'] : [
    b.steig.art ? refLabel('G306', b.steig.art) : ja(b.steig.vorhanden, 'vorhanden'),
    b.steig.material ? refLabel('G307', b.steig.material) : null,
    b.steig.anzahl != null ? `${b.steig.anzahl} Stück` : null,
  ]);
  return z;
}

/**
 * Höhenbilanz: Auflageringe + Aufbau + untere Zone + Unterteil gegen die Schachttiefe.
 * Der Rest entspricht Abdeckung und Rahmen (üblich etwa 0,10–0,25 m).
 */
export function hoehenbilanz(bt, tiefe) {
  const b = normBauteile(bt);
  const teile = [
    ['Auflageringe', b.auflage.hoehe != null ? b.auflage.hoehe / 100 : null],
    ['Schachtaufbau', zahl(b.aufbau.hoehe)],
    ['Untere Schachtzone', b.unten.aktiv ? zahl(b.unten.hoehe) : null],
    ['Unterteil', b.unterteil.form === 'O' ? 0 : zahl(b.unterteil.hoehe)],
  ];
  const bekannt = teile.filter(([, v]) => v != null);
  const summe = r2(bekannt.reduce((s, [, v]) => s + v, 0));
  const T = zahl(tiefe);
  const rest = T != null && T > 0 && bekannt.length ? r2(T - summe) : null;
  const vollstaendig = teile.every(([n, v]) => v != null || (n === 'Untere Schachtzone' && !b.unten.aktiv));
  return { teile, summe, rest, vollstaendig, ok: rest == null ? null : rest >= -0.03 && rest <= 0.35 };
}

/**
 * Vorlage Regelschacht nach DIN 4034-1 / DIN EN 1917 (DN 1000, Konus, Abdeckung DN 625 Klasse D).
 * Höhen bleiben leer – die werden gemessen.
 */
export function regelschacht(dn = 1.0) {
  const b = leereBauteile();
  b.funktion = '1';
  Object.assign(b.deckel, { form: 'R', typ: '1', laenge: 0.625, klasse: 'D' });
  Object.assign(b.aufbau, { form: 'R', konus: true, abdeckplatte: false, laenge: dn, material: 'B' });
  Object.assign(b.unterteil, { form: 'R', laenge: dn, material: 'B', gerinneform: '0', gerinneMaterial: 'B' });
  Object.assign(b.steig, { vorhanden: true, art: '2', material: '5' });
  b.quelle = 'vorlage';
  return b;
}

// ---- Maße für das 3D-Modell ------------------------------------------------

/** Höhe von Abdeckung mit Rahmen, wenn sie sich nicht aus der Schachttiefe ergibt. */
const RAHMEN = 0.12;
/** Konushöhe nach DIN 4034-1. */
const KONUS = 0.6;

/**
 * Höhen und Durchmesser der Bauteile von der Sohle (z = 0) nach oben – so, wie sie erfasst sind.
 * Bauteile, die nicht erfasst sind (Auflageringe, Konus, Steighilfen, Gerinne), werden nicht
 * gezeichnet. Nur fehlende Höhen von vorhandenen Teilen werden aus der Schachttiefe ergänzt und in
 * `geschaetzt` genannt. Passen die Bauteile nicht zur Schachttiefe, steht die Differenz in
 * `abweichung` (Modell höher = positiv) – das Modell wird dafür nicht verzerrt.
 */
export function modellMasse(bt, tiefe) {
  const b = normBauteile(bt);
  const geschaetzt = [];
  const pos = (v) => (zahl(v) != null && zahl(v) > 0 ? zahl(v) : null);
  const Tsoll = pos(tiefe);
  const T = Tsoll ?? 2.5;
  if (Tsoll == null) geschaetzt.push('Schachttiefe');
  const eckig = (f) => f === 'E' || f === 'EV';
  let dn = pos(b.aufbau.laenge) ?? pos(b.unterteil.laenge);
  if (dn == null) { dn = 1.0; geschaetzt.push('Schachtdurchmesser'); }
  const aufbau = { eckig: eckig(b.aufbau.form), l: dn, w: pos(b.aufbau.breite) || dn };
  const unterteilDa = b.unterteil.form !== 'O';
  const unterteil = { eckig: eckig(b.unterteil.form || b.aufbau.form), l: pos(b.unterteil.laenge) || dn, w: pos(b.unterteil.breite) || pos(b.unterteil.laenge) || aufbau.w };
  let dDeckel = pos(b.deckel.laenge);
  if (dDeckel == null) { dDeckel = 0.625; geschaetzt.push('Deckelweite'); }

  // Auflageringe nur, wenn vorhanden (Anzahl oder Höhe > 0)
  let hAuflage = 0;
  if (pos(b.auflage.hoehe)) hAuflage = b.auflage.hoehe / 100;
  else if (pos(b.auflage.anzahl)) { hAuflage = b.auflage.anzahl * 0.06; geschaetzt.push('Höhe Auflageringe'); }

  let hUnterteil = unterteilDa ? pos(b.unterteil.hoehe) : 0;
  let hUnten = b.unten.aktiv ? pos(b.unten.hoehe) : 0;
  let hAufbau = pos(b.aufbau.hoehe);
  if (hUnterteil == null) { hUnterteil = Math.min(1.0, Math.max(0.4, T * 0.3)); geschaetzt.push('Unterteilhöhe'); }
  if (hUnten == null) { hUnten = Math.min(1.0, T * 0.25); geschaetzt.push('Höhe untere Zone'); }
  if (hAufbau == null) {
    hAufbau = Math.max(0.2, T - RAHMEN - hAuflage - hUnterteil - hUnten);
    geschaetzt.push('Aufbauhöhe');
  }
  // Abdeckung mit Rahmen: Rest bis zur Schachttiefe, wenn plausibel – sonst Standardhöhe
  const summe = hUnterteil + hUnten + hAufbau + hAuflage;
  const rest = Tsoll != null ? Tsoll - summe : null;
  const rahmen = rest != null && rest >= 0.04 && rest <= 0.35 ? rest : RAHMEN;
  const oben = summe + rahmen;

  const abdeckplatte = b.aufbau.abdeckplatte === true;
  const konus = !abdeckplatte && b.aufbau.konus === true && dn > dDeckel + 0.05;
  const hKonus = konus ? Math.min(KONUS, hAufbau * 0.6) : 0;
  const hPlatte = abdeckplatte ? Math.min(0.2, hAufbau * 0.3) : 0;
  const z = { unterteil: 0 };
  z.unten = hUnterteil;
  z.aufbau = z.unten + hUnten;
  z.konus = z.aufbau + hAufbau - hKonus - hPlatte;
  z.auflage = z.aufbau + hAufbau;
  z.rahmen = z.auflage + hAuflage;
  z.oben = oben;
  const steigArt = ['1', '2', '3', '4'].includes(b.steig.art) ? b.steig.art : b.steig.vorhanden === true ? '1' : null;
  return {
    T: oben, Tsoll, abweichung: Tsoll != null ? r2(oben - Tsoll) : null,
    dn, dDeckel, aufbau, unterteil, unterteilDa, rahmen, hAuflage, hUnterteil, hUnten, hAufbau, hKonus, hPlatte, konus, abdeckplatte,
    // weder Konus noch Abdeckplatte erfasst, Schacht aber weiter als die Abdeckung
    uebergangOffen: !konus && !abdeckplatte && b.aufbau.konus !== false && dn > dDeckel + 0.05,
    unten: b.unten.aktiv ? { l: pos(b.unten.laenge) || dn, eckig: eckig(b.unten.form), uebergangsplatte: !!b.unten.uebergangsplatte, konus: !!b.unten.konus, podest: !!b.unten.podest } : null,
    gerinne: b.unterteil.gerinneform || null,
    steig: steigArt ? { art: steigArt } : null,
    z, geschaetzt,
  };
}
