// Laser-Entfernungsmesser direkt per Bluetooth (Web Bluetooth, Beta) – für Geräte ohne Tastaturmodus,
// z. B. Leica DISTO D1/D110/D2 oder Bosch GLM 50-27 C. Der Messwert (immer in m) landet im zuletzt
// angetippten Maßfeld (numInput mit Einheit, Attribut data-laser), danach springt der Fokus weiter –
// genau wie bei einem Laser im Tastaturmodus. Web Bluetooth gibt es nur in Chrome/Edge (Android, Windows,
// macOS), nicht in Safari auf iPhone/iPad; dort bleibt der Tastaturmodus (z. B. Leica DISTO X3/X4).
import { focusNext } from './ui.js';

const uuid = (kurz, basis) => `${kurz}${basis}`;
const LEICA_BASIS = '-f831-4395-b29d-570977d5bf94';
const BOSCH_BASIS = '-0451-4000-b000-fb3210111989';

export const LEICA = {
  service: uuid('3ab10100', LEICA_BASIS),
  distanz: uuid('3ab10101', LEICA_BASIS), // float32 LE in m (D1/D110/D2 …)
  einheit: uuid('3ab10102', LEICA_BASIS), // Anzeigeeinheit, ändert sich bei jeder Messung mit
  messwerte: uuid('3ab1010d', LEICA_BASIS), // alle Werte in einem Paket, Distanz vorne (X3/X4)
};
export const BOSCH = {
  service: uuid('02a6c0d0', BOSCH_BASIS),
  kanal: uuid('02a6c0d1', BOSCH_BASIS),
  syncAn: [0xc0, 0x55, 0x02, 0x01, 0x00, 0x1a], // Messwerte automatisch senden
};

const plausibel = (v) => Number.isFinite(v) && v > 0.01 && v < 1000;
const dv = (d) => (d instanceof DataView ? d : new DataView(d.buffer ? d.buffer : d, d.byteOffset || 0, d.byteLength));

/** Leica DISTO: Distanz als float32 little-endian in Metern (vorne im Paket). */
export function leicaWert(daten) {
  const v = dv(daten);
  if (v.byteLength < 4) return null;
  const m = v.getFloat32(0, true);
  return plausibel(m) ? Math.round(m * 1000) / 1000 : null; // Laser lösen auf mm auf
}

/** Bosch GLM (MT-Protokoll): Messpaket „C0 55 10 …“, Distanz als float32 LE in m ab Byte 7. */
export function boschWert(daten) {
  const v = dv(daten);
  if (v.byteLength < 11 || v.getUint8(0) !== 0xc0 || v.getUint8(1) !== 0x55 || v.getUint8(2) !== 0x10) return null;
  const m = v.getFloat32(7, true);
  return plausibel(m) ? Math.round(m * 1000) / 1000 : null; // Laser lösen auf mm auf
}

const FAKTOR = { m: 1, cm: 0.01, mm: 0.001 };
/** Meter in die Einheit des Feldes, mit Dezimalkomma (m: 3 Stellen, cm: 1, mm: ganzzahlig). */
export function feldWert(meter, einheit = 'm') {
  const f = FAKTOR[einheit] || 1;
  const stellen = einheit === 'mm' ? 0 : einheit === 'cm' ? 1 : 3;
  return (meter / f).toFixed(stellen).replace('.', ',');
}

export const laserMoeglich = () => !!globalThis.navigator?.bluetooth;

const zustand = { status: 'aus', name: '', typ: '', fehler: '', letzter: null };
let geraet = null;
let ziel = null;
let zuletzt = { wert: null, zeit: 0 };
const melden = () => window.dispatchEvent(new CustomEvent('app:laser', { detail: { ...zustand } }));
const setze = (teil) => { Object.assign(zustand, teil); melden(); };
export const laserZustand = () => ({ ...zustand });

if (typeof document !== 'undefined') {
  // Ziel ist das zuletzt angetippte Maßfeld; ein anderes Eingabefeld (Text, Auswahl) hebt es auf, Knöpfe nicht
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el?.matches?.('input[data-laser]')) ziel = el;
    else if (el?.matches?.('input, select, textarea')) ziel = null;
  });
}

/**
 * Messwert (m) in das zuletzt angetippte Maßfeld schreiben. Liefert das Feld oder null, wenn keines
 * aktiv ist (dann zeigt die Oberfläche den Wert nur an).
 */
