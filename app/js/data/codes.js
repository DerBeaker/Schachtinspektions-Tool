// Kodekatalog für Schächte und Inspektionsöffnungen
// Quelle: BFR Abwasser, Anhang A-2.3.8.2 "Zulässige Kodes für Schächte und
// Inspektionsöffnungen" (Stand Januar 2025) – Kodiersystem DIN EN 13508-2:2011
// mit nationaler Festlegung (ISYBAU) bzw. DWA-M 149-2.
//
// Aufbau eines Eintrags:
//   group   A = bauliche Feststellung, B = betriebliche Feststellung,
//           C = Bestand/Steuerkode, D = Inspektion/Allgemein
//   c1      Liste der Charakterisierungen 1  {k, t, q1?, q2?, c2?}
//           q1/q2 im Eintrag überschreiben die Kode-Quantifizierung (null = keine)
//           c2 im Eintrag überschreibt die Liste der Charakterisierungen 2
//   c2      Liste der Charakterisierungen 2 (für alle C1, sofern nicht überschrieben)
//   c2req   Charakterisierung 2 ist Pflicht, wenn eine Liste existiert
//   q1/q2   {unit, label, dec(imals), req(uired)}
//   lage    Lage am Umfang: 'req' | 'opt' | 'none'
//   bereich Schachtbereich: 'req' | 'opt'
//   hint    Anwendungshinweise (aus den Fußnoten des Katalogs, gekürzt)

const Z = (t = 'andere') => ({ k: 'Z', t, z: true });

const CAUSES = {
  A: { k: 'A', t: 'mechanisch' },
  B: { k: 'B', t: 'chemisch – allgemein' },
  C: { k: 'C', t: 'chemisch – oberer Teil des Gerinnes oder weiter oben' },
  D: { k: 'D', t: 'chemisch – unterer Teil des Gerinnes' },
  E: { k: 'E', t: 'Schadensursache nicht feststellbar' },
  Z: { k: 'Z', t: 'andere Ursache', z: true },
};
const causes = (...keys) => keys.map((k) => CAUSES[k]);

export const GROUPS = {
  A: { name: 'Bauliche Schäden', short: 'Baulich', color: 'var(--c-struct)' },
  B: { name: 'Betriebliche Feststellungen', short: 'Betrieb', color: 'var(--c-oper)' },
  C: { name: 'Bestand & Anschlüsse', short: 'Bestand', color: 'var(--c-inv)' },
  D: { name: 'Inspektion & Allgemein', short: 'Allgemein', color: 'var(--c-gen)' },
};

