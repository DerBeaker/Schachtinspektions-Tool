// Import von ISYBAU-Stammdaten (XML 2006/2013/2017/2024) und DWA-M 150.
// Liefert Schächte inkl. der angeschlossenen Haltungen/Leitungen. Für jeden
// Anschluss werden – sofern Geometrie und Höhen vorhanden – die Lage am Umfang
// (Uhrzeit relativ zum tiefsten Auslauf) sowie die Sohltiefe vorgeschlagen.

import { parseXml, decodeXmlBytes, child, children, text, num, findAll } from './xml.js';
import { bearing, bearingToClock } from '../lib/geo.js';
import { parseM150, isM150Root } from './m150.js';

const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

function points(geoNode) {
  return findAll(child(geoNode, 'Geometriedaten'), 'Punkt').map((p) => ({
    attr: text(p, 'PunktattributAbwasser'),
    x: num(p, 'Rechtswert'),
    y: num(p, 'Hochwert'),
    z: num(p, 'Punkthoehe'),
  }));
}

function polyline(geoNode) {
  const pts = [];
  for (const k of findAll(child(geoNode, 'Geometriedaten'), 'Kante')) {
    for (const part of ['Start', 'Ende']) {
      const p = child(k, part);
      if (!p) continue;
      const q = { x: num(p, 'Rechtswert'), y: num(p, 'Hochwert'), attr: text(p, 'PunktattributAbwasser') };
      if (q.x == null || q.y == null) continue;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - q.x, last.y - q.y) > 0.001) pts.push(q);
    }
  }
  return pts;
}

/** Richtung der Kante am Knoten P (erstes Stück der Polylinie, sonst Richtung zum Gegenknoten). */
function directionAt(P, line, otherPos) {
  if (!P) return null;
  if (line.length >= 2) {
    const d0 = Math.hypot(line[0].x - P.x, line[0].y - P.y);
    const d1 = Math.hypot(line[line.length - 1].x - P.x, line[line.length - 1].y - P.y);
    const seq = d0 <= d1 ? line : [...line].reverse();
    if (Math.min(d0, d1) < 5) {
      for (const q of seq) {
        if (Math.hypot(q.x - P.x, q.y - P.y) > 0.25) return bearing(P, q);
      }
    }
  }
  if (otherPos && Math.hypot(otherPos.x - P.x, otherPos.y - P.y) > 0.25) return bearing(P, otherPos);
  return null;
}

/**
 * Baut aus Knoten und Kanten die Schachtliste mit Anschlüssen. Wird auch vom
 * DWA-M-150-Import verwendet.
 * nodes: Map name -> {name, knotenTyp:'0' für Schacht, status, pos:{x,y}, deckelhoehe, sohlhoehe, schacht:{tiefe,…}, …}
 * edges: [{name, von, nach, sohleVon, sohleNach, hoehe, breite, line:[{x,y}], …}]
 */
