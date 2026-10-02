// Referenzlisten der ISYBAU-Austauschformate Abwasser (BFR Abwasser, Anhang A-7.9)
// Nur die für die Schachtinspektion benötigten Listen.

export const REF = {
  U101: [ // Inspektionszweck
    ['1', 'Ersterfassung'], ['2', 'Turnusmäßige Inspektion'], ['3', 'Abnahme'],
    ['4', 'Ende der Gewährleistung'], ['5', 'Nachuntersuchung'], ['6', 'Vor Sanierung'],
    ['7', 'Nach Sanierung'], ['8', 'TV-Überwachung bei Dichtheitsprüfung'],
  ],
  U102: [ // Kodiersystem
    ['10', 'DIN EN 13508-2:2011 / ISYBAU (BFR Abwasser)'],
    ['9', 'DIN EN 13508-2:2011 / DWA-M 149-2'],
    ['8', 'DIN EN 13508-2:2011 / ohne nationale Festlegung'],
  ],
  U106: [['1', 'kein Niederschlag'], ['2', 'Regen'], ['3', 'Schnee- oder Eisschmelzwasser']],
  U107: [ // Wasserhaltung
    ['1', 'keine Maßnahme'], ['2', 'Zufluss von oberhalb abgesperrt'],
    ['3', 'Zufluss von oberhalb teilweise abgesperrt'], ['4', 'Seitenzuläufe abgesperrt'],
    ['5', 'Zufluss von unterhalb (Rückstau) abgesperrt'], ['6', 'andere Maßnahme'],
  ],
  U108: [ // Inspektionsverfahren
    ['2', 'Ausschließlich vom Schacht aus'], ['1', 'Begehung'], ['0', 'TV-Untersuchung'], ['3', 'anderes Verfahren'],
  ],
  U109: [ // Inspektionsart (Kameratechnik)
    ['3', 'andere Kameratechnik (Smartphone)'], ['0', 'Satellitenkamera'], ['1', 'Schiebekamera'],
    ['2', 'selbstfahrende Kamera'], ['4', 'Scannertechnik'],
  ],
  U114: [ // Art der Auskleidung
    ['0', 'nicht vorhanden'], ['1', 'werksmäßig eingebracht'], ['2', 'Spritzauskleidung'],
    ['3', 'Vor-Ort-Auskleidung'], ['4', 'abschnittsweise Auskleidung'], ['5', 'mittels einzelner Rohre'],
    ['6', 'Schlauchrelining'], ['7', 'Endlosrohre'], ['8', 'Close-Fit'], ['9', 'Wickelrohrrelining'],
  ],
  U115: [ // Vertikaler Bezugspunkt
    ['1', 'Sohle der tiefsten abgehenden Leitung (Standard)'], ['2', 'Oberkante der Abdeckung'],
  ],
  U116: [['1', 'niedrigstes abgehendes Rohr bei 12 Uhr'], ['2', 'niedrigstes abgehendes Rohr bei 6 Uhr']],
  U131: [ // DAKZustandSanierung
    ['A', 'Ablösung der Auskleidung'], ['B', 'Randablösung der Auskleidung'], ['C', 'Auskleidung verfärbt'],
    ['D', 'Kerbe/Abplatzung/Beschädigung'], ['E', 'Beule nach außen'], ['F', 'Beule nach innen'],
    ['G', 'Falte längs'], ['H', 'Falte radial'], ['I', 'Falte komplex'], ['J', 'Schadhafter Befestigungspunkt'],
    ['K', 'Schadhafte Schweißnaht'], ['L', 'Verbindung defekt'], ['M', 'Auskleidung endet im Schacht'],
    ['N', 'Auflösung Auskleidungswerkstoff'], ['O', 'Loch in Auskleidung'], ['P', 'Riss in der Auskleidung'],
    ['Z', 'Renovierung nicht fachgerecht'],
  ],
  U133: [ // KVerfahrenSanierung (nur DCBZ)
    ['A', 'Injektionstechnik'], ['B', 'Reparatur an Bauteilwandung'], ['C', 'Reparatur Bauteilverbindung'],
    ['D', 'Ringspaltabdichtung zum Anschluss'], ['E', 'Anschlusseinbindung manuell'],
    ['F', 'Anschlussöffnung ohne Einbindung'], ['G', 'Schachtbauteil ausgetauscht'], ['Z', 'sonstige Technik'],
  ],
  U138: [ // Erfassungsart (ab ISYBAU 2024)
    ['1', 'durch Inspekteur während der Inspektion'], ['2', 'durch Inspekteur nach der Inspektion'],
    ['3', 'Assistenzsystem während der Inspektion'], ['4', 'automatisierte Bildauswertung'],
  ],
  G101: [ // Entwässerungsart
    ['KS', 'Schmutzwasser'], ['KR', 'Regenwasser'], ['KM', 'Mischwasser'], ['KW', 'Fließgewässer (verrohrt)'],
    ['DS', 'Druck – Schmutzwasser'], ['DR', 'Druck – Regenwasser'], ['DM', 'Druck – Mischwasser'],
  ],
  G102: [ // Material (Auswahl)
    ['B', 'Beton'], ['SB', 'Stahlbeton'], ['STZ', 'Steinzeug'], ['MA', 'Mauerwerk'], ['ZG', 'Ziegelwerk'],
    ['OB', 'Ortbeton'], ['PC', 'Polymerbeton'], ['PHB', 'Polyesterharzbeton'], ['PVCU', 'PVC hart'],
    ['PEHD', 'PE-HD'], ['PP', 'Polypropylen'], ['GFK', 'GFK'], ['GG', 'Grauguss'], ['GGG', 'duktiles Gusseisen'],
    ['ST', 'Stahl'], ['CNS', 'Edelstahl'], ['FZ', 'Faserzement'], ['AZ', 'Asbestzement'], ['KST', 'Kunststoff (n. i.)'],
    ['MIX', 'unterschiedliche Werkstoffe'], ['W', 'nicht identifiziert'],
  ],
  G103: [ // Innenschutz
    ['NV', 'nicht vorhanden'], ['AIR', 'Beschichtung gesamter Innenraum'], ['AIS', 'Beschichtung Sohle'],
    ['AIW', 'Beschichtung Wandung'], ['KKIR', 'Kanalklinker gesamter Innenraum'], ['KKIS', 'Kanalklinker Sohle'],
    ['KKIW', 'Kanalklinker Wandung'], ['ZMR', 'Zementmörtel gesamter Innenraum'], ['ZMS', 'Zementmörtel Sohle'],
    ['ZMW', 'Zementmörtel Wandung'], ['AIKHR', 'Kunstharz gesamter Innenraum'],
  ],
  G301: [ // Schachtfunktion (Auswahl)
    ['1', 'Schacht'], ['2', 'Sonderschacht'], ['3', 'Kontrollschacht'], ['4', 'Drosselschacht'],
    ['7', 'Hausrevisionsschacht'], ['10', 'Inspektionsöffnung'], ['13', 'Drainageschacht'],
    ['15', 'Absturzschacht (Untersturz innen)'], ['16', 'Absturzschacht (Untersturz außen)'],
  ],
};

export function refLabel(list, key) {
  const e = (REF[list] || []).find(([k]) => String(k) === String(key));
  return e ? e[1] : key ?? '';
}
