// Export von Schachtinspektionen als ISYBAU-Zustandsdaten (XML-2006, -2013, -2017, -2024).

import { XmlWriter, esc, encodeLatin1 } from './xml.js';
import { fotoBenenner, FOTO_STANDARD } from './dateinamen.js';
import { buildRecords, KZUSTAND_ORDER } from './model.js';
import { bewerteInspektion, ZIELE } from './bewertung.js';

import { APP_NAME, APP_VERSION, VENDOR } from '../brand.js';
import { hatBauteile, schachtXml } from './bauteile.js';

export { APP_NAME, APP_VERSION };

const NS_OFD = 'http://www.ofd-hannover.la/Identifikation';
const NS_BFR = 'http://www.bfr-abwasser.de';

/**
 * Unterschiede der Schema-Versionen für Zustandsdaten von Schächten.
 * kodiersystem: Projektwert ('10' BFR Abwasser, '9' DWA-M 149-2, beide DIN EN 13508-2:2011)
 * auf die Referenzliste U102 der Version abbilden. 2006 kennt nur die Ausgabe 2003
 * (wie in den offiziellen 2006er-Beispieldaten: 2 = Nationale Festlegung DWA-M 149-2).
 */
export const ISYBAU_VERSIONS = {
  '2006-10': {
    label: 'ISYBAU XML-2006', ns: NS_OFD, regelwerk: '2', liegenschaft: true,
    omit: ['Index', 'Parameter', 'Gruppe', 'DDEZulaufDrainage', 'Erfassungsart'],
    kodiersystem: () => '2',
  },
  '2013-02': {
    label: 'ISYBAU XML-2013', ns: NS_OFD, regelwerk: '5', liegenschaft: true, crsInAdmin: true,
    omit: ['Index', 'DDEZulaufDrainage', 'Erfassungsart'],
    kodiersystem: (k) => k,
  },
  '2017-07': {
    label: 'ISYBAU XML-2017', ns: NS_BFR, regelwerk: '6', crsInAdmin: true,
    omit: ['Erfassungsart'],
    kodiersystem: (k) => k,
  },
  '2024-06': {
    label: 'ISYBAU XML-2024', ns: NS_BFR, regelwerk: '7', crsInAdmin: true, profilmass: true,
    omit: [],
    kodiersystem: (k) => k,
  },
};

/** Abgabeformate für die Auswahl in der App. */
export const EXPORT_FORMATS = [
  ['2006-10', 'ISYBAU XML-2006'],
  ['2013-02', 'ISYBAU XML-2013'],
  ['2017-07', 'ISYBAU XML-2017'],
  ['2024-06', 'ISYBAU XML-2024'],
  ['m150', 'DWA-M 150 (XML, Typ B)'],
];
export const formatLabel = (f) => (EXPORT_FORMATS.find(([k]) => k === f) || [, f])[1];

const ordered = (rec, order) => order.filter((k) => rec[k] != null && rec[k] !== '').map((k) => [k, rec[k]]);

/**
 * @param {object} p
 * @param {object} p.project   Projekt (Auftragsdaten)
 * @param {Array}  p.items     [{inspection, manhole}]
 * @param {object} p.settings  {company}
 * @param {string} p.version   '2006-10' | '2013-02' | '2017-07' | '2024-06'
 * @returns {{xml:string, bytes:Uint8Array, photos:Array<{id,file}>, count:number}}
 */
/** Klassifizierung eines Befundes als KZustand/Klassifizierung (vgl. BFR Anh. A-3.1.4). */
function klassifizierungXml(e) {
  if (!e || e.MaxSZe == null) return null;
  const name = { D: 'Dichtheit', S: 'Standsicherheit', B: 'Betriebssicherheit' };
  return [
    ...ZIELE.filter((z) => e.klassen[z]).map((z) => [name[z], [
      [`SK${z}vAuto`, String(e.klassen[z].k)],
      [`SZ${z}vAuto`, String(e.SZv[z])],
      [`SZ${z}eAuto`, String(e.SZe[z])],
      [`SK${z}eAuto`, String(e.SKe[z])],
    ]]),
    ['MaxSZeAuto', String(e.MaxSZe)],
    ['MaxSKeAuto', String(e.MaxSKe)],
  ];
}

/** Objektbewertung des Schachts (Knoten/Bewertung). */
function bewertungXml(b, today) {
  const q = b.massgebend?.q1;
  return [
    ['Bewertungsverfahren', '1'],
    ['Bewertungsdatum', today.toISOString().slice(0, 10)],
    ['MassgebenderSchaden', b.massgebend?.code || null],
    ['MassgebendeQuantifizierung', q === '' || q == null || !Number.isFinite(Number(q)) ? null : Number(q).toFixed(2)],
    ['ZahlVorlaeufig', b.OZv ? String(b.OZv) : null],
    ['Zusatzpunkte', b.OZv ? String(b.SL) : null],
    ['ZahlEndgueltig', String(b.OZe)],
    ['KlasseAutomatisch', String(b.OK)],
  ];
}

