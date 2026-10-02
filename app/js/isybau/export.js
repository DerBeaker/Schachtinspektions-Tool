// Export von Schachtinspektionen als ISYBAU-Zustandsdaten (XML-2017 oder XML-2024).

import { XmlWriter, esc, encodeLatin1 } from './xml.js';
import { buildRecords, KZUSTAND_ORDER } from './model.js';

export const APP_NAME = 'Schachtblick';
export const APP_VERSION = '0.1.0';

const NS = 'http://www.bfr-abwasser.de';

const ordered = (rec, order) => order.filter((k) => rec[k] != null && rec[k] !== '').map((k) => [k, rec[k]]);

/** Vergibt Fotodateinamen nach BFR-Konvention: <Objekt>-<lfd. Nr. 3-stellig>.jpg */
export function photoNamer(objekt) {
  const map = new Map();
  const safe = String(objekt).replace(/[\\/:*?"<>|\s]+/g, '_');
  return {
    name(photoId) {
      if (!photoId) return null;
      if (!map.has(photoId)) map.set(photoId, `${safe}-${String(map.size + 1).padStart(3, '0')}.jpg`);
      return map.get(photoId);
    },
    entries: () => [...map.entries()].map(([id, file]) => ({ id, file })),
  };
}

/**
 * @param {object} p
 * @param {object} p.project   Projekt (Auftragsdaten)
 * @param {Array}  p.items     [{inspection, manhole}]
 * @param {object} p.settings  {company}
 * @param {string} p.version   '2017-07' | '2024-06'
 * @returns {{xml:string, bytes:Uint8Array, photos:Array<{id,file}>, count:number}}
 */
export function exportZustandsdaten({ project, items, settings = {}, version = '2017-07', today = new Date() }) {
  const isoDate = (d) => d.toISOString().slice(0, 10);
  const photos = [];
  const w = new XmlWriter();
  const kennung = 'ZUS01';
  const auftragKennung = String(project.auftragKennung || 1);
  const dates = items.map((i) => i.inspection.datum).filter(Boolean).sort();
  const regelwerk = version >= '2024' ? '7' : '6';

  const anlagen = items.map(({ inspection: insp, manhole }) => {
    const namer = photoNamer(manhole.name);
    const records = buildRecords(insp, { photoName: namer.name, version });
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
          ['Inspektionsdaten', records.map((r) => ['KZustand', ordered(r, KZUSTAND_ORDER)])],
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
    ['Kodiersystem', project.kodiersystem || '10'],
    ['Auftragnehmer', (settings.company || '').slice(0, 60) || null],
    ['Systemname', APP_NAME],
    ['Version', APP_VERSION],
    ['InspektionsdatumEnde', dates.length ? dates[dates.length - 1] : null],
  ]];

  const eig = [['Inspektion', '1'], ['Dichtheit', '0'], ['Film', '0']];
  if (version >= '2024') eig.push(['Profilmasserfassung', '0']);

  const body = [
    ['Datenkollektive', [
      ['Datenstatus', '1'],
      ['Erstellungsdatum', isoDate(today)],
      ['Kommentar', `Schachtinspektionen – erstellt mit ${APP_NAME} ${APP_VERSION}`],
      ['Kennungen', [['Kollektiv', [
        ['Kennung', kennung],
        ['Kollektivart', '2'],
        ['Kollektiveigenschaft', [['Zustandsdaten', eig]]],
        ['Regelwerk', regelwerk],
        ['Bearbeitungsstand', isoDate(today)],
      ]]]],
      ['Zustandsdatenkollektiv', [
        ['Kennung', kennung],
        ['Beschreibung', `Schachtinspektionen ${project.name || ''}`.trim().slice(0, 100)],
        ['Auftraege', [auftrag]],
        ...anlagen,
      ]],
    ]],
  ];

  const crs = project.crsHoehe ? [['Geometrie', [['CRSHoehe', project.crsHoehe]]]] : [];
  for (const [name, value] of body) w.el(name, value, 1);
  const admin = new XmlWriter();
  for (const [name, value] of crs) admin.el(name, value, 2);
  const adminXml = admin.out.length ? `  <Admindaten>\r\n${admin}\r\n  </Admindaten>` : '  <Admindaten/>';

  const xml = [
    '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>',
    `<Identifikation xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="${esc(NS)}">`,
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
