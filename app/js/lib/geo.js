// Koordinatenumrechnung UTM (ETRS89) bzw. Gauß-Krüger (DHDN) -> WGS84 (lat/lon)
// Genauigkeit: UTM < 1 m, Gauß-Krüger ca. 1–3 m (7-Parameter-Helmert, Mittelwerte Deutschland).
// Ausreichend für Navigation zum Schacht und "Schächte in der Nähe".

const DEG = Math.PI / 180;

function tmInverse(E, N, { a, f, k0, lon0, fe, fn }) {
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = E - fe;
  const y = N - fn;
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin1 = Math.sin(phi1), cos1 = Math.cos(phi1), tan1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
  const T1 = tan1 * tan1;
  const C1 = ep2 * cos1 * cos1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
  const D = x / (N1 * k0);
  const lat = phi1 - ((N1 * tan1) / R1) * (
    (D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / cos1;
  return { lat: lat / DEG, lon: lon / DEG };
}

const GRS80 = { a: 6378137, f: 1 / 298.257222101 };
const BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };

function geodToEcef(lat, lon, h, { a, f }) {
  const e2 = f * (2 - f);
  const sl = Math.sin(lat * DEG), cl = Math.cos(lat * DEG);
  const Nn = a / Math.sqrt(1 - e2 * sl * sl);
  return [(Nn + h) * cl * Math.cos(lon * DEG), (Nn + h) * cl * Math.sin(lon * DEG), (Nn * (1 - e2) + h) * sl];
}

function ecefToGeod([X, Y, Z], { a, f }) {
  const e2 = f * (2 - f);
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(lat);
    const Nn = a / Math.sqrt(1 - e2 * s * s);
    lat = Math.atan2(Z + e2 * Nn * s, p);
  }
  return { lat: lat / DEG, lon: Math.atan2(Y, X) / DEG };
}

// DHDN -> ETRS89, Parameter Deutschland gesamt (Position Vector)
function dhdnToWgs84(lat, lon) {
  const [x, y, z] = geodToEcef(lat, lon, 0, BESSEL);
  const tx = 598.1, ty = 73.7, tz = 418.2;
  const rx = 0.202 * DEG / 3600, ry = 0.045 * DEG / 3600, rz = -2.455 * DEG / 3600;
  const s = 1 + 6.7e-6;
  const X = tx + s * (x - rz * y + ry * z);
  const Y = ty + s * (rz * x + y - rx * z);
  const Z = tz + s * (-ry * x + rx * y + z);
  return ecefToGeod([X, Y, Z], GRS80);
}

/**
 * Ermittelt das Koordinatensystem aus CRS-Text und/oder Koordinatenwerten.
 * Liefert {kind:'utm'|'gk', zone} oder null.
 */
export function detectCrs(rechts, hoch, crsHint = '') {
  const h = String(crsHint).toUpperCase();
  let m = /UTM\s*_?(\d{2})/.exec(h);
  if (m) return { kind: 'utm', zone: +m[1] };
  m = /GK\s*_?(\d)|3GK(\d)/.exec(h);
  if (m) return { kind: 'gk', zone: +(m[1] || m[2]) };
  if (!rechts || !hoch) return null;
  if (rechts >= 31e6 && rechts < 34e6) return { kind: 'utm', zone: Math.floor(rechts / 1e6) };
  if (rechts >= 1e6 && rechts < 6e6 && hoch > 5e6) return { kind: 'gk', zone: Math.floor(rechts / 1e6) };
  if (rechts > 1e5 && rechts < 1e6 && hoch > 5e6) return { kind: 'utm', zone: 32 };
  return null;
}

export function toWgs84(rechts, hoch, crsHint = '') {
  const crs = detectCrs(rechts, hoch, crsHint);
  if (!crs) return null;
  if (crs.kind === 'utm') {
    const E = rechts >= 1e6 ? rechts - Math.floor(rechts / 1e6) * 1e6 : rechts;
    return tmInverse(E, hoch, { ...GRS80, k0: 0.9996, lon0: (crs.zone * 6 - 183) * DEG, fe: 500000, fn: 0 });
  }
  const E = rechts - crs.zone * 1e6;
  const p = tmInverse(E, hoch, { ...BESSEL, k0: 1, lon0: crs.zone * 3 * DEG, fe: 500000, fn: 0 });
  return dhdnToWgs84(p.lat, p.lon);
}

/** Entfernung in Metern zwischen zwei WGS84-Punkten. */
export function distance(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * DEG, dLon = (b.lon - a.lon) * DEG;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Azimut (Grad, im Uhrzeigersinn ab Nord) von p nach q in einem ebenen System. */
export function bearing(p, q) {
  const deg = Math.atan2(q.x - p.x, q.y - p.y) / DEG;
  return (deg + 360) % 360;
}

/** Wandelt eine Richtung relativ zum Auslauf (12 Uhr) in eine Uhrzeit 1..12 um (Draufsicht). */
export function bearingToClock(b, bOut) {
  const rel = (((b - bOut) % 360) + 360) % 360;
  const h = Math.round(rel / 30) % 12;
  return h === 0 ? 12 : h;
}

export function navUrl(pos) {
  return `https://www.google.com/maps/dir/?api=1&destination=${pos.lat.toFixed(6)},${pos.lon.toFixed(6)}`;
}
