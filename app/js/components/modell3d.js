// 3D-Schachtmodell aus der Bauteilbeschreibung (three.js, lokal mitgeliefert).
// Aufgeschnittene Darstellung: ein Viertel der Wand ist offen, damit man Gerinne, Berme,
// Steigeisen und Anschlüsse sieht. Maße in Metern, y = Höhe über Sohle, 12 Uhr = Auslauf.

import { modellMasse } from '../isybau/bauteile.js';

let threePromise = null;
export function loadThree() {
  threePromise ||= Promise.all([
    import('../../vendor/three/three.module.min.js'),
    import('../../vendor/three/OrbitControls.js'),
  ]).then(([THREE, oc]) => ({ THREE, OrbitControls: oc.OrbitControls }))
    .catch((e) => { threePromise = null; throw e; });
  return threePromise;
}

export const FARBEN = {
  unterteil: '#8d96a0', aufbau: '#b4bbc3', konus: '#a7aeb7', unten: '#9aa3ad', auflage: '#d3c6a8',
  rahmen: '#5a616b', deckel: '#6b7280', berme: '#c2b8a3', gerinne: '#6f6656', steig: '#e8a317',
  aus: '#2b8a3e', zu: '#1c7ed6', zu_: '#868e96', strasse: '#6c7480',
};

/** Höhe eines Anschlusses (Rohrsohle) über der Schachtsohle in m. */
function anschlussHoehe(c, T) {
  const v = c.lageValue === '' || c.lageValue == null ? null : Number(c.lageValue);
  if (v == null || !Number.isFinite(v)) return 0;
  return c.lageMode === 'oben' ? Math.max(0, T - v) : v;
}

/**
 * Szene aufbauen. Liefert {group, masse, center, size}.
 * @param THREE three.js-Modul
 */