export const CODES = {
  // ---------------------------------------------------------------- Bestand
  DCA: {
    group: 'C', name: 'Anschluss',
    desc: 'Eine Rohrleitung ist an den Schacht angeschlossen (Art des Anschlusses). Muss direkt von DCG gefolgt werden.',
    c1: [
      { k: 'A', t: 'Anschluss im Auftritt', c2: [
        { k: 'A', t: 'Gerinne im Auftritt' },
        { k: 'B', t: 'Anschluss leitet über den Auftritt ab' },
        { k: 'C', t: 'Absturz mit Schussgerinne' },
        { k: 'D', t: 'Rohr unter dem Auftritt' },
        Z(),
      ] },
      { k: 'B', t: 'freier Zulauf ins Gerinne' },
      { k: 'C', t: 'außenliegender Untersturz' },
      { k: 'D', t: 'innenliegender Untersturz' },
      { k: 'E', t: 'Absturz mit Schussgerinne' },
      { k: 'F', t: 'Belüftungsrohr' },
      Z('anderer Anschluss (z. B. oberhalb Gerinne/Auftritt)'),
    ],
    lage: 'req', bereich: 'req', managed: true,
    hint: 'Wird in der App über „Anschlüsse“ gepflegt – DCA und DCG werden automatisch paarweise erzeugt.',
  },
  DCG: {
    group: 'C', name: 'Anschlussleitung',
    desc: 'Einzelheiten zur Anschlussleitung (Form, Fließrichtung, Abmessungen).',
    c1: [
      { k: 'A', t: 'kreisförmig' }, { k: 'B', t: 'rechteckig' }, { k: 'C', t: 'eiförmig' },
      { k: 'D', t: 'U-förmig' }, { k: 'E', t: 'bogenförmig' }, { k: 'F', t: 'oval' }, Z(),
    ],
    c2: [
      { k: 'A', t: 'entwässert in den Schacht (Zulauf)' },
      { k: 'B', t: 'entwässert aus dem Schacht (Ablauf)' },
      { k: 'C', t: 'Anschluss verschlossen' },
    ],
    c2req: true,
    q1: { unit: 'mm', label: 'Höhe / DN', req: true },
    q2: { unit: 'mm', label: 'Breite (nur wenn ≠ Höhe)' },
    lage: 'req', bereich: 'req', managed: true,
    hint: 'Verstopfte Anschlüsse mit C2 = A beschreiben (sie sollten grundsätzlich offen sein).',
  },
  DCB: {
    group: 'C', name: 'Punktuelle Reparatur',
    desc: 'Ein Schacht wurde repariert (nur für sanierte Schächte).',
    c1: [Z('andere')],
    lage: 'req', bereich: 'req', sanierung: true,
    hint: 'Sanierungsbezeichnung (z. B. SAN1) und Verfahren angeben. Länger als 0,50 m → Streckenfeststellung.',
  },
  DCH: {
    group: 'C', name: 'Auftritt',
    desc: 'Beschreibung von Lage und Zustand des Auftritts (vertikale Lage = Position).',
    c1: [{ k: 'A', t: 'Auftritt schadhaft' }, { k: 'B', t: 'Auftritt nicht schadhaft' }, { k: 'C', t: 'kein Auftritt' }],
    lage: 'none', bereich: 'req', defaultBereich: 'H',
    hint: 'Ein Schaden ist zusätzlich mit einem Primärschaden (z. B. DAF) im Bereich H zu beschreiben.',
  },
  DCI: {
    group: 'C', name: 'Gerinne',
    desc: 'Beschreibung von Lage, Abmessungen und Zustand des Gerinnes.',
    c1: [
      { k: 'A', t: 'Gerinne schadhaft' }, { k: 'B', t: 'Gerinne nicht schadhaft' },
      { k: 'C', t: 'kein Gerinne', q1: null, q2: null, c2: [] },
    ],
    c2: [
      { k: 'A', t: 'verengt (in Fließrichtung)' }, { k: 'B', t: 'erweitert (in Fließrichtung)' },
      { k: 'C', t: 'besitzt Hochpunkt' }, { k: 'D', t: 'besitzt Niedrigpunkt' },
    ],
    c2req: false,
    q1: { unit: 'mm', label: 'Breite' }, q2: { unit: 'mm', label: 'Höhe' },
    lage: 'none', bereich: 'req', defaultBereich: 'I',
    hint: 'Ein Schaden ist zusätzlich mit einem Primärschaden im Bereich I zu beschreiben.',
  },
  DCJ: {
    group: 'C', name: 'Sicherheitsketten/-balken',
    desc: 'Lage und Zustand von Sicherheitsketten/-balken an den abgehenden Anschlüssen.',
    c1: [
      { k: 'A', t: 'Sicherheitskette vorhanden ohne Schäden' }, { k: 'B', t: 'Sicherheitskette fehlend' },
      { k: 'C', t: 'Sicherheitskette schadhaft' }, { k: 'D', t: 'Sicherheitskette mit Ablagerungen belegt' },
      { k: 'E', t: 'Sicherheitsbalken vorhanden ohne Schäden' }, { k: 'F', t: 'Sicherheitsbalken fehlend' },
      { k: 'G', t: 'Sicherheitsbalken schadhaft' }, { k: 'H', t: 'Sicherheitsbalken mit Ablagerungen belegt' },
    ],
    lage: 'opt', bereich: 'req',
  },
  DCK: {
    group: 'C', name: 'Abflussregulierung',
    desc: 'Ein Überlaufwehr oder eine andere Abflussregulierungseinrichtung ist vorhanden.',
    c1: [
      { k: 'A', t: 'Wehr' }, { k: 'B', t: 'Heber' }, { k: 'C', t: 'Öffnungsklappe' }, { k: 'D', t: 'Wirbeldrossel' },
      { k: 'E', t: 'Absperrschieber' }, { k: 'F', t: 'abflussabhängiger Absperrschieber' },
      { k: 'G', t: 'Messgerinne (z. B. Venturi)' }, { k: 'H', t: 'Rückschlagklappe' }, { k: 'I', t: 'Rechen/Sieb' }, Z(),
    ],
    c2: [{ k: 'A', t: 'Durchflussregulierung' }, { k: 'B', t: 'Abschlagsregulierung' }],
    c2req: false,
    lage: 'opt', bereich: 'req',
    hint: 'Lage am Umfang = übliche Fließrichtung durch die Einrichtung.',
  },
  DCL: {
    group: 'C', name: 'Rohrdurchführung',
    desc: 'Eine geschlossene Rohrleitung quert den Schacht.',
    c1: [
      { k: 'A', t: 'keine Öffnungsmöglichkeit vorhanden' },
      { k: 'B', t: 'Öffnungsmöglichkeit vorhanden – Abdeckung am Platz' },
      { k: 'C', t: 'Öffnungsmöglichkeit vorhanden – Abdeckung fehlt' },
    ],
    c2: [{ k: 'A', t: 'schadhaft' }, { k: 'B', t: 'nicht schadhaft' }],
    c2req: true,
    lage: 'opt', bereich: 'req',
    hint: 'Zusätzlich DCA/DCG für die Anschlüsse verwenden.',
  },
  DCM: {
    group: 'C', name: 'Schmutzfänger unter der Abdeckung',
    c1: [{ k: 'A', t: 'vorhanden ohne Schäden' }, { k: 'B', t: 'fehlend' }, { k: 'C', t: 'schadhaft' }],
    lage: 'none', bereich: 'req', defaultBereich: 'A',
  },
  DCN: {
    group: 'C', name: 'Schlammfang in der Sohle',
    c1: [{ k: 'A', t: 'Schlammfang nicht schadhaft' }, { k: 'B', t: 'Schlammfang schadhaft' }],
    lage: 'none', bereich: 'req', defaultBereich: 'J',
  },
  DCO: {
    group: 'C', name: 'Querschnitt',
    c1: [{ k: 'A', t: 'kreisförmig' }, { k: 'B', t: 'rechteckig' }, Z()],
    q1: { unit: 'mm', label: 'Höhe' }, q2: { unit: 'mm', label: 'Breite (nur wenn ≠ Höhe)' },
    lage: 'none', bereich: 'req',
  },
  CED: {
    group: 'C', name: 'Veränderte Grundlageninformation – Werkstoff',
    desc: 'Werkstoffwechsel innerhalb des Schachtes (Charakterisierung = Werkstoffkürzel nach G102).',
    c1Ref: 'G102',
    lage: 'none', bereich: 'opt',
  },

  // ---------------------------------------------------------------- Inspektion / allgemein
  DDA: {
    group: 'D', name: 'Allgemeines Foto',
    desc: 'Standaufnahme des Allgemeinzustands ohne ein Merkmal speziell zu erfassen.',
    lage: 'opt', bereich: 'opt', commentReq: true, photoReq: true,
    hint: 'Erläuterung zum Foto als Anmerkung. Lage am Umfang = Richtung der Kamera.',
  },
  DDB: {
    group: 'D', name: 'Allgemeine Anmerkung',
    desc: 'Anmerkung, die nicht auf andere Weise aufgenommen werden kann.',
    lage: 'none', bereich: 'opt', commentReq: true,
    hint: 'Inspektionsanfang/-ende (DDB A/B) erzeugt die App automatisch.',
  },
  DDC: {
    group: 'D', name: 'Inspektion nicht vollständig durchgeführt',
    desc: 'Die ursächliche Feststellung (z. B. Hindernis) ist zusätzlich zu kodieren.',
    c1: [{ k: 'Y', t: '–' }],
    c2: [
      { k: 'Y', t: 'Abbruch der Inspektion' }, { k: 'A', t: 'Inspektionsziel erreicht' },
      { k: 'B', t: 'Auftraggeber verzichtet auf weitere Inspektion' }, Z(),
    ],
    c2req: true,
    lage: 'none', bereich: 'opt',
    hint: 'Gründe, die nicht im Zustand liegen, als Anmerkung dokumentieren.',
  },
  DDD: {
    group: 'D', name: 'Wasserspiegel',
    desc: 'Höhe des Abwasserspiegels; die vertikale Lage gibt den Wasserspiegel an.',
    lage: 'none', bereich: 'opt',
    hint: 'Nur verwenden, wenn der Wasserspiegel durch Rückstau aus dem unterhalb liegenden Kanal verursacht ist.',
  },
  DDE: {
    group: 'D', name: 'Zufluss aus einem Anschluss',
    desc: 'Information über den Abwasserzufluss aus einem Anschluss (Pflicht bei Fehlanschlüssen).',
    c1: [
      { k: 'A', t: 'klares Abwasser (Sohle sichtbar)' }, { k: 'B', t: 'Anwendung des Kodes nicht fortgeführt' },
      { k: 'C', t: 'trüb' }, { k: 'D', t: 'gefärbt' }, { k: 'E', t: 'trüb und gefärbt' },
      { k: 'Y', t: 'nicht erkennbar (zu hoher Wasserspiegel)', c2: [{ k: 'Y', t: 'nicht erkennbar' }] },
    ],
    c2: [
      { k: 'A', t: 'falsch angeschlossen – Schmutzwasser in Regenwasserleitung' },
      { k: 'B', t: 'falsch angeschlossen – Regenwasser in Schmutzwasserleitung' },
      { k: 'C', t: 'kein Fehlanschluss erkennbar' },
    ],
    c2req: true,
    lage: 'req', bereich: 'opt', drainage: true,
  },
  DDF: {
    group: 'D', name: 'Atmosphäre im Schacht',
    desc: 'Eine potenziell gefährliche Atmosphäre wurde festgestellt.',
    c1: [{ k: 'A', t: 'Sauerstoffmangel' }, { k: 'B', t: 'Schwefelwasserstoff' }, { k: 'C', t: 'Methan' }, Z()],
    q1: { unit: '%', label: 'Anteil' }, q2: { unit: 'ppm', label: 'Konzentration (ersatzweise)' },
    lage: 'none', bereich: 'opt',
  },
  DDG: {
    group: 'D', name: 'Keine Sicht',
    c1: [{ k: 'A', t: 'Kamera unter Wasser' }, { k: 'B', t: 'Verschlammung' }, { k: 'C', t: 'Dämpfe' }, Z()],
    lage: 'none', bereich: 'opt',
  },

  // ---------------------------------------------------------------- bauliche Schäden
  DAA: {
    group: 'A', name: 'Verformung',
    desc: 'Der Querschnitt hat sich gegenüber der Ursprungsform verformt.',
    c1: [
      { k: 'A', t: 'allgemein – großer Teil der Wand' },
      { k: 'B', t: 'punktuell – kleiner Teil der Wand' },
    ],
    q1: { unit: '%', label: 'max. Abmessungsminderung', req: true },
    lage: 'opt', bereich: 'req',
    hint: 'Bei punktueller Verformung immer Lage am Umfang angeben. Bei biegesteifen Bauteilen zuerst Riss/Bruch beschreiben.',
  },
  DAB: {
    group: 'A', name: 'Rissbildung',
    c1: [
      { k: 'A', t: 'Oberflächenriss (Haarriss)', q1: null },
      { k: 'B', t: 'Riss – Risslinien erkennbar, Segmente am Platz', min: 0.5 },
      { k: 'C', t: 'klaffender Riss – offener Spalt, Segmente am Platz', min: 5 },
    ],
    c2: [
      { k: 'A', t: 'vertikal' }, { k: 'B', t: 'horizontal' }, { k: 'C', t: 'komplex (scherbenförmig)' },
      { k: 'D', t: 'geneigt' }, { k: 'E', t: 'sternförmig (von einem Punkt ausgehend)' },
    ],
    c2req: true,
    q1: { unit: 'mm', label: 'Rissbreite', dec: 1, req: true },
    lage: 'req', bereich: 'req',
    hint: 'B gilt ab 0,5 mm, C ab 5 mm. Werte < 1 mm mit einer Nachkommastelle. Versatz an Horizontalrissen als Anmerkung.',
  },
  DAC: {
    group: 'A', name: 'Bruch/Einsturz',
    c1: [
      { k: 'A', t: 'Bruch – Wandsegmente verschoben, nicht fehlend' },
      { k: 'B', t: 'Fehlen von Teilen – Wandsegmente fehlen' },
      { k: 'C', t: 'Einsturz – Gefüge vollständig zerstört', q1: null },
    ],
    q1: { unit: 'mm', label: 'Länge (falls < 1000 mm)' },
    lage: 'req', bereich: 'req',
    hint: 'Ausdehnung über 0,50 m als Streckenfeststellung kodieren. Verformung ggf. zusätzlich.',
  },
  DAD: {
    group: 'A', name: 'Defektes Mauerwerk',
    c1: [
      { k: 'A', t: 'verschoben – Steine vorhanden, aber verschoben' },
      { k: 'B', t: 'fehlend – Mauersteine/Ziegel fehlen', c2: [
        { k: 'A', t: 'weitere Mauerwerksschicht sichtbar' },
        { k: 'B', t: 'nichts zu sehen' },
      ] },
      { k: 'C', t: 'Einsturz – Verband vollständig zerstört' },
    ],
    c2req: true,
    lage: 'req', bereich: 'req',
    hint: 'Ist Boden oder ein Hohlraum sichtbar, zusätzlich DAO bzw. DAP verwenden.',
  },
  DAE: {
    group: 'A', name: 'Fehlender Mörtel',
    q1: { unit: 'mm', label: 'Tiefe', req: true, min: 5 },
    lage: 'req', bereich: 'req',
    hint: 'Fehlender Fugenmörtel unter 5 mm Tiefe wird nicht aufgezeichnet. Korrosion zusätzlich mit DAFZ.',
  },
  DAF: {
    group: 'A', name: 'Oberflächenschaden',
    desc: 'Mechanische oder chemische Schädigung der Innenfläche (inkl. Korrosion von Metall).',
    c1: [
      { k: 'A', t: 'erhöhte Rauheit' },
      { k: 'B', t: 'Abplatzung', c2: causes('A', 'E', 'Z') },
      { k: 'C', t: 'Zuschlagstoffe sichtbar' },
      { k: 'D', t: 'Zuschlagstoffe einragend' },
      { k: 'E', t: 'Zuschlagstoffe fehlen' },
      { k: 'F', t: 'Bewehrung sichtbar' },
      { k: 'G', t: 'Bewehrung einragend' },
      { k: 'H', t: 'Bewehrung korrodiert', c2: causes('B', 'C', 'D', 'E') },
      { k: 'I', t: 'fehlende Wand (Loch)' },
      { k: 'J', t: 'Korrosion an der Oberfläche (Metall)', c2: causes('B', 'C', 'D', 'E', 'Z') },
      { k: 'K', t: 'Blasenbildung (Beulen)' },
      Z('anderer Oberflächenschaden'),
    ],
    c2: causes('A', 'B', 'C', 'D', 'E', 'Z'),
    c2req: true,
    lage: 'req', bereich: 'req',
    hint: 'Nur für nicht ausgekleidete Bauteile. Korrosion von außen mit DAFZB + Anmerkung. Bei Loch und Boden/Hohlraum sichtbar zusätzlich DAO/DAP.',
  },
  DAG: {
    group: 'A', name: 'Einragender Anschluss',
    q1: { unit: 'mm', label: 'Einragende Länge', req: true },
    lage: 'req', bereich: 'req',
    hint: 'Vertikale Lage bezieht sich auf die Sohle des Anschlusses. Anschluss zusätzlich mit DCA/DCG erfassen.',
  },
  DAH: {
    group: 'A', name: 'Schadhafter Anschluss',
    c1: [
      { k: 'A', t: 'falsche Position des Anschlusses' },
      { k: 'B', t: 'Spalt zwischen Anschlussende und Wand' },
      { k: 'C', t: 'teilweise Spalt am Umfang (unvollständig eingebunden)' },
      { k: 'D', t: 'Anschluss beschädigt' },
      { k: 'E', t: 'Anschluss verstopft (auch Wurzeleinwuchs)' },
      Z(),
    ],
    lage: 'req', bereich: 'req',
    hint: 'Anschluss zusätzlich mit DCA/DCG erfassen. Bei Wurzeleinwuchs zusätzlich DBA.',
  },
  DAI: {
    group: 'A', name: 'Einragendes Dichtungsmaterial',
    c1: [
      { k: 'A', t: 'Dichtring', c2: [
        { k: 'A', t: 'sichtbar verschoben, nicht einragend' },
        { k: 'B', t: 'einragend, aber nicht gebrochen' },
        { k: 'C', t: 'gebrochen' },
      ] },
      Z('andere (z. B. einragende Dichtungsmasse)'),
    ],
    c2req: true,
    lage: 'req', bereich: 'req',
  },
  DAJ: {
    group: 'A', name: 'Verschobene Verbindung',
    c1: [
      { k: 'A', t: 'vertikal verschoben' },
      { k: 'B', t: 'horizontal verschoben' },
      { k: 'C', t: 'im Winkel (Achsen nicht parallel)', q1: { unit: 'mm', label: 'max. Verschiebung', req: true } },
    ],
    q1: { unit: 'mm', label: 'Länge der Verschiebung', req: true },
    lage: 'opt', bereich: 'req', verbindung: true,
    hint: 'Lage am Umfang = Richtung der Verschiebung (Betrachtung von oben).',
  },
  DAK: {
    group: 'A', name: 'Feststellung der Innenauskleidung',
    c1: [
      { k: 'A', t: 'Innenauskleidung abgelöst', q1: { unit: '%', label: 'Querschnittsverringerung' } },
      { k: 'B', t: 'Innenauskleidung verfärbt' },
      { k: 'C', t: 'Endstelle der Auskleidung schadhaft' },
      { k: 'D', t: 'Falten in der Innenauskleidung', q1: { unit: '%', label: 'Querschnittsverringerung' }, c2: [
        { k: 'A', t: 'vertikal' }, { k: 'B', t: 'horizontal' }, { k: 'C', t: 'komplex' }, { k: 'D', t: 'spiralförmig' },
      ] },
      { k: 'E', t: 'Blasen oder Beulen nach innen', q1: { unit: '%', label: 'Querschnittsverringerung' } },
      { k: 'F', t: 'Beulen außen', q1: { unit: 'mm', label: 'Tiefe der Beule' } },
      { k: 'G', t: 'Ablösen der Innenhaut/Beschichtung' },
      { k: 'H', t: 'Ablösen der Abdeckung der Verbindungsnaht' },
      { k: 'I', t: 'Riss oder Spalt (inkl. Schweißnaht)', q1: { unit: 'mm', label: 'Breite' } },
      { k: 'J', t: 'Loch in der Auskleidung', q1: { unit: 'mm', label: 'Länge' } },
      { k: 'K', t: 'Auskleidungsverbindung defekt' },
      { k: 'L', t: 'Auskleidungswerkstoff erscheint weich' },
      { k: 'M', t: 'Harz fehlt im Laminat' },
      { k: 'N', t: 'Ende der Auskleidung nicht abgedichtet' },
      { k: 'Z', t: 'anderer Auskleidungsschaden', z: true, q1: { unit: '%', label: 'Querschnittsverringerung' } },
    ],
    c2req: false,
    lage: 'req', bereich: 'req', sanierung: true,
    hint: 'Bei örtlich begrenzter Auskleidung zusätzlich DCB. Bei großem Schadensbild ggf. DAO.',
  },
  DAL: {
    group: 'A', name: 'Schadhafte Reparatur',
    c1: [
      { k: 'A', t: 'Wand fehlt teilweise', q1: { unit: 'mm', label: 'Länge' } },
      { k: 'B', t: 'Reparatur zur Abdichtung eines Lochs schadhaft', q1: { unit: 'mm', label: 'Länge' } },
      { k: 'C', t: 'Ablösen des Reparaturwerkstoffs', q1: { unit: '%', label: 'Querschnittsverringerung' } },
      { k: 'D', t: 'fehlender Reparaturwerkstoff an der Kontaktfläche', q1: { unit: 'mm', label: 'Länge' } },
      { k: 'E', t: 'überschüssiger Reparaturwerkstoff (Hindernis)', q1: { unit: '%', label: 'Querschnittsverringerung' } },
      { k: 'F', t: 'Loch im Reparaturwerkstoff', q1: { unit: 'mm', label: 'Länge' } },
      { k: 'G', t: 'Riss im Reparaturwerkstoff', q1: { unit: 'mm', label: 'Breite' } },
      { k: 'Z', t: 'andere', z: true, q1: { unit: '%', label: 'Querschnittsverringerung' } },
    ],
    lage: 'req', bereich: 'req', sanierung: true,
    hint: 'Nur für sanierte Schächte und nach DCB. Örtlich begrenzte Auskleidung → DAK.',
  },
  DAM: {
    group: 'A', name: 'Schadhafte Schweißnaht',
    c1: [{ k: 'A', t: 'vertikal' }, { k: 'B', t: 'horizontal' }, { k: 'C', t: 'geneigt' }],
    lage: 'req', bereich: 'req',
    hint: 'In Verbundwerkstoffen oder nach Renovierung → DAK.',
  },
  DAN: { group: 'A', name: 'Poröse Wand', lage: 'req', bereich: 'req' },
  DAO: {
    group: 'A', name: 'Boden sichtbar', lage: 'req', bereich: 'req', secondary: true,
    hint: 'Nur in Verbindung mit einem Primärschaden verwenden.',
  },
  DAP: {
    group: 'A', name: 'Hohlraum sichtbar', lage: 'req', bereich: 'req', secondary: true,
    hint: 'Nur in Verbindung mit einem Primärschaden verwenden.',
  },
  DAQ: {
    group: 'A', name: 'Schadhafte Steighilfen',
    c1: [
      { k: 'A', t: 'lockeres Steigeisen' }, { k: 'B', t: 'fehlendes Steigeisen' },
      { k: 'C', t: 'korrodiertes Steigeisen' }, { k: 'D', t: 'verbogenes Steigeisen' },
      { k: 'E', t: 'Kunststoffverkleidung gebrochen' }, { k: 'F', t: 'Handlauf der Steigleiter korrodiert' },
      { k: 'G', t: 'lockere Absturzsicherung der Leiter' }, { k: 'H', t: 'fehlende Absturzsicherung der Leiter' },
      { k: 'I', t: 'korrodierte Absturzsicherung der Leiter' }, { k: 'J', t: 'korrodierte Leitersprossen' },
      { k: 'K', t: 'schadhafter Steigkasten' }, Z(),
    ],
    q1: { unit: 'Anz.', label: 'Anzahl' },
    lage: 'opt', bereich: 'req',
    hint: 'Mehrere schadhafte Steigeisen als Streckenfeststellung. Nicht verwenden, wenn keine festen Steighilfen vorhanden sind.',
  },
  DAR: {
    group: 'A', name: 'Schäden an Abdeckung und Rahmen',
    c1: [
      { k: 'A', t: 'Abdeckung gebrochen' }, { k: 'B', t: 'Abdeckung wackelt' }, { k: 'C', t: 'Abdeckung nicht vorhanden' },
      { k: 'D', t: 'Rahmen gebrochen' }, { k: 'E', t: 'Rahmen locker' }, { k: 'F', t: 'Rahmen fehlt' },
      { k: 'G', t: 'Abdeckung unterhalb der Geländeoberfläche', q1: { unit: 'mm', label: 'Höhenunterschied', req: true } },
      { k: 'H', t: 'Abdeckung oberhalb der Geländeoberfläche', q1: { unit: 'mm', label: 'Höhenunterschied', req: true } },
      Z(),
    ],
    lage: 'none', bereich: 'req', defaultBereich: 'A', atTop: true,
    hint: 'Mehrere Schäden an Abdeckung/Rahmen → Kode wiederholen.',
  },

  // ---------------------------------------------------------------- betriebliche Feststellungen
  DBA: {
    group: 'B', name: 'Wurzeln',
    c1: [{ k: 'A', t: 'Pfahlwurzeln' }, { k: 'B', t: 'einzelne feine Wurzeln' }, { k: 'C', t: 'komplexes Wurzelwerk' }],
    lage: 'req', bereich: 'req',
    hint: 'Bei Einwuchs durch Anschlüsse zusätzlich DAHE.',
  },
  DBB: {
    group: 'B', name: 'Anhaftende Stoffe',
    c1: [
      { k: 'A', t: 'Inkrustation (auch Sinterungen)' }, { k: 'B', t: 'Fett' },
      { k: 'C', t: 'Fäulnis (anhaftende Organismen)' }, Z(),
    ],
    q1: { unit: 'mm', label: 'Stärke' },
    lage: 'req', bereich: 'req',
  },
  DBC: {
    group: 'B', name: 'Ablagerungen',
    c1: [
      { k: 'A', t: 'feines Material (Sand, Schluff)' }, { k: 'B', t: 'grobes Material (Kies, Schutt)' },
      { k: 'C', t: 'hartes/verdichtetes Material (Beton)' }, Z(),
    ],
    q1: { unit: 'mm', label: 'Ablagerungshöhe', req: true },
    lage: 'opt', bereich: 'req',
  },
  DBD: {
    group: 'B', name: 'Eindringen von Bodenmaterial', lage: 'req', bereich: 'req',
    hint: 'Selbstständig oder in Verbindung mit einem Primärschaden.',
  },
  DBE: {
    group: 'B', name: 'Andere Hindernisse',
    c1: [
      { k: 'A', t: 'Ziegel oder Mauerwerk' }, { k: 'B', t: 'Rohrteile' }, { k: 'C', t: 'anderer Gegenstand' },
      { k: 'D', t: 'ragt durch die Wand ein' }, { k: 'E', t: 'in Verbindung eingekeilt' },
      { k: 'F', t: 'dringt durch einen Anschluss ein' }, { k: 'G', t: 'fremde Leitungen/Kabel queren' },
      { k: 'H', t: 'in das Bauwerk eingebaut' }, Z(),
    ],
    q1: { unit: 'mm', label: 'max. Abmessung' },
    lage: 'req', bereich: 'req',
  },
  DBF: {
    group: 'B', name: 'Infiltration',
    c1: [
      { k: 'A', t: 'Schwitzen – keine sichtbaren Tropfen' }, { k: 'B', t: 'Tropfen – kein kontinuierliches Fließen' },
      { k: 'C', t: 'Fließen – kontinuierlich' }, { k: 'D', t: 'Spritzen – unter Druck' },
    ],
    c2: [
      { k: 'A', t: 'durch die Wand' },
      { k: 'B', t: 'Spalt Wand/Anschluss im Sohlbereich' },
      { k: 'C', t: 'Spalt Wand/Anschluss oberhalb des Auftritts' },
    ],
    c2req: true,
    lage: 'req', bereich: 'req',
  },
  DBG: { group: 'B', name: 'Exfiltration', lage: 'opt', bereich: 'req' },
  DBH: {
    group: 'B', name: 'Ungeziefer',
    c1: [{ k: 'A', t: 'Ratte' }, { k: 'B', t: 'Küchenschabe/Kakerlake' }, Z()],
    c2: [
      { k: 'A', t: 'im Schacht' }, { k: 'B', t: 'in einem Anschluss' },
      { k: 'C', t: 'in einer offenen Verbindung' }, Z(),
    ],
    c2req: true,
    q1: { unit: 'Anz.', label: 'Anzahl' },
    lage: 'opt', bereich: 'req',
  },
};