/** Stammdaten je Schacht mit Bauteilbeschreibung (nur Schächte mit Bauteilen oder Tiefe). */
function stammAnlagen(items, version) {
  return items.map(({ inspection: insp, manhole }) => {
    const bt = insp.bauteile || manhole.bauteile;
    if (!hatBauteile(bt)) return null;
    const { schacht, abdeckungen } = schachtXml(bt, {
      version,
      tiefe: insp.tiefe ?? manhole.tiefe,
      innenschutz: insp.innenschutz,
      anzahlAnschluesse: (insp.connections || []).length || null,
    });
    return ['AbwassertechnischeAnlage', [
      ['Objektbezeichnung', manhole.name],
      ['Objektart', '2'],
      ['Baujahr', /^\d{4}$/.test(manhole.baujahr || '') ? manhole.baujahr : null],
      ['Entwaesserungsart', ['KR', 'KS', 'KM', 'KW', 'DR', 'DS', 'DM'].includes(manhole.entwaesserungsart) ? manhole.entwaesserungsart : null],
      ['Knoten', [
        ['KnotenTyp', '0'],
        ['Schacht', schacht],
        abdeckungen ? ['Abdeckungen', abdeckungen] : null,
      ]],
      ['Lage', [
        ['Strassenschluessel', /^\d{1,5}$/.test(manhole.strassenschluessel || '') ? manhole.strassenschluessel : null],
        ['Strassenname', manhole.strasse || null],
        ['Ortsteilschluessel', /^\d{1,5}$/.test(manhole.ortsteilschluessel || '') ? manhole.ortsteilschluessel : null],
        ['Ortsteilname', manhole.ortsteil || null],
      ]],
    ]];
  }).filter(Boolean);
}

/**
 * ISYBAU-Zustandsdaten. Mit `stammdaten` (Standard) kommt ein Stammdatenkollektiv mit der
 * Bauteilbeschreibung der Schächte (Abdeckung, Auflageringe, Aufbau/Konus, Unterteil, Gerinne,
 * Steighilfen) dazu – das verlangen manche Auftraggeber zusätzlich zur Inspektion.
 */