export function messwertEintragen(meter) {
  zustand.letzter = meter;
  const el = ziel?.isConnected && !ziel.disabled ? ziel : null;
  if (el) {
    el.value = feldWert(meter, el.dataset.laser);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.classList.add('laser-neu');
    setTimeout(() => el.classList.remove('laser-neu'), 900);
    focusNext(el);
  }
  window.dispatchEvent(new CustomEvent('app:laserwert', { detail: { meter, eingetragen: !!el } }));
  melden();
  return el;
}

function empfangen(meter) {
  if (meter == null) return;
  // Leica meldet eine Messung teils doppelt (Distanz und Messwertpaket) – gleiche Werte kurz hintereinander zählen einmal
  const jetzt = Date.now();
  if (zuletzt.wert === meter && jetzt - zuletzt.zeit < 700) return;
  zuletzt = { wert: meter, zeit: jetzt };
  messwertEintragen(meter);
}

async function abonnieren(server) {
  const svc = await server.getPrimaryService(LEICA.service).catch(() => null);
  if (svc) {
    const chars = await svc.getCharacteristics().catch(() => []);
    const hat = (u) => chars.find((c) => c.uuid === u);
    const dist = hat(LEICA.distanz) || hat(LEICA.messwerte);
    if (!dist) throw new Error('Das Gerät liefert keine Messwerte (Leica-Dienst ohne Distanz).');
    dist.addEventListener('characteristicvaluechanged', (e) => empfangen(leicaWert(e.target.value)));
    await dist.startNotifications();
    // D2: Die Einheit wird nach jeder Messung neu gemeldet – dann die Distanz zur Sicherheit lesen
    const einheit = dist.uuid === LEICA.distanz ? hat(LEICA.einheit) : null;
    if (einheit) {
      einheit.addEventListener('characteristicvaluechanged', async () => {
        try { empfangen(leicaWert(await dist.readValue())); } catch { /* nicht lesbar – Benachrichtigung genügt */ }
      });
      await einheit.startNotifications().catch(() => {});
    }
    return 'Leica DISTO';
  }
  const bosch = await server.getPrimaryService(BOSCH.service).catch(() => null);
  if (bosch) {
    const kanal = await bosch.getCharacteristic(BOSCH.kanal);
    kanal.addEventListener('characteristicvaluechanged', (e) => empfangen(boschWert(e.target.value)));
    await kanal.startNotifications();
    await (kanal.writeValueWithResponse || kanal.writeValue).call(kanal, new Uint8Array(BOSCH.syncAn));
    return 'Bosch GLM';
  }
  throw new Error('Dieses Gerät wird (noch) nicht unterstützt. Bitte den Tastaturmodus des Lasers nutzen.');
}

async function koppeln() {
  setze({ status: 'verbinde', fehler: '' });
  try {
    const server = await geraet.gatt.connect();
    const typ = await abonnieren(server);
    setze({ status: 'verbunden', typ, name: geraet.name || typ });
    return true;
  } catch (e) {
    try { geraet.gatt.disconnect(); } catch { /* schon getrennt */ }
    setze({ status: 'getrennt', fehler: e.message || String(e) });
    return false;
  }
}

/** Gerät auswählen (Browser-Dialog) und verbinden. Muss aus einem Klick heraus aufgerufen werden. */
export async function laserVerbinden() {
  if (!laserMoeglich()) throw new Error('Dieser Browser kann keine Bluetooth-Geräte direkt verbinden (Chrome oder Edge nutzen).');
  const d = await navigator.bluetooth.requestDevice({
    filters: [{ services: [LEICA.service] }, { namePrefix: 'DISTO' }, { services: [BOSCH.service] }, { namePrefix: 'GLM' }, { namePrefix: 'PLR' }],
    optionalServices: [LEICA.service, BOSCH.service],
  });
  if (geraet !== d) {
    if (geraet) laserTrennen();
    geraet = d;
    d.addEventListener('gattserverdisconnected', () => {
      if (geraet === d && zustand.status !== 'aus') setze({ status: 'getrennt' });
    });
  }
  return koppeln();
}

/** Nach dem Ausschalten des Lasers erneut verbinden (ohne Auswahl-Dialog). */
export async function laserNeuVerbinden() {
  if (!geraet) return laserVerbinden();
  return koppeln();
}

export function laserTrennen() {
  const d = geraet;
  zustand.status = 'aus';
  geraet = null;
  try { d?.gatt?.disconnect(); } catch { /* schon getrennt */ }
  setze({ status: 'aus', name: '', typ: '', fehler: '' });
}