// Häufig benutzte Kodes für die Schnellauswahl
export const FAVORITES = ['DAF', 'DBF', 'DAB', 'DAQ', 'DAR', 'DCH', 'DCI', 'DBC', 'DBB', 'DAH', 'DAE', 'DDB'];

export const SCHACHTBEREICHE = [
  { k: 'A', t: 'Abdeckung und Rahmen' },
  { k: 'B', t: 'Auflageringe' },
  { k: 'C', t: 'Schachtaufbau (Wand)' },
  { k: 'D', t: 'Konus' },
  { k: 'E', t: 'Übergangsplatte' },
  { k: 'F', t: 'untere Schachtzone' },
  { k: 'G', t: 'Podest' },
  { k: 'H', t: 'Auftritt' },
  { k: 'I', t: 'Gerinne' },
  { k: 'J', t: 'Sohle' },
];

/** Charakterisierungen 1 eines Kodes (inkl. Referenzliste für CED). */
export function c1Options(code, reflists) {
  const def = CODES[code];
  if (!def) return [];
  if (def.c1Ref && reflists) return reflists[def.c1Ref].map(([k, t]) => ({ k, t }));
  return def.c1 || [];
}

/** Charakterisierungen 2 abhängig von C1. */
export function c2Options(code, c1) {
  const def = CODES[code];
  if (!def) return [];
  const e = (def.c1 || []).find((x) => x.k === c1);
  if (e && e.c2) return e.c2;
  return def.c2 || [];
}

/** Quantifizierung (1 oder 2) abhängig von C1; null = keine. */
export function quantDef(code, c1, n = 1) {
  const def = CODES[code];
  if (!def) return null;
  const key = n === 1 ? 'q1' : 'q2';
  const e = (def.c1 || []).find((x) => x.k === c1);
  if (e && key in e) return e[key];
  return def[key] || null;
}

export function c1Entry(code, c1) {
  return (CODES[code]?.c1 || []).find((x) => x.k === c1) || null;
}

export function codeLabel(f) {
  const def = CODES[f.code];
  if (!def) return f.code;
  let s = def.name;
  const e1 = c1Entry(f.code, f.c1);
  if (e1 && e1.k !== 'Y') s += ' – ' + e1.t;
  const e2 = c2Options(f.code, f.c1).find((x) => x.k === f.c2);
  if (e2) s += ', ' + e2.t;
  return s;
}

export function fullCode(f) {
  return (f.code || '') + (f.c1 || '') + (f.c2 || '');
}