export function exportZustandsdaten({ project, items, settings = {}, version = '2017-07', today = new Date(), bewertung = true, stammdaten = true, fotoMuster = FOTO_STANDARD }) {
  const profile = ISYBAU_VERSIONS[version];
  if (!profile) throw new Error(`Unbekannte ISYBAU-Version ${version}`);
  const isoDate = (d) => d.toISOString().slice(0, 10);
  const photos = [];
  const w = new XmlWriter();
  const kennung = 'ZUS01';
  const auftragKennung = String(project.auftragKennung || 1);
  const dates = items.map((i) => i.inspection.datum).filter(Boolean).sort();
  const order = KZUSTAND_ORDER.filter((k) => !profile.omit.includes(k));

  const benenner = fotoBenenner({ muster: fotoMuster, project });
  const anlagen = items.map(({ inspection: insp, manhole }) => {
    const namer = benenner.fuer(manhole, insp);
    const records = buildRecords(insp, { photoName: namer.name, version });
    const bew = bewertung ? bewerteInspektion(insp, manhole, project) : null;
    if (bew) {
      const byId = new Map(bew.befunde.map((e) => [e.id, e]));
      for (const r of records) {
        if (r._fid && r.Streckenschaden !== 'B') r.Klassifizierung = klassifizierungXml(byId.get(r._fid));
      }
    }
    photos.push(...namer.entries());
    const lage = [
      ['Strassenschluessel', /^\d{1,5}$/.test(manhole.strassenschluessel || '') ? manhole.strassenschluessel : null],
      ['Strassenname', manhole.strasse || null],
      ['Ortsteilschluessel', /^\d{1,5}$/.test(manhole.ortsteilschluessel || '') ? manhole.ortsteilschluessel : null],
      ['Ortsteilname', manhole.ortsteil || null],
    ];
    const uhrzeit = insp.uhrzeit ? (insp.uhrzeit.length === 5 ? insp.uhrzeit + ':00' : insp.uhrzeit) : null;
    const temp = insp.temperatur === '' || insp.temperatur == null ? null : String(Math.round(Number(insp.temperatur)));
    return ['InspizierteAbwassertechnischeAnlage', [
      ['Objektbezeichnung', manhole.name],
      ['Anlagentyp', '3'],
      ['Lage', lage],
      ['OptischeInspektion', [
        ['Auftragskennung', auftragKennung],
        ['Inspektionsdatum', insp.datum || null],
        ['Inspektionsverfahren', insp.verfahren || '2'],
        ['NameUntersucher', (insp.inspekteur || '').slice(0, 40) || null],
        ['Uhrzeit', uhrzeit],
        ['Wetter', insp.wetter || null],
        ['Temperatur', temp],
        ['Reinigung', insp.reinigung ? '1' : '0'],
        ['Wasserhaltung', insp.wasserhaltung || null],
        ['Bemerkung', insp.bemerkung || null],
        ['Knoten', [
          ['BezugspunktVertikal', insp.bezugVertikal || '1'],
          ['BezugspunktHorizontal', insp.bezugHorizontal || '1'],
          ['ArtVideoreferenz', '4'],
          ['KGrunddaten', [
            ['Innenschutz', insp.innenschutz || null],
            ['ArtAuskleidung', insp.artAuskleidung || null],
          ]],
          ['Inspektionsdaten', records.map((r) => ['KZustand', ordered(r, order)])],
          bew ? ['Bewertung', bewertungXml(bew, today)] : null,
        ]],
      ]],
    ]];
  });

  const auftrag = ['Auftrag', [
    ['Auftragsbezeichnung', (project.auftragBezeichnung || project.name || 'Schachtinspektion').slice(0, 60)],
    ['Auftragsnummer', project.auftragNummer || null],
    ['Auftragskennung', auftragKennung],
    ['Auftragsdatum', project.auftragDatum || null],
    ['Auftragsart', '1'],
    ['Inspektionsort', project.ort || null],
    ['Inspektionszweck', project.zweck || '2'],
    ['Kodiersystem', profile.kodiersystem(project.kodiersystem || '10')],
    ['Auftragnehmer', (settings.company || '').slice(0, 60) || null],
    ['Systemname', `${APP_NAME} (${VENDOR})`.slice(0, 40)],
    ['Version', APP_VERSION],
    ['InspektionsdatumEnde', dates.length ? dates[dates.length - 1] : null],
  ]];

  const eig = [['Inspektion', '1'], ['Dichtheit', '0'], ['Film', '0']];
  if (profile.profilmass) eig.push(['Profilmasserfassung', '0']);
  const stamm = stammdaten ? stammAnlagen(items, version) : [];
  const stammEig = [['Stammdatentyp', '1'], ['Bautechnik', '1'], ['Geometrie', '0'], ['Sanierung', '0'], ['Umfeld', '0']];
  if (version >= '2024') stammEig.push(['Einleitung', '0'], ['GeoPunktObjekt', '0']);

  const body = [
    ['Datenkollektive', [
      ['Datenstatus', '1'],
      ['Erstellungsdatum', isoDate(today)],
      ['Kommentar', `Schachtinspektionen – erstellt mit ${APP_NAME} ${APP_VERSION} (${VENDOR})`],
      ['Kennungen', [
        stamm.length ? ['Kollektiv', [
          ['Kennung', 'STA01'],
          ['Kollektivart', '1'],
          ['Kollektiveigenschaft', [['Stammdaten', stammEig]]],
          ['Regelwerk', profile.regelwerk],
          ['Bearbeitungsstand', isoDate(today)],
        ]] : null,
        ['Kollektiv', [
          ['Kennung', kennung],
          ['Kollektivart', '2'],
          ['Kollektiveigenschaft', [['Zustandsdaten', eig]]],
          ['Regelwerk', profile.regelwerk],
          ['Bearbeitungsstand', isoDate(today)],
        ]],
      ]],
      stamm.length ? ['Stammdatenkollektiv', [
        ['Kennung', 'STA01'],
        ['Beschreibung', `Bauteilbeschreibung der Schächte ${project.name || ''}`.trim().slice(0, 100)],
        ...stamm,
      ]] : null,
      ['Zustandsdatenkollektiv', [
        ['Kennung', kennung],
        ['Beschreibung', `Schachtinspektionen ${project.name || ''}`.trim().slice(0, 100)],
        ['Auftraege', [auftrag]],
        ...anlagen,
      ]],
    ]],
  ];

  const adminParts = [];
  if (profile.liegenschaft) {
    // 2006/2013: Liegenschaft ist Pflicht (Bundesliegenschaft; bei Kommunen z. B. Gemeinde/Projekt)
    adminParts.push(['Liegenschaft', [
      ['Liegenschaftsnummer', String(project.liegenschaftNummer || project.auftragNummer || '0').slice(0, 20)],
      ['Liegenschaftsbezeichnung', String(project.liegenschaftBezeichnung || project.name || 'Schachtinspektion').slice(0, 40)],
      ['Liegenschaftsort', (project.ort || '').slice(0, 40) || null],
    ]]);
  }
  if (profile.crsInAdmin && project.crsHoehe) adminParts.push(['Geometrie', [['CRSHoehe', project.crsHoehe]]]);
  for (const [name, value] of body) w.el(name, value, 1);
  const admin = new XmlWriter();
  for (const [name, value] of adminParts) admin.el(name, value, 2);
  const adminXml = admin.out.length ? `  <Admindaten>\r\n${admin}\r\n  </Admindaten>` : '  <Admindaten/>';

  const xml = [
    '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>',
    `<Identifikation xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="${esc(profile.ns)}">`,
    `  <Version>${version}</Version>`,
    adminXml,
    w.toString(),
    '</Identifikation>',
    '',
  ].join('\r\n');

  return { xml, bytes: encodeLatin1(xml), photos, count: items.length };
}

export function exportFileName(project, version) {
  const d = new Date().toISOString().slice(0, 10);
  const base = String(project.name || 'Projekt').replace(/[^\wäöüÄÖÜß.-]+/g, '_').slice(0, 40);
  return `ISYBAU-${version.slice(0, 4)}_Zustand_${base}_${d}`;
}
