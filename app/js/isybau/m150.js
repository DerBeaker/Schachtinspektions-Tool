// DWA-M 150 (Datenaustauschformat für Zustandsdaten, Stand 04-2010).
// Import: Knoten (KG) und Haltungen/Leitungen (HG) mit Geometrie (GO/GP).
// Export: Typ B (Zustandsdaten ohne Bewertung) – je Schacht KG mit KI (Inspektion)
// und KZ (Zustände), danach die verwendeten Referenztabellen (RT).
// Aufbau, Feldreihenfolge und Schlüssel folgen dem offiziellen Beispiel
// „DWA M 150 Beispiel 04_2010 Typ B“; Dezimalkomma, Datum TT.MM.JJJJ, ISO-8859-1.

import { child, children, text, XmlWriter, encodeLatin1 } from './xml.js';
import { buildRecords } from './model.js';
import { photoNamer, APP_NAME, APP_VERSION } from './export.js';
import { CODES } from '../data/codes.js';
import { detectCrs } from '../lib/geo.js';

// ---- Import -----------------------------------------------------------------

/** Zahl mit Dezimalkomma oder -punkt. */
export function numDe(node, path) {
  const t = text(node, path).trim();
  if (!t) return null;
  const v = Number(t.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** Längen sind in der Praxis mal in mm, cm oder m angegeben -> Meter. */
function lenToM(v) {
  if (v == null || v <= 0) return null;
  if (v > 250) return v / 1000;
  if (v > 5) return v / 100;
  return v;
}

function gpPoint(gp) {
  return {
    name: text(gp, 'GP001'),
    crs: text(gp, 'GP002'),
    x: numDe(gp, 'GP003') ?? numDe(gp, 'GP005'),
    y: numDe(gp, 'GP004') ?? numDe(gp, 'GP006'),
    z: numDe(gp, 'GP007'),
    hs: text(gp, 'GP010'),
  };
}

const fields = (node, prefix) => {
  const o = {};
  for (const c of node.children) if (c.name.startsWith(prefix) && c.text.trim()) o[c.name] = c.text.trim();
  return o;
};

const NUTZUNG_TO_ISY = { S: 'KS', R: 'KR', M: 'KM' };

/**
 * Liest Knoten und Kanten aus einer DWA-M-150-Datei (Wurzel <DATA>).
 * Liefert die Rohdaten für assembleManholes() aus import.js.
 */
export function parseM150(root) {
  const nodes = new Map();
  const edges = [];
  let crsLage = '', hoehensystem = '';
  const rt = {};
  for (const r of children(root, 'RT')) {
    const t = text(r, 'RT001').trim();
    (rt[t] ||= {})[text(r, 'RT002').trim()] = text(r, 'RT004').trim() || text(r, 'RT003').trim();
  }

  for (const kg of children(root, 'KG')) {
    const name = text(kg, 'KG001').trim();
    if (!name) continue;
    let dmp = null, smp = null;
    for (const go of children(kg, 'GO')) {
      const kind = text(go, 'GO002');
      for (const gp of children(go, 'GP')) {
        const p = gpPoint(gp);
        if (p.x == null && p.z == null) continue;
        crsLage ||= p.crs;
        hoehensystem ||= p.hs;
        const tag = `${text(go, 'GO001')} ${p.name}`.toUpperCase();
        if (!dmp && (kind === 'D' || /DMP/.test(tag))) dmp = p;
        else if (!smp && (kind === 'B' || kind === 'G' || /SMP/.test(tag))) smp = p;
      }
    }
    // ältere Dateien: Koordinaten direkt in KG201 ff.
    if (!dmp && (numDe(kg, 'KG201') != null || numDe(kg, 'KG204') != null)) dmp = { x: numDe(kg, 'KG201'), y: numDe(kg, 'KG202'), z: numDe(kg, 'KG204') };
    if (!smp && (numDe(kg, 'KG206') != null || numDe(kg, 'KG209') != null)) smp = { x: numDe(kg, 'KG206'), y: numDe(kg, 'KG207'), z: numDe(kg, 'KG209') };
    const any = (dmp?.x != null ? dmp : null) || (smp?.x != null ? smp : null);
    const art = text(kg, 'KG305');
    const kg1 = fields(kg, 'KG');
    nodes.set(name, {
      name,
      knotenTyp: !art || art === 'S' ? '0' : 'm150-' + art,
      status: '',
      baujahr: text(kg, 'KG303'),
      entwaesserungsart: NUTZUNG_TO_ISY[text(kg, 'KG302')] || '',
      kommentar: text(kg, 'KG999').trim(),
      strasse: text(kg, 'KG102').trim(),
      strassenschluessel: text(kg, 'KG101').trim(),
      ortsteil: text(kg, 'KG104').trim(),
      ortsteilschluessel: text(kg, 'KG103').trim(),
      x: any?.x ?? null,
      y: any?.y ?? null,
      pos: smp?.x != null ? smp : any,
      deckelhoehe: dmp?.z ?? null,
      sohlhoehe: smp?.z ?? null,
      crs: crsLage,
      schacht: {
        funktion: '',
        tiefe: numDe(kg, 'KG211'),
        einstieghilfe: text(kg, 'KG323'),
        innenschutz: '',
        anzahlAnschluesse: null,
        aufbauform: text(kg, 'KG307'),
        dn: lenToM(numDe(kg, 'KG308')),
        breite: lenToM(numDe(kg, 'KG309')),
        material: text(kg, 'KG304'),
        unterteilForm: text(kg, 'KG307'),
        unterteilDn: lenToM(numDe(kg, 'KG308')),
      },
      deckel: text(kg, 'KG310') || text(kg, 'KG312') ? {
        form: text(kg, 'KG310'),
        klasse: text(kg, 'KG312'),
        dn: lenToM(numDe(kg, 'KG314') ?? numDe(kg, 'KG313')),
        breite: lenToM(numDe(kg, 'KG313')),
      } : null,
      // Originalfelder und Texte der projektbezogenen Tabellen für den M-150-Export
      extra: {
        m150: kg1,
        m150rt: Object.fromEntries(['001', '002', '004'].map((t) => {
          const k = kg1[Object.keys(RT_OF).find((f) => RT_OF[f] === t)];
          return [t, k && rt[t]?.[k] ? { [k]: rt[t][k] } : null];
        }).filter(([, v]) => v)),
      },
    });
  }

  for (const hg of children(root, 'HG')) {
    const name = text(hg, 'HG001').trim();
    const von = text(hg, 'HG003').trim();
    const nach = text(hg, 'HG004').trim() || text(hg, 'HG005').trim();
    if (!name || !von) continue;
    const pts = children(hg, 'GO').flatMap((go) => children(go, 'GP').map(gpPoint)).filter((p) => p.x != null && p.y != null);
    // Rohrsohlen: HG204/HG209, sonst erster/letzter Geometriepunkt (oben -> unten)
    let zOben = numDe(hg, 'HG204');
    let zUnten = numDe(hg, 'HG209');
    if (pts.length >= 2 && (zOben == null || zUnten == null)) {
      let first = pts[0], last = pts[pts.length - 1];
      const a = nodes.get(von)?.pos;
      if (a?.x != null && Math.hypot(last.x - a.x, last.y - a.y) < Math.hypot(first.x - a.x, first.y - a.y)) [first, last] = [last, first];
      if (/_Zulauf$/i.test(first.name) && /_Ablauf$/i.test(last.name)) [first, last] = [last, first];
      zOben ??= first.z;
      zUnten ??= last.z;
    }
    const haltungsart = text(hg, 'HG313');
    edges.push({
      name,
      kantenTyp: haltungsart === 'B' ? '1' : '0',
      von,
      nach,
      sohleVon: zOben,
      sohleNach: zUnten,
      material: text(hg, 'HG304'),
      profilart: text(hg, 'HG305'),
      hoehe: numDe(hg, 'HG307'),
      breite: numDe(hg, 'HG306'),
      line: pts,
      status: '',
    });
  }

  return {
    version: `DWA-M 150 ${text(root, 'FD/FD001') || ''}`.trim(),
    typ: text(root, 'FD/FD002'),
    crsLage,
    crsHoehe: hoehensystem,
    nodes,
    edges,
  };
}

// ---- Export -----------------------------------------------------------------

/** Texte der Referenztabellen (aus dem offiziellen Beispiel); exportiert werden nur verwendete Schlüssel. */
const RT_TEXT = Object.fromEntries(Object.entries({
  '103': 'D=Druckrohrleitung|F=Offene Freispiegelleitung (Gerinne)|G=Dränageleitung|K=Geschlossene Freispiegelleitung',
  '104': 'B=Bach|M=Mischwasser|S=Schmutzwasser|Z=Sondernutzung|R=Regenwasser',
  '105': 'AZ=Asbestzement|B=Beton|BS=Betonsegmente|BT=Bitumen|BSK=Betonsegmente kunststoffmodifiziert|CN=Edelstahl|EIS=Nichtidentifiziertes Metall (z.B. Eisen und Stahl)|EPX=Epoxidharz|EPSF=Epoxidharz mit Synthesefaser|FZ=Faserzement|GFK=Glasfaserverstärkter Kunststoff|GG=Grauguß|GGG=Duktiles Gußeisen|KST=Nichtidentifizierter Kunststoff|MA=Mauerwerk|OB=Ortbeton|PC=Polymerbeton|PCC=Polymermodifizierter Zementbeton|PE=Polyethylen|PH=Polyesterharz|PHB=Polyesterharzbeton|PP=Polypropylen|PVCM=Polyvinylchlorid modifiziert|PVCU=Polyvinylchlorid hart|SFB=Stahlfaserbeton|SPB=Spannbeton|SB=Stahlbeton|ST=Stahl|STZ=Steinzeug|SZB=Spritzbeton|SZBK=Spritzbeton kunststoffmodifiziert|TF=Teerfaser|UPGF=Ungesättigtes Polyesterharz mit Glasfaser|UPSF=Ungesättigtes Polyesterharz mit Synthesefaser|VEGF=Vinylesterharz mit Glasfaser|VESF=Vinylesterharz mit Synthesefaser|VBK=Verbundrohr Beton/Stahlbeton-Kunststoff|VBS=Verbundrohr Beton/Stahlbeton-Steinzeug|W=Nichtidentifizierter Werkstoff|WPE=Wickelrohr (PEHD)|WPVC=Wickelrohr (PVCU)|Z=Sonstiger Werkstoff|ZM=Zementmörtel|ZG=Ziegelwerk',
  '109': 'N=Nicht in Betrieb|P=Geplant|V=Verschlossen|Z=Sonstige|B=In Betrieb',
  '112': 'A=Acker|BA=Baustraße|BG=Bebautes Grundstück|BO=Böschung|F=Fahrbahn|GL=Gleisanlage|GS=Grünstreifen|GW=Gehweg|P=Parkplatz|PS=Parkstreifen|PW=Privatweg|RW=Radweg|W=Wiese|Wb=Wirtschaftsweg befestigt|Wu=Wirtschaftsweg unbefestigt|0=unbekannt|Z=Sonstige',
  '115': 'B=Bestandsdokumentation|K=Aus Kanalinspektion|V=Vermessung vor Ort',
  '116': 'A=Auslass|B=Bauwerk|E=Straßenablauf|F=Fiktiver Schacht|G=Gebäudeanschluss|I=Inspektionsöffnung|L=Lampenschacht|R=Reinigungsöffnung|S=Schacht|W=Sanitärgegenstand|Z=Sonstige',
  '117': 'ZDUE=Düker|ZES=Einsteigschacht|ZFS=Fallschacht|ZMS=Messschächte|ZRUE=Regenüberlauf|ZSS=Spülschacht|ZVB=Verbindungsbauwerk|ZWS=Wirbelfallschacht|Z=Sonstige',
  '118': 'E=Rechteckig|Q=Quadratisch|R=Rund|Z=Sonstige',
  '119': '0=nicht bekannt|A=Klasse A|B=Klasse B|C=Klasse C|D=Klasse D|E=Klasse E|F=Klasse F|Z=Sonstige',
  '120': 'A=Beschichtung werkseitig|B=Auskleidung werkseitig|C=Teil/-Vollauskleidung Laminattechnik|D=Beschichtung vor Ort|E=Teil/-Vollauskleidung vor Ort|Z=Sonstige',
  '121': 'ML=Mobiles System|SE1=Steigeisen einläufig|SE2=Steigeisen zweiläufig|SL=Steigleiter|Z=Sonstige',
  '123': 'N=Messtechnik nicht vorhanden|J=Messtechnik vorhanden',
  '124': 'A=Abdeckung und Rahmen|B=Auflagerringe|C=Schachtaufbau|D=Konus|E=Übergangsplatte|F=untere Schachtzone|G=Podest|H=Auftritt|I=Gerinne|J=Sohle',
  '201': 'A=Abnahme|E=Ersterfassung|G=Gewährleistung|N=Nachuntersuchung|S=Nach Sanierung|V=Vor Sanierung|Z=Sonstige',
  '202': 'DWAM149-2:2006=DWA-M 149 Teil 2:2006|DWAM149-2:2013=DWA-M 149 Teil 2:2013|EN13508=EN 13508-2|Z=Sonstige',
  '203': 'BG=Begehung|KTV=Kamerainspektion|SP=Spiegelung / vor der Oberfläche inspiziert|Z=Sonstige',
  '205': 'J=Wurde vor Inspektion gereinigt|N=Wurde vor Inspektion nicht gereinigt',
  '206': 'J=Untersuchung wurde mit Wasserhaltung durchgeführt|N=Untersuchung ohne Wasserhaltung',
  '208': 'FOTO=Foto als Filmabzug|DIGFOTO=Digitales Bild|Z=Sonstiges',
  '210': 'A=Sohllage des niedrigsten Rohres|B=Überdeckung|C=Nationaler Bezugspunkt|D=lokaler Bezugspunkt|Z=Sonstige',
  '211': 'A=Niedrigstes abgehendes Rohr bei 12 Uhr|B=Niedrigstes abgehendes Rohr bei 6 Uhr|Z=Sonstige',
  '215': 'B=Beauftragt|E=Erledigt|NB=Nicht beauftragt|NE=Nicht erledigt',
  '300': 'B=Bauwerk|D=Deckel|G=Gerinne|L=Leitung',
  '301': 'Fl=Fläche|Kr=Kreis|L=Linie|Pkt=Punkt|Poly=Polygon',
  '302': 'GK=Gauss-Krüger|UTM=Universal Transversal Mercator',
  '303': 'mNN=m.ü.NN|NHN=Normalhöhennull',
}).map(([t, v]) => [t, Object.fromEntries(v.split('|').map((x) => x.split('=')))]));

/** Feld -> Referenztabelle (Felddefinitionen DWA-M 150). */
const RT_OF = {
  KG101: '001', KG103: '002', KG106: '004', KG301: '103', KG302: '104', KG304: '105', KG305: '116', KG306: '117',
  KG307: '118', KG310: '118', KG311: '105', KG312: '119', KG316: '118', KG317: '105', KG320: '105', KG321: '120',
  KG322: '105', KG323: '121', KG326: '123', KG401: '109', KG404: '112', KG407: '115',
  GO002: '300', GO003: '301', GP002: '302', GP010: '303',
  KI004: '201', KI005: '202', KI007: '215', KI101: '210', KI102: '211', KI103: '203', KI107: '205', KI109: '206', KI117: '208',
  KZ013: '124',
};

/** ISYBAU-Inspektionszweck (U101) -> M 150 Inspektionsgrund (Tabelle 201). */
const GRUND = { 1: 'E', 2: 'Z', 3: 'A', 4: 'G', 5: 'N', 6: 'V', 7: 'S', 8: 'Z' };
/** ISYBAU-Inspektionsverfahren (U108) -> M 150 Inspektionsart (Tabelle 203). */
const ART = { 0: 'KTV', 1: 'BG', 2: 'SP', 3: 'Z' };

const de = (v, dec = 2) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v).toFixed(dec).replace('.', ','));
/** Quantifizierung: ohne überflüssige Nachkommastellen („300“, „0,8“). */
const deQ = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : String(Math.round(Number(v) * 10) / 10).replace('.', ','));
const deDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : null);
const key = (v) => (/^\d{1,6}$/.test(String(v || '')) ? String(v) : null);

