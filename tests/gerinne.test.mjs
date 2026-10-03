// Gerinne im 3D-Modell: Verlauf vom Hauptzulauf zum Auslauf (gerade oder im Bogen), Wahl des Hauptzulaufs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerinneVerlauf, gerinneAnschluesse, nebenGerinneVerlauf, nebenGerinne, bermeUmrisse, wandMitOeffnungen } from '../app/js/components/modell3d.js';

const r = 0.5, w = 0.15;
const nah = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const imKreis = (pts, tol) => pts.every(([x, z]) => Math.hypot(x, z) <= r + tol);
// läuft ein Rand ohne Rückwärtsschritte (keine Schleifen in engen Bögen)?
const vorwaerts = (rand, achse) => rand.every((p, i) => i === 0 || Math.hypot(p[0] - rand[i - 1][0], p[1] - rand[i - 1][1]) > 0);

test('Zulauf gegenüber dem Auslauf: gerades Gerinne', () => {
  const v = gerinneVerlauf({ uhrZu: 6, uhrAus: 0, rInnen: r, w });
  assert.ok(v.achse.every(([x]) => nah(x, 0)), 'Achse auf der Linie 6–12 Uhr');
  assert.ok(nah(v.achse[0][1], r) && nah(v.achse.at(-1)[1], -r), 'von der Wand bei 6 Uhr zur Wand bei 12 Uhr');
  assert.ok(v.links.every(([x]) => nah(x, w)) && v.rechts.every(([x]) => nah(x, -w)), 'Ränder parallel');
});

test('Hauptzulauf bei 4 Uhr, Auslauf bei 12 Uhr: Gerinne im Bogen', () => {
  const v = gerinneVerlauf({ uhrZu: 4, uhrAus: 0, rInnen: r, w });
  const [x0, z0] = v.achse[0];
  assert.ok(nah(x0, r * Math.sin(Math.PI * 2 / 3)) && nah(z0, -r * Math.cos(Math.PI * 2 / 3)), 'Start an der Wand bei 4 Uhr');
  assert.ok(nah(v.achse.at(-1)[0], 0) && nah(v.achse.at(-1)[1], -r), 'Ende am Auslauf');
  const mitte = v.achse[v.achse.length >> 1];
  assert.ok(mitte[0] > 0.02, 'in der Mitte zur Zulaufseite ausgebogen, nicht gerade durch die Mitte');
  // Eintritt radial: Tangente am Start zeigt zur Schachtmitte
  const [tx, tz] = v.tangenten[0];
  assert.ok(tx * -Math.sin(Math.PI * 2 / 3) + tz * Math.cos(Math.PI * 2 / 3) > 0.99);
  assert.ok(imKreis(v.achse, 1e-9) && imKreis(v.links, w + 1e-9) && imKreis(v.rechts, w + 1e-9));
  assert.ok(vorwaerts(v.links) && vorwaerts(v.rechts));
});

test('Enger Bogen (Zulauf bei 1 Uhr): Innenrand ohne Schleife', () => {
  const v = gerinneVerlauf({ uhrZu: 1, uhrAus: 0, rInnen: r, w });
  for (const rand of [v.links, v.rechts]) {
    // keine zwei Randsegmente laufen gegen die Kurvenrichtung
    rand.forEach((p, i) => { if (i) assert.ok(Math.hypot(p[0] - rand[i - 1][0], p[1] - rand[i - 1][1]) > 0); });
    assert.ok(rand.length >= 2);
  }
});