export function baueSchacht(THREE, { bauteile, inspection }) {
  const M = modellMasse(bauteile, inspection?.tiefe);
  const g = new THREE.Group();
  const OPEN = Math.PI / 2; // offenes Viertel zur Kamera (x>0, z>0)
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, ...extra });
  const T = M.T;
  const wand = 0.12;

  // rotationssymmetrisches Bauteil aus Profil [r, y] (geschlossener Querschnitt)
  const lathe = (profil, color, extra) => {
    const pts = profil.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 64, OPEN, Math.PI * 2 - OPEN), mat(color, extra));
    g.add(m);
    return m;
  };
  // rechteckiges Bauteil: vier Wände minus der offenen Seite
  const kasten = (l, w, y0, y1, color) => {
    const h = y1 - y0;
    const parts = [
      [l + 2 * wand, wand, 0, -(w / 2 + wand / 2)],
      [wand, w, -(l / 2 + wand / 2), 0],
    ];
    for (const [sx, sz, px, pz] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mat(color));
      m.position.set(px, y0 + h / 2, pz);
      g.add(m);
    }
  };
  const ring = (ri, y0, y1, color, t = wand) => lathe([[ri, y0], [ri + t, y0], [ri + t, y1], [ri, y1], [ri, y0]], color);

  // Unterteil mit Bodenplatte
  const rU = M.unterteil.l / 2;
  if (M.unterteilDa) {
    if (M.unterteil.eckig) kasten(M.unterteil.l, M.unterteil.w, -0.15, M.hUnterteil, FARBEN.unterteil);
    else lathe([[0, -0.15], [rU + wand, -0.15], [rU + wand, M.hUnterteil], [rU, M.hUnterteil], [rU, 0], [0, 0]], FARBEN.unterteil);
  }
  // untere Schachtzone (Sonderschacht)
  let rOben = M.dn / 2;
  if (M.unten) {
    const rZ = M.unten.l / 2;
    if (M.unten.eckig) kasten(M.unten.l, M.unten.l, M.z.unten, M.z.aufbau, FARBEN.unten);
    else ring(rZ, M.z.unten, M.z.aufbau, FARBEN.unten);
    if (M.unten.uebergangsplatte && rZ > rOben) lathe([[rOben, M.z.aufbau - 0.15], [rZ + wand, M.z.aufbau - 0.15], [rZ + wand, M.z.aufbau], [rOben, M.z.aufbau], [rOben, M.z.aufbau - 0.15]], FARBEN.konus);
    if (M.unten.podest) {
      const y = M.z.unten + (M.z.aufbau - M.z.unten) * 0.5;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(rZ, rZ, 0.08, 48, 1, false, Math.PI, Math.PI * 0.75), mat(FARBEN.konus));
      p.position.y = y;
      g.add(p);
    }
  }
  // Schachtaufbau: Ringe, Konus bzw. Abdeckplatte
  const rD = M.dDeckel / 2;
  if (M.aufbau.eckig) kasten(M.aufbau.l, M.aufbau.w, M.z.aufbau, M.z.konus, FARBEN.aufbau);
  else ring(rOben, M.z.aufbau, M.z.konus, FARBEN.aufbau);
  // Ringfugen andeuten
  for (let y = M.z.aufbau + 0.5; y < M.z.konus - 0.1; y += 0.5) {
    if (M.aufbau.eckig) break;
    const f = new THREE.Mesh(new THREE.TorusGeometry(rOben + 0.003, 0.006, 6, 64, Math.PI * 2 - OPEN), mat('#6d747c'));
    f.rotation.x = Math.PI / 2;
    f.rotation.z = OPEN; // Bogen beginnt hinter dem offenen Viertel
    f.position.y = y;
    g.add(f);
  }
  if (M.konus) {
    lathe([[rOben, M.z.konus], [rOben + wand, M.z.konus], [rD + wand, M.z.auflage], [rD, M.z.auflage], [rOben, M.z.konus]], FARBEN.konus);
  } else if (M.abdeckplatte) {
    lathe([[rD, M.z.auflage - M.hPlatte], [rOben + wand, M.z.auflage - M.hPlatte], [rOben + wand, M.z.auflage], [rD, M.z.auflage], [rD, M.z.auflage - M.hPlatte]], FARBEN.konus);
  } else if (rOben > rD + 0.02) {
    // ohne Konus/Platte: Übergang als dünne Platte
    lathe([[rD, M.z.auflage - 0.12], [rOben + wand, M.z.auflage - 0.12], [rOben + wand, M.z.auflage], [rD, M.z.auflage], [rD, M.z.auflage - 0.12]], FARBEN.konus);
  }
  // Auflageringe und Rahmen
  if (M.hAuflage > 0) ring(rD, M.z.auflage, M.z.rahmen, FARBEN.auflage, 0.1);
  lathe([[rD, M.z.rahmen], [rD + 0.14, M.z.rahmen], [rD + 0.14, M.z.oben], [rD - 0.02, M.z.oben], [rD - 0.02, M.z.oben - 0.03], [rD, M.z.oben - 0.03], [rD, M.z.rahmen]], FARBEN.rahmen, { metalness: 0.15, roughness: 0.6 });
  // Straßenoberfläche (durchscheinend) und angehobener Deckel
  lathe([[rD + 0.14, M.z.oben], [Math.max(1.2, rOben + 0.6), M.z.oben], [Math.max(1.2, rOben + 0.6), M.z.oben - 0.05], [rD + 0.14, M.z.oben - 0.05]], FARBEN.strasse, { transparent: true, opacity: 0.35, depthWrite: false });
  const deckel = new THREE.Mesh(new THREE.CylinderGeometry(rD + 0.01, rD + 0.01, 0.05, 48), mat(FARBEN.deckel, { metalness: 0.15, roughness: 0.55 }));
  deckel.position.set(-0.1, M.z.oben + 0.35, -0.1);
  deckel.rotation.set(-0.35, 0, 0.25);
  g.add(deckel);

  // Berme mit Gerinne (gerade vom Zulauf gegenüber zum Auslauf bei 12 Uhr)
  const out = (inspection?.connections || []).find((c) => c.dir === 'out');
  const dnOut = Math.min(0.8, Math.max(0.15, (Number(out?.dn) || 300) / 1000));
  const rC = dnOut / 2;
  const rInnen = M.unterteilDa ? (M.unterteil.eckig ? Math.min(M.unterteil.l, M.unterteil.w) / 2 : rU) : rOben;
  const bisScheitel = ['1', '3', '4'].includes(M.gerinne);
  const hBerme = bisScheitel ? dnOut : rC;
  if (M.unterteilDa && rInnen > rC + 0.05) {
    const w = rC;
    const side = (sgn) => {
      const s = new THREE.Shape();
      const a = Math.acos(Math.min(0.999, w / rInnen));
      const y0 = Math.sqrt(rInnen * rInnen - w * w);
      s.moveTo(sgn * w, -y0);
      if (sgn > 0) s.absarc(0, 0, rInnen, -a, a, false);
      else s.absarc(0, 0, rInnen, Math.PI + a, Math.PI - a, true);
      s.lineTo(sgn * w, -y0);
      const geo = new THREE.ExtrudeGeometry(s, { depth: hBerme, bevelEnabled: false, curveSegments: 32 });
      const m = new THREE.Mesh(geo, mat(FARBEN.berme));
      m.rotation.x = -Math.PI / 2; // Form liegt in x/z, Extrusion nach oben
      g.add(m);
    };
    side(1); side(-1);
    const rinne = new THREE.Mesh(
      new THREE.CylinderGeometry(rC, rC, rInnen * 2, 32, 1, true, -Math.PI / 2, Math.PI), // untere Halbschale
      mat(FARBEN.gerinne),
    );
    rinne.rotation.x = Math.PI / 2;
    rinne.position.y = rC;
    g.add(rinne);
  }

  // Anschlüsse in Uhrlage und Höhe
  const dirOf = (clock) => { const p = (Number(clock) % 12) * Math.PI / 6; return new THREE.Vector3(Math.sin(p), 0, -Math.cos(p)); };
  const wallAt = (y) => {
    if (y < M.z.unten) return rU;
    if (M.unten && y < M.z.aufbau) return M.unten.l / 2;
    if (y < M.z.konus || !M.konus) return rOben;
    const t = Math.min(1, (y - M.z.konus) / Math.max(0.01, M.hKonus));
    return rOben + (rD - rOben) * t;
  };
  const winkel = [];
  for (const c of inspection?.connections || []) {
    if (!c.clock) continue;
    const r = Math.min(0.8, Math.max(0.1, (Number(c.dn) || 150) / 1000)) / 2;
    const y = anschlussHoehe(c, T) + r;
    const d = dirOf(c.clock);
    winkel.push(Number(c.clock) % 12);
    const len = 0.7;
    const color = c.dir === 'out' ? FARBEN.aus : c.dir === 'closed' ? FARBEN.zu_ : FARBEN.zu;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 32, 1, true), mat(color));
    const start = wallAt(y) - 0.02;
    pipe.position.copy(d.clone().multiplyScalar(start + len / 2)).setY(y);
    pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    g.add(pipe);
    if (c.dir === 'closed') {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat(color));
      cap.position.copy(d.clone().multiplyScalar(start + 0.01)).setY(y);
      cap.lookAt(new THREE.Vector3(0, y, 0));
      g.add(cap);
    }
  }

  // Steigeisen auf der Seite mit dem größten Abstand zu den Anschlüssen
  if (M.steig) {
    let best = 6, bestD = -1;
    for (let k = 0; k < 24; k++) {
      const h = k / 2;
      if (h > 2.75 && h < 6.25) continue; // nicht ins offene Viertel (3–6 Uhr)
      const dmin = winkel.length ? Math.min(...winkel.map((w) => Math.min(Math.abs(w - h), 12 - Math.abs(w - h)))) : 6;
      if (dmin > bestD) { bestD = dmin; best = h; }
    }
    const d = dirOf(best);
    const quer = new THREE.Vector3(-d.z, 0, d.x);
    const zwei = M.steig.art === '2';
    const leiter = M.steig.art === '3';
    const yTop = M.z.auflage - 0.15;
    let i = 0;
    for (let y = hBerme + 0.35; y < yTop; y += leiter ? 0.28 : 0.25, i++) {
      const breit = leiter ? 0.4 : zwei ? 0.16 : 0.3;
      const off = zwei ? (i % 2 ? 0.14 : -0.14) : 0;
      const rung = new THREE.Mesh(new THREE.BoxGeometry(breit, 0.025, 0.025), mat(FARBEN.steig, { metalness: 0.4 }));
      const r = wallAt(y) - 0.09;
      rung.position.copy(d.clone().multiplyScalar(r).add(quer.clone().multiplyScalar(off))).setY(y);
      rung.lookAt(rung.position.clone().add(d)); // lange Seite tangential zur Wand
      g.add(rung);
    }
  }

  return { group: g, masse: M, center: new THREE.Vector3(0, T / 2, 0), size: Math.max(T, rOben * 2 + 0.6) };
}