export function assembleManholes(nodes, edges, warnings = []) {
  const byNode = new Map();
  for (const e of edges) {
    for (const k of new Set([e.von, e.nach])) {
      if (!byNode.has(k)) byNode.set(k, []);
      byNode.get(k).push(e);
    }
  }
  const manholes = [];
  let ohneAblauf = 0, deckelBerechnet = 0;
  for (const n of nodes.values()) {
    if (n.knotenTyp !== '0') continue; // nur Schächte
    if (n.status === '6') continue; // rückgebaut
    const pipes = [];
    for (const e of byNode.get(n.name) || []) {
      const out = e.von === n.name; // Kante beginnt am Schacht -> Ablauf
      const other = nodes.get(out ? e.nach : e.von);
      const dn = e.hoehe || e.breite || null;
      pipes.push({
        name: e.name,
        typ: e.kantenTyp === '1' ? 'Leitung' : e.kantenTyp === '0' ? 'Haltung' : 'Kante',
        dir: out ? 'out' : 'in',
        nachbar: other ? other.name : (out ? e.nach : e.von),
        sohlhoehe: out ? e.sohleVon : e.sohleNach,
        dnHoehe: dn,
        dnBreite: e.breite && e.hoehe && e.breite !== e.hoehe ? e.breite : null,
        profilart: e.profilart,
        material: e.material,
        bearing: directionAt(n.pos, e.line, other?.pos),
      });
    }

    // Deckelhöhe fehlt oft (nur Schachtmittelpunkt mit Sohlhöhe vorhanden) -> aus Schachttiefe ableiten
    const stTiefe = n.schacht?.tiefe > 0 ? n.schacht.tiefe : null; // 0 = keine Angabe
    let deckelhoehe = n.deckelhoehe;
    if (deckelhoehe == null && n.sohlhoehe != null && stTiefe != null) {
      deckelhoehe = n.sohlhoehe + stTiefe;
      deckelBerechnet++;
    }

    // tiefster Auslauf = Bezug (12 Uhr, vertikal 0,00)
    const outs = pipes.filter((p) => p.dir === 'out');
    const ref = outs.length
      ? outs.reduce((a, b) => ((b.sohlhoehe ?? Infinity) < (a.sohlhoehe ?? Infinity) ? b : a))
      : null;
    if (!ref && pipes.length) ohneAblauf++;
    // ohne Ablauf (Endschacht/Projektgrenze): Höhen auf die Schachtsohle beziehen
    const pipeSohlen = pipes.map((p) => p.sohlhoehe).filter((z) => z != null);
    const refSohle = ref?.sohlhoehe ?? n.sohlhoehe
      ?? (deckelhoehe != null && stTiefe != null ? deckelhoehe - stTiefe : null)
      ?? (pipeSohlen.length ? Math.min(...pipeSohlen) : null);
    for (const p of pipes) {
      p.clock = ref && ref.bearing != null && p.bearing != null ? bearingToClock(p.bearing, ref.bearing) : null;
      if (p === ref) { p.clock = 12; p.isReference = true; }
      p.tiefeVonOben = deckelhoehe != null && p.sohlhoehe != null ? r2(deckelhoehe - p.sohlhoehe) : null;
      p.hoeheUeberSohle = refSohle != null && p.sohlhoehe != null ? r2(p.sohlhoehe - refSohle) : null;
    }
    pipes.sort((a, b) => (a.isReference ? -1 : b.isReference ? 1 : (a.clock ?? 99) - (b.clock ?? 99)));

    let tiefe = stTiefe;
    if (tiefe == null && deckelhoehe != null) {
      const sohle = refSohle;
      if (sohle != null) tiefe = r2(deckelhoehe - sohle);
    }

    manholes.push({
      name: n.name,
      strasse: n.strasse,
      strassenschluessel: n.strassenschluessel,
      ortsteil: n.ortsteil,
      ortsteilschluessel: n.ortsteilschluessel,
      entwaesserungsart: n.entwaesserungsart,
      baujahr: n.baujahr,
      kommentar: n.kommentar,
      x: r3(n.x),
      y: r3(n.y),
      crs: n.crs,
      deckelhoehe: r3(deckelhoehe),
      deckelhoeheBerechnet: n.deckelhoehe == null && deckelhoehe != null,
      sohlhoehe: r3(refSohle),
      tiefe,
      schacht: n.schacht,
      deckel: n.deckel,
      extra: n.extra || null,
      pipes,
    });
  }
  manholes.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));

  if (!manholes.length) warnings.push('Es wurden keine Schächte gefunden.');
  const ohneTiefe = manholes.filter((m) => m.tiefe == null).length;
  if (ohneTiefe) warnings.push(`${ohneTiefe} Schächte ohne Tiefenangabe.`);
  if (ohneAblauf) warnings.push(`${ohneAblauf} Schächte ohne Ablauf in den Stammdaten – dort bitte den Auslauf (12 Uhr) am Foto festlegen.`);
  if (deckelBerechnet) warnings.push(`Deckelhöhe bei ${deckelBerechnet} Schächten aus Sohlhöhe + Schachttiefe berechnet.`);
  return manholes;
}

function importM150(root) {
  const d = parseM150(root);
  const warnings = [];
  if (!d.nodes.size) throw new Error('Die DWA-M-150-Datei enthält keine Knoten (KG).');
  const manholes = assembleManholes(d.nodes, d.edges, warnings);
  return {
    format: 'm150',
    version: d.version,
    crsLage: d.crsLage,
    crsHoehe: d.crsHoehe,
    liegenschaft: '',
    liegenschaftDaten: null,
    manholes,
    stats: { anlagen: d.nodes.size + d.edges.length, schaechte: manholes.length, kanten: d.edges.length },
    warnings,
  };
}

/**
 * ISYBAU-Stammdaten (XML 2006–2024) oder DWA-M 150 einlesen.
 * @param {ArrayBuffer|Uint8Array|string} input
 * @returns {{version, crsLage, crsHoehe, liegenschaft, manholes, stats, warnings}}
 */