export function m150Kodiersystem(kodiersystem) {
  return kodiersystem === '9' ? 'DWAM149-2:2013' : 'EN13508';
}

function kzFromRecord(r) {
  const ddb = r.InspektionsKode === 'DDB';
  const def = CODES[r.InspektionsKode];
  const langtext = ddb
    ? (r.Streckenschaden === 'A' ? 'Inspektionsanfang' : 'Inspektionsende') + (r.Kommentar ? ` - ${r.Kommentar}` : '')
    : [def?.name, r.Kommentar].filter(Boolean).join(' - ');
  return [
    ['KZ001', de(r.VertikaleLage)],
    ['KZ002', r.InspektionsKode],
    ['KZ014', r.Charakterisierung1 || null],
    ['KZ015', r.Charakterisierung2 || null],
    ['KZ003', deQ(r.Quantifizierung1Numerisch)],
    ['KZ004', deQ(r.Quantifizierung2Numerisch)],
    ['KZ005', !ddb && r.Streckenschaden ? `${r.Streckenschaden}${r.StreckenschadenLfdNr || ''}` : null],
    ['KZ006', r.PositionVon || '00'],
    ['KZ007', r.PositionBis || '00'],
    ['KZ009', r.Fotodatei || null],
    ['KZ010', langtext || null],
    ['KZ011', r.Verbindung === '1' ? 'A' : null],
    ['KZ013', r.Schachtbereich || null],
    ['KZ017', ddb ? r.Streckenschaden : null],
  ];
}

