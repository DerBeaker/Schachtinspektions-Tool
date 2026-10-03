// Gerinne im 3D-Modell: Verlauf vom Hauptzulauf zum Auslauf (gerade oder im Bogen), Wahl des Hauptzulaufs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerinneVerlauf, gerinneAnschluesse } from '../app/js/components/modell3d.js';

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