test('Hauptzulauf: der tiefste, bei gleicher Höhe der größte; ohne Zulauf gerade', () => {
  const aus = { dir: 'out', clock: 12, dn: 300, isReference: true, lageMode: 'unten', lageValue: 0 };
  let g = gerinneAnschluesse([aus,
    { dir: 'in', clock: 9, dn: 400, lageMode: 'unten', lageValue: 0.6 },
    { dir: 'in', clock: 4, dn: 200, lageMode: 'unten', lageValue: 0.05 }], 2.4);
  assert.deepEqual([g.uhrAus, g.uhrZu], [0, 4], 'tiefster Zulauf, auch wenn kleiner');
  g = gerinneAnschluesse([aus,
    { dir: 'in', clock: 3, dn: 150, lageMode: 'oben', lageValue: 2.38 },
    { dir: 'in', clock: 5, dn: 300, lageMode: 'unten', lageValue: 0.03 }], 2.4);
  assert.equal(g.uhrZu, 5, 'gleiche Höhe (± 5 cm): größerer DN');
  assert.equal(gerinneAnschluesse([aus], 2).uhrZu, 6, 'ohne Zulauf: gegenüber dem Auslauf');
  assert.equal(gerinneAnschluesse([aus, { dir: 'in', clock: 12, dn: 200 }], 2).uhrZu, 6, 'Zulauf auf Höhe des Auslaufs: gerade');
  assert.equal(gerinneAnschluesse([aus, { dir: 'closed', clock: 4, dn: 200 }], 2).uhrZu, 6, 'verschlossene Anschlüsse zählen nicht');
});

const flaeche = (loop) => Math.abs(loop.reduce((a, [x, z], i) => { const [x2, z2] = loop[(i + 1) % loop.length]; return a + x * z2 - x2 * z; }, 0) / 2);

test('Berme: Kreis ohne Hauptgerinne = zwei Flächen mit passender Größe', () => {
  const v = gerinneVerlauf({ uhrZu: 6, uhrAus: 0, rInnen: r, w });
  const umrisse = bermeUmrisse({ rInnen: r, kanaele: [{ achse: v.achse, w }] });
  assert.equal(umrisse.length, 2);
  const soll = Math.PI * r * r - (2 * w * Math.sqrt(r * r - w * w) + 2 * r * r * Math.asin(w / r)); // Kreis minus Streifen
  const ist = umrisse.reduce((a, l) => a + flaeche(l), 0);
  assert.ok(Math.abs(ist - soll) / soll < 0.02, `Fläche ${ist.toFixed(4)} statt ${soll.toFixed(4)}`);
  assert.ok(umrisse.flat().every(([x, z]) => Math.hypot(x, z) <= r + 0.01));
});

test('Nebengerinne von 9 Uhr mündet in Fließrichtung ins Hauptgerinne und teilt die Berme', () => {
  const haupt = gerinneVerlauf({ uhrZu: 6, uhrAus: 0, rInnen: r, w });
  const n = nebenGerinneVerlauf({ uhr: 9, rInnen: r, haupt });
  assert.ok(nah(n.achse[0][0], -r) && nah(n.achse[0][1], 0, 1e-9), 'beginnt an der Wand bei 9 Uhr');
  const [jx, jz] = n.achse.at(-1);
  assert.deepEqual([jx, jz], haupt.achse[n.muendung], 'endet auf der Achse des Hauptgerinnes');
  const [tx, tz] = n.tangenten.at(-1);
  const [hx, hz] = haupt.tangenten[n.muendung];
  assert.ok(tx * hx + tz * hz > 0.99, 'läuft tangential in Fließrichtung ein');
  const umrisse = bermeUmrisse({ rInnen: r, kanaele: [{ achse: haupt.achse, w }, { achse: n.achse, w: 0.075 }] });
  assert.equal(umrisse.length, 3, 'Berme links vom Hauptgerinne in zwei Teile geteilt');
});