function deckelGeometrie(manhole, project) {
  if (manhole.x == null || manhole.y == null) return null;
  const crs = detectCrs(manhole.x, manhole.y, manhole.crs || project.crsLage || '');
  const gk = crs?.kind === 'gk';
  const hs = /DHHN(92|2016)|NHN/i.test(project.crsHoehe || '') ? 'NHN' : 'mNN';
  return ['GO', [
    ['GO001', manhole.name],
    ['GO002', 'D'],
    ['GO003', 'Pkt'],
    ['GP', [
      ['GP001', manhole.name],
      ['GP002', gk ? 'GK' : 'UTM'],
      [gk ? 'GP003' : 'GP005', de(manhole.x, 3)],
      [gk ? 'GP004' : 'GP006', de(manhole.y, 3)],
      ['GP007', de(manhole.deckelhoehe, 3)],
      ['GP010', manhole.deckelhoehe != null ? hs : null],
    ]],
  ]];
}

/** Stammdatenfelder des Knotens: aus M-150-Import übernehmen, sonst aus ISYBAU ableiten. */
function kgFields(manhole, insp) {
  const raw = manhole.extra?.m150 || {};
  const tiefe = manhole.tiefe ?? (insp.tiefe === '' ? null : insp.tiefe);
  const nutzung = { KS: 'S', KR: 'R', KM: 'M', DS: 'S', DR: 'R', DM: 'M' }[manhole.entwaesserungsart] || null;
  const f = {
    KG101: key(manhole.strassenschluessel),
    KG102: manhole.strasse || null,
    KG103: key(manhole.ortsteilschluessel),
    KG104: manhole.ortsteil || null,
    KG211: de(tiefe, 2),
    KG302: nutzung,
    KG305: 'S',
    KG306: 'ZES',
    ...raw,
  };
  delete f.KG001;
  if (tiefe != null) f.KG211 = de(tiefe, 2);
  return Object.keys(f).filter((k) => /^KG\d{3}$/.test(k) && f[k] != null && f[k] !== '').sort().map((k) => [k, f[k]]);
}