/**
 * 3D-Ansicht in einem Container. Liefert {update(daten), snapshot(type), dispose()}.
 */
export async function schachtModell3d(container, daten, { interaktiv = true, hintergrund = null, abstand = 1.9 } = {}) {
  const { THREE, OrbitControls } = await loadThree();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !hintergrund, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (hintergrund) renderer.setClearColor(hintergrund);
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  const controls = interaktiv ? new OrbitControls(camera, renderer.domElement) : null;
  if (controls) { controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.95; }
  let model = null;
  let frame = 0;

  const resize = () => {
    const w = container.clientWidth || 600, h = container.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const render = () => { renderer.render(scene, camera); };
  const loop = () => { frame = requestAnimationFrame(loop); controls?.update(); render(); };

  function update(d) {
    if (model) {
      scene.remove(model.group);
      model.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    model = baueSchacht(THREE, d);
    scene.add(model.group);
    const dist = model.size * abstand + 0.8;
    camera.position.set(dist * 0.62, model.center.y + model.size * 0.55, dist * 0.78);
    camera.lookAt(model.center);
    controls?.target.copy(model.center);
    controls?.update();
    render();
    return model.masse;
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); render(); }) : null;
  ro?.observe(container);
  resize();
  const masse = update(daten);
  if (interaktiv) loop();

  return {
    masse,
    update: (d) => update(d),
    /** Bild als Blob (für das PDF-Protokoll). */
    snapshot: (type = 'image/jpeg', q = 0.88) => new Promise((res) => { render(); renderer.domElement.toBlob(res, type, q); }),
    dispose() {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      controls?.dispose();
      if (model) model.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** 3D-Bild ohne sichtbare Ansicht erzeugen (PDF). Liefert JPEG-Blob oder null ohne WebGL. */
export async function schachtModellBild(daten, { breite = 900, hoehe = 900 } = {}) {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-10000px', top: '0', width: `${breite / 2}px`, height: `${hoehe / 2}px` });
  document.body.append(box);
  try {
    const v = await schachtModell3d(box, daten, { interaktiv: false, hintergrund: '#ffffff', abstand: 2.35 });
    const blob = await v.snapshot('image/jpeg', 0.9);
    v.dispose();
    return blob;
  } catch {
    return null;
  } finally {
    box.remove();
  }
}