test('Nebengerinne nur für Zuläufe auf Höhe der Berme, nicht für den Hauptzulauf', () => {
  const T = 2.4;
  const cons = [
    { dir: 'out', clock: 12, dn: 300, isReference: true, lageMode: 'unten', lageValue: 0 },
    { dir: 'in', clock: 6, dn: 300, lageMode: 'unten', lageValue: 0 },
    { dir: 'in', clock: 9, dn: 150, lageMode: 'unten', lageValue: 0.05 },
    { dir: 'in', clock: 3, dn: 150, lageMode: 'unten', lageValue: 0.9 },
    { dir: 'closed', clock: 2, dn: 150, lageMode: 'unten', lageValue: 0 },
  ];
  const ga = gerinneAnschluesse(cons, T);
  const haupt = gerinneVerlauf({ uhrZu: ga.uhrZu, uhrAus: ga.uhrAus, rInnen: r, w: 0.15 });
  const neben = nebenGerinne(cons, { T, ga, hBerme: 0.3, rC: 0.15, rInnen: r, haupt });
  assert.deepEqual(neben.map((n) => n.uhr), [9], 'nur 9 Uhr (3 Uhr liegt über der Berme, 2 Uhr ist verschlossen)');
  assert.equal(neben[0].w, 0.075, 'Breite nach DN 150');
  assert.equal(neben[0].h0, 0.05, 'Sohle beginnt auf Höhe des Zulaufs');
  assert.ok(neben[0].h1 <= neben[0].h0 + 1e-9, 'Nebengerinne fällt zur Mündung hin (nie bergauf)');
  const [ex, ez] = neben[0].achse.at(-1);
  assert.ok(Math.abs(ex) > 0.04, 'endet am Rand des Hauptgerinnes, nicht in dessen Mitte');
  assert.ok(Math.abs(ex) < 0.15 && Math.abs(ez) < r);
});

// Fläche aller Dreiecke (x/y/z flach) und Schwerpunkte
function dreiecke(pos) {
  const out = [];
  for (let i = 0; i < pos.length; i += 9) {
    const a = pos.slice(i, i + 3), b = pos.slice(i + 3, i + 6), c = pos.slice(i + 6, i + 9);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    out.push({ flaeche: Math.hypot(...n) / 2, mitte: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3] });
  }
  return out;
}

test('Wand mit Rohröffnungen: Löcher ausgespart, Fläche stimmt, Öffnung an der Schnittkante halbiert', () => {
  const R = 0.5, y0 = 0, y1 = 0.6;
  const voll = dreiecke(wandMitOeffnungen({ R, theta0: Math.PI, theta1: Math.PI * 2.5, y0, y1 }).pos).reduce((a, d) => a + d.flaeche, 0);
  assert.ok(Math.abs(voll - R * Math.PI * 1.5 * (y1 - y0)) / voll < 0.002, 'geschlossene Wand = Mantelfläche');
  const loch12 = { theta: Math.PI * 2, y: 0.2, r: 0.15 }; // Auslauf 12 Uhr, DN 300
  const loch6 = { theta: Math.PI, y: 0.2, r: 0.15 };      // 6 Uhr: genau an der Schnittkante
  const w = wandMitOeffnungen({ R, theta0: Math.PI, theta1: Math.PI * 2.5, y0, y1, oeffnungen: [loch12, loch6] });
  const d = dreiecke(w.pos);
  const rest = d.reduce((a, x) => a + x.flaeche, 0);
  const lochFl = Math.PI * 0.15 * 0.15; // auf dem Zylinder etwas größer als die Kreisfläche
  const fehlt = voll - rest;
  assert.ok(fehlt > lochFl * 1.4 && fehlt < lochFl * 1.7, `ausgespart ${fehlt.toFixed(4)} m² (1,5 Löcher ≈ ${(1.5 * lochFl).toFixed(4)})`);
  // kein Dreieck liegt in der Öffnung bei 12 Uhr (Richtung -z, Höhe 0,2)
  const imLoch = d.filter(({ mitte: [x, y, z] }) => z < 0 && Math.hypot(x, y - 0.2) < 0.14);
  assert.equal(imLoch.length, 0);
  // Normalen zeigen zur Mitte
  assert.ok(w.nor[0] * w.pos[0] + w.nor[2] * w.pos[2] < 0);
});