/**
 * @param {object} p
 * @param {object} p.project
 * @param {Array}  p.items     [{inspection, manhole}]
 * @param {object} p.settings  {company}
 * @returns {{xml:string, bytes:Uint8Array, photos:Array<{id,file}>, count:number}}
 */
export function exportM150({ project, items, settings = {} }) {
  const photos = [];
  const w = new XmlWriter();
  w.el('FD', [['FD001', '04-2010'], ['FD002', 'B']], 1);
  // verwendete Schlüssel der Referenztabellen sammeln
  const used = new Map();
  const labels = { '001': {}, '002': {}, '004': {} };
  const collect = (list) => {
    for (const item of list) {
      if (!item) continue;
      const [k, v] = item;
      if (Array.isArray(v)) collect(v);
      else if (v != null && v !== '' && RT_OF[k]) {
        if (!used.has(RT_OF[k])) used.set(RT_OF[k], new Set());
        used.get(RT_OF[k]).add(String(v));
      }
    }
    return list;
  };

  for (const { inspection: insp, manhole } of items) {
    const namer = photoNamer(manhole.name);
    const records = buildRecords(insp, { photoName: namer.name });
    const overview = insp.overview?.photoId ? namer.name(insp.overview.photoId) : null;
    const own = namer.entries();
    photos.push(...own);
    if (key(manhole.strassenschluessel) && manhole.strasse) labels['001'][manhole.strassenschluessel] = manhole.strasse;
    if (key(manhole.ortsteilschluessel) && manhole.ortsteil) labels['002'][manhole.ortsteilschluessel] = manhole.ortsteil;
    for (const [t, m] of Object.entries(manhole.extra?.m150rt || {})) Object.assign(labels[t], m);
    const uhrzeit = insp.uhrzeit ? (insp.uhrzeit.length === 5 ? insp.uhrzeit + ':00' : insp.uhrzeit) : null;
    const temp = insp.temperatur === '' || insp.temperatur == null ? null : String(Math.round(Number(insp.temperatur)));
    const ki = [
      ['KI001', project.auftraggeber || null],
      ['KI002', String(project.auftragNummer || '').slice(0, 8) || null],
      ['KI004', GRUND[project.zweck || '2'] || 'Z'],
      ['KI005', m150Kodiersystem(project.kodiersystem)],
      ['KI007', insp.status === 'fertig' ? 'E' : 'NE'],
      ['KI101', insp.bezugVertikal === '2' ? 'B' : 'A'],
      ['KI102', insp.bezugHorizontal === '2' ? 'B' : 'A'],
      ['KI103', ART[insp.verfahren ?? '2'] || 'SP'],
      ['KI104', deDate(insp.datum)],
      ['KI105', uhrzeit],
      ['KI107', insp.reinigung ? 'J' : 'N'],
      ['KI108', temp],
      ['KI109', insp.wasserhaltung && insp.wasserhaltung !== '1' ? 'J' : 'N'],
      ['KI111', (settings.company || '') || null],
      ['KI112', insp.inspekteur || null],
      ['KI117', own.length ? 'DIGFOTO' : null],
      ['KI118', overview],
      ['KI999', insp.bemerkung || null],
      ...records.map((r) => ['KZ', kzFromRecord(r)]),
    ];
    w.el('KG', collect([
      ['KG001', manhole.name],
      ...kgFields(manhole, insp),
      deckelGeometrie(manhole, project),
      ['KI', ki],
    ]), 1);
  }

  for (const t of [...used.keys()].sort()) {
    const texts = RT_TEXT[t] || labels[t] || {};
    for (const k of used.get(t)) w.el('RT', [['RT001', t], ['RT002', k], ['RT004', texts[k] || k]], 1);
  }

  const xml = [
    '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>',
    `<!-- DWA-M 150, Typ B - erstellt mit ${APP_NAME} ${APP_VERSION} -->`,
    '<DATA>',
    w.toString(),
    '</DATA>',
    '',
  ].join('\r\n');
  return { xml, bytes: encodeLatin1(xml), photos, count: items.length };
}

export function m150FileName(project) {
  const d = new Date().toISOString().slice(0, 10);
  const base = String(project.name || 'Projekt').replace(/[^\wäöüÄÖÜß.-]+/g, '_').slice(0, 40);
  return `DWA-M150_Schaechte_${base}_${d}`;
}

export const isM150Root = (root) => root?.name === 'DATA' && !!child(root, 'FD');