export function importStammdaten(input) {
  const src = typeof input === 'string' ? input : decodeXmlBytes(input);
  const root = parseXml(src);
  if (isM150Root(root)) return importM150(root);
  if (!root || root.name !== 'Identifikation') {
    throw new Error('Weder ISYBAU-XML (Wurzelelement „Identifikation“) noch DWA-M 150 (Wurzelelement „DATA“).');
  }
  const version = text(root, 'Version');
  const kollektive = children(root, 'Datenkollektive/Stammdatenkollektiv');
  if (!kollektive.length) {
    throw new Error('Die Datei enthält keine Stammdaten (Stammdatenkollektiv fehlt).');
  }
  const anlagen = kollektive.flatMap((k) => children(k, 'AbwassertechnischeAnlage'));
  const warnings = [];
  const nodes = new Map(); // Objektbezeichnung -> Knoten
  const edges = [];
  let crsLage = '';

  for (const a of anlagen) {
    const name = text(a, 'Objektbezeichnung');
    const art = text(a, 'Objektart');
    const geo = child(a, 'Geometrie');
    if (geo && !crsLage) crsLage = text(geo, 'CRSLage');
    if (art === '2') {
      const k = child(a, 'Knoten');
      const pts = geo ? points(geo) : [];
      const dmp = pts.find((p) => p.attr === 'DMP') || null;
      const smp = pts.find((p) => p.attr === 'SMP') || null;
      const any = dmp || smp || pts.find((p) => p.x != null) || null;
      const schacht = child(k, 'Schacht');
      // 2017/2024: Knoten/Abdeckungen/Deckel, 2006/2013: Schacht/Abdeckung
      const deckel = child(k, 'Abdeckungen/Deckel') || child(schacht, 'Abdeckung');
      nodes.set(name, {
        name,
        knotenTyp: text(k, 'KnotenTyp'),
        status: text(a, 'Status'),
        baujahr: text(a, 'Baujahr'),
        entwaesserungsart: text(a, 'Entwaesserungsart'),
        kommentar: text(a, 'Kommentar'),
        strasse: text(a, 'Lage/Strassenname'),
        strassenschluessel: text(a, 'Lage/Strassenschluessel'),
        ortsteil: text(a, 'Lage/Ortsteilname'),
        ortsteilschluessel: text(a, 'Lage/Ortsteilschluessel'),
        x: any?.x ?? null,
        y: any?.y ?? null,
        pos: smp?.x != null ? smp : any,
        deckelhoehe: dmp?.z ?? null,
        sohlhoehe: smp?.z ?? null,
        crs: geo ? text(geo, 'CRSLage') : '',
        schacht: schacht ? {
          funktion: text(schacht, 'SchachtFunktion'),
          tiefe: num(schacht, 'Schachttiefe'),
          einstieghilfe: text(schacht, 'ArtEinstieghilfe'),
          hatEinstieghilfe: text(schacht, 'Einstieghilfe'),
          innenschutz: text(schacht, 'Innenschutz'),
          anzahlAnschluesse: num(schacht, 'AnzahlAnschluesse'),
          aufbauform: text(schacht, 'Aufbau/Aufbauform'),
          konus: text(schacht, 'Aufbau/Konus'),
          dn: num(schacht, 'Aufbau/LaengeAufbau'),
          breite: num(schacht, 'Aufbau/BreiteAufbau'),
          material: text(schacht, 'Aufbau/MaterialAufbau'),
          unterteilForm: text(schacht, 'Unterteil/Unterteilform'),
          unterteilDn: num(schacht, 'Unterteil/LaengeUnterteil'),
          unterteilMaterial: text(schacht, 'Unterteil/MaterialUnterteil'),
          gerinneform: text(schacht, 'Unterteil/Gerinneform'),
        } : null,
        deckel: deckel ? {
          form: text(deckel, 'Deckelform'),
          klasse: text(deckel, 'Abdeckungsklasse'),
          dn: num(deckel, 'LaengeDeckel'),
          breite: num(deckel, 'BreiteDeckel'),
          schmutzfaenger: text(deckel, 'Schmutzfaenger'),
        } : null,
      });
    } else if (art === '1') {
      const k = child(a, 'Kante');
      if (!k) continue;
      const profil = child(k, 'Profil');
      edges.push({
        name,
        kantenTyp: text(k, 'KantenTyp'),
        von: text(k, 'KnotenZulauf'),
        nach: text(k, 'KnotenAblauf'),
        sohleVon: num(k, 'SohlhoeheZulauf'),
        sohleNach: num(k, 'SohlhoeheAblauf'),
        material: text(k, 'Material'),
        profilart: text(profil, 'Profilart'),
        hoehe: num(profil, 'Profilhoehe'),
        breite: num(profil, 'Profilbreite'),
        line: geo ? polyline(geo) : [],
        status: text(a, 'Status'),
      });
    }
  }

  const manholes = assembleManholes(nodes, edges, warnings);
  const lg = child(root, 'Admindaten/Liegenschaft');
  const liegenschaft = text(lg, 'Liegenschaftsort') || findAll(child(root, 'Admindaten'), 'Liegenschaftsort')[0]?.text || '';

  return {
    format: 'isybau',
    version,
    crsLage,
    crsHoehe: text(root, 'Admindaten/Geometrie/CRSHoehe'),
    liegenschaft,
    // wird für den Export nach ISYBAU 2006/2013 gebraucht (dort Pflicht)
    liegenschaftDaten: lg ? {
      nummer: text(lg, 'Liegenschaftsnummer'),
      bezeichnung: text(lg, 'Liegenschaftsbezeichnung'),
      ort: text(lg, 'Liegenschaftsort'),
    } : null,
    manholes,
    stats: {
      anlagen: anlagen.length,
      schaechte: manholes.length,
      kanten: edges.length,
    },
    warnings,
  };
}
