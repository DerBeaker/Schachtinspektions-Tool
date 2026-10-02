// Erzeugt eine fiktive ISYBAU-Stammdatendatei (XML-2017) für Demo und Tests.
// Aufruf: node tools/make-demo.mjs > app/demo/demo-stammdaten.xml

import { XmlWriter, encodeLatin1 } from '../app/js/isybau/xml.js';

const E0 = 32550000, N0 = 5803000; // UTM32 (fiktiv, Raum Hannover)
const street = 'Musterweg';
const ort = 'Beispielstadt';

// Schächte entlang der Straße (x, y relativ, Deckelhöhe, Sohlhöhe)
const shafts = [
  ['S1001', 0, 0, 58.42, 56.10],
  ['S1002', 42.5, 6.1, 58.31, 55.92],
  ['S1003', 85.3, 9.8, 58.05, 55.71],
  ['S1004', 121.0, 38.4, 57.88, 55.46],
  ['S1005', 160.2, 61.9, 57.60, 55.18],
  ['S1006', 199.8, 66.0, 57.34, 54.21],
  ['S1007', 166.0, 18.0, 58.10, 55.95],
  ['S1008', 240.1, 70.2, 57.02, 53.98],
];
const haltungen = [ // von, nach, DN
  ['S1001', 'S1002', 300], ['S1002', 'S1003', 300], ['S1003', 'S1004', 300],
  ['S1004', 'S1005', 400], ['S1007', 'S1005', 250], ['S1005', 'S1006', 400], ['S1006', 'S1008', 400],
];
const anschluesse = [ // Name, an Schacht, dx, dy, DN, Sohle am Schacht (relativ zur Schachtsohle)
  ['S1002-GA1', 'S1002', -2, 14, 150, 0.35],
  ['S1003-GA1', 'S1003', 4, -15, 150, 0.30],
  ['S1005-SE1', 'S1005', -12, -3, 150, 0.95],
];

const P = (x, y, z, attr) => ['Punkt', [
  ['Rechtswert', (E0 + x).toFixed(3)], ['Hochwert', (N0 + y).toFixed(3)],
  ['Punkthoehe', z.toFixed(3)], ['PunktattributAbwasser', attr],
]];
const lage = [['Strassenname', street], ['Ortsteilname', ort]];
const byName = Object.fromEntries(shafts.map((s) => [s[0], s]));

