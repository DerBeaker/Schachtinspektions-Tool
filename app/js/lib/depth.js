// Experimentelle Tiefenschätzung aus dem Foto von oben (Lochkamera-Modell).
//
// Idee: Ein Kreis bekannter Größe erscheint umso kleiner, je weiter er entfernt ist:
//   Abstand = Brennweite_px × Durchmesser / Durchmesser_px
// Mit zwei Kreisen (lichte Weite des Schachthalses oben, Schachtdurchmesser unten
// am Auftritt) ergibt die Differenz der Abstände die Tiefe dazwischen.
// Die Brennweite stammt aus den EXIF-Daten (35-mm-äquivalent).
//
// Genauigkeit realistisch ±10 % (Kamera nicht senkrecht, Ränder unscharf,
// Durchmesser nicht exakt bekannt) – nur als Plausibilitätskontrolle geeignet,
// nicht als Ersatz für ein Aufmaß (Messlatte/Laser).

export function circleFrom3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const sq = (p) => p.x * p.x + p.y * p.y;
  const x = (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d;
  const y = (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

/**
 * @param {object} p
 * @param {{r:number}} p.top      Kreis oben (Pixel)
 * @param {{r:number}} p.bottom   Kreis unten (Pixel)
 * @param {number} p.dTop         Durchmesser oben in mm (z. B. lichte Weite Abdeckung 625)
 * @param {number} p.dBottom      Durchmesser unten in mm (z. B. DN 1000)
 * @param {number} p.width        Bildbreite px
 * @param {number} p.height       Bildhöhe px
 * @param {number} [p.f35]        Brennweite 35-mm-äquivalent (EXIF)
 */
export function estimateDepth({ top, bottom, dTop, dBottom, width, height, f35 }) {
  const focal35 = f35 && f35 > 10 && f35 < 200 ? f35 : 26; // typische Hauptkamera
  const fpx = (focal35 / 43.27) * Math.hypot(width, height);
  const zTop = (fpx * dTop) / (2 * top.r) / 1000;
  const zBottom = (fpx * dBottom) / (2 * bottom.r) / 1000;
  const depth = zBottom - zTop;
  return {
    depth: Math.round(depth * 100) / 100,
    camToTop: Math.round(zTop * 100) / 100,
    camToBottom: Math.round(zBottom * 100) / 100,
    tolerance: Math.round(Math.max(0.05, zBottom * 0.08) * 100) / 100,
    focalGuessed: !(f35 && f35 > 10 && f35 < 200),
    focal35,
  };
}