const anlagen = [];
for (const [name, x, y, dh, sh] of shafts) {
  const tiefe = dh - sh;
  anlagen.push(['AbwassertechnischeAnlage', [
    ['Objektbezeichnung', name], ['Objektart', '2'], ['Status', '0'], ['Baujahr', '1987'],
    ['Entwaesserungsart', 'KM'],
    ['Knoten', [
      ['KnotenTyp', '0'],
      ['Schacht', [
        ['SchachtFunktion', '1'],
        ['Schachttiefe', tiefe.toFixed(2)],
        ['Einstieghilfe', '1'], ['ArtEinstieghilfe', '1'], ['MaterialSteighilfen', '5'],
        ['AnzahlAnschluesse', '3'],
        ['Aufbau', [['Aufbauform', 'R'], ['Abdeckplatte', '0'], ['Konus', '1'],
          ['LaengeAufbau', '1.00'], ['MaterialAufbau', 'B']]],
        ['Unterteil', [['Unterteilform', 'R'], ['LaengeUnterteil', '1.00'], ['HoeheUnterteil', '0.80'],
          ['MaterialUnterteil', 'B'], ['Gerinneform', '0'], ['MaterialGerinne', 'B']]],
      ]],
      ['Abdeckungen', [['Deckel', [['Index', '1'], ['Deckelform', 'R'], ['LaengeDeckel', '0.63'], ['Abdeckungsklasse', 'D']]]]],
    ]],
    ['Lage', lage],
    ['Geometrie', [['Geometriedaten', [['Knoten', [P(x, y, dh, 'DMP'), P(x + 0.05, y - 0.04, sh, 'SMP')]]]], ['CRSLage', 'ETRS89_UTM32']]],
  ]]);
}
for (const [name, at, dx, dy] of anschluesse) {
  const s = byName[at];
  anlagen.push(['AbwassertechnischeAnlage', [
    ['Objektbezeichnung', name], ['Objektart', '2'], ['Status', '0'], ['Entwaesserungsart', 'KM'],
    ['Knoten', [['KnotenTyp', '1'], ['Anschlusspunkt', [['Punktkennung', name.includes('SE') ? 'SE' : 'GA']]]]],
    ['Lage', lage],
    ['Geometrie', [['Geometriedaten', [['Knoten', [P(s[1] + dx, s[2] + dy, s[3] - 0.3, name.includes('SE') ? 'SE' : 'GA')]]]], ['CRSLage', 'ETRS89_UTM32']]],
  ]]);
}
const kante = (name, typ, von, vonTyp, nach, nachTyp, sv, sn, len, dn, mat, func, line) => ['AbwassertechnischeAnlage', [
  ['Objektbezeichnung', name], ['Objektart', '1'], ['Status', '0'], ['Baujahr', '1987'], ['Entwaesserungsart', 'KM'],
  ['Kante', [
    ['KantenTyp', typ], ['KnotenZulauf', von], ['KnotenZulaufTyp', vonTyp], ['KnotenAblauf', nach], ['KnotenAblaufTyp', nachTyp],
    ['SohlhoeheZulauf', sv.toFixed(3)], ['SohlhoeheAblauf', sn.toFixed(3)], ['Laenge', len.toFixed(2)], ['Material', mat],
    ['Profil', [['SonderprofilVorhanden', '0'], ['Profilart', '0'], ['Profilhoehe', String(dn)]]],
    typ === '0' ? ['Haltung', [['HaltungsFunktion', func]]] : ['Leitung', [['LeitungsFunktion', func]]],
  ]],
  ['Lage', lage],
  ['Geometrie', [['Geometriedaten', [['Kanten', line.slice(1).map((q, i) => ['Kante', [
    ['Start', P(line[i][0], line[i][1], line[i][2], i === 0 ? 'SMP' : 'LHP')[1]],
    ['Ende', P(q[0], q[1], q[2], i === line.length - 2 ? 'SMP' : 'LHP')[1]],
  ]])]]], ['CRSLage', 'ETRS89_UTM32']]],
]];

for (const [von, nach, dn] of haltungen) {
  const a = byName[von], b = byName[nach];
  // Sohlhöhe Ablauf am Schacht von = Schachtsohle; Zulauf am Schacht nach = Schachtsohle + Absturz (S1006)
  const sv = a[4];
  const sn = nach === 'S1006' ? b[4] + 0.95 : b[4] + 0.02;
  const len = Math.hypot(b[1] - a[1], b[2] - a[2]);
  anlagen.push(kante(von, '0', von, '0', nach, '0', sv, sn, len, dn, dn >= 400 ? 'SB' : 'B', '1',
    [[a[1], a[2], sv], [b[1], b[2], sn]]));
}
for (const [name, at, dx, dy, dn, rel] of anschluesse) {
  const s = byName[at];
  const sn = s[4] + rel;
  const len = Math.hypot(dx, dy);
  anlagen.push(kante(name, '1', name, '1', at, '0', sn + 0.3, sn, len, dn, 'STZ', '1',
    [[s[1] + dx, s[2] + dy, sn + 0.3], [s[1], s[2], sn]]));
}

const w = new XmlWriter();
w.el('Admindaten', [['Geometrie', [['CRSHoehe', 'DE_DHHN2016_NH']]]], 1);
w.el('Datenkollektive', [
  ['Datenstatus', '1'], ['Erstellungsdatum', '2026-01-15'], ['Kommentar', 'Fiktive Demo-Daten (Schachtblick)'],
  ['Kennungen', [['Kollektiv', [
    ['Kennung', 'STA01'], ['Kollektivart', '1'],
    ['Kollektiveigenschaft', [['Stammdaten', [['Stammdatentyp', '1'], ['Bautechnik', '1'], ['Geometrie', '1'], ['Sanierung', '0'], ['Umfeld', '0']]]]],
    ['Regelwerk', '6'], ['Bearbeitungsstand', '2026-01-15'],
  ]]]],
  ['Stammdatenkollektiv', [['Kennung', 'STA01'], ['Beschreibung', 'Demo Musterweg'], ...anlagen]],
], 1);

const xml = [
  '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>',
  '<Identifikation xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.bfr-abwasser.de">',
  '  <Version>2017-07</Version>',
  w.toString(),
  '</Identifikation>',
  '',
].join('\r\n');
process.stdout.write(encodeLatin1(xml));
