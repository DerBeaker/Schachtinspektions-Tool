// Vertragstexte für Schachtblick: Nutzungsbedingungen (für Unternehmer) und Auftragsverarbeitungsvertrag
// (Art. 28 DSGVO) mit Anlagen. ENTWURF – vor der Freigabe im Betreiber-Bereich rechtlich prüfen lassen.
// Bei inhaltlichen Änderungen die Version erhöhen, auch in app/api/lib/konto.php (SB_VERTRAG);
// die Firmen-Administratoren bestätigen dann die neue Fassung in der App.
// Aufbau: { titel, untertitel, abschnitte: [{ titel, absaetze: [Text | [Listenpunkte]] }] }

import { VENDOR, VENDOR_INHABER, VENDOR_ANSCHRIFT, VENDOR_EMAIL, APP_NAME } from '../brand.js';

export const VERTRAG_VERSION = { agb: '1.0', avv: '1.0' };
export const VERTRAG_STAND = 'Oktober 2026';

const ANBIETER = `${VENDOR}, Inhaber ${VENDOR_INHABER}, ${VENDOR_ANSCHRIFT}, E-Mail ${VENDOR_EMAIL}`;

export const AGB = {
  art: 'agb',
  titel: `Nutzungsbedingungen für ${APP_NAME}`,
  kurz: 'Nutzungsbedingungen',
  version: VERTRAG_VERSION.agb,
  stand: VERTRAG_STAND,
  abschnitte: [
    { titel: '§ 1 Geltungsbereich, Anbieter', absaetze: [
      `(1) Diese Nutzungsbedingungen gelten für die Nutzung der Web-App „${APP_NAME}“ (im Folgenden „App“). Anbieter ist ${ANBIETER} (im Folgenden „Anbieter“).`,
      `(2) ${APP_NAME} Pro (Firmenkonto) wird ausschließlich Unternehmern im Sinne von § 14 BGB, juristischen Personen des öffentlichen Rechts und öffentlich-rechtlichen Sondervermögen angeboten (im Folgenden „Kunde“). Mit der Registrierung bestätigt der Kunde, in Ausübung seiner gewerblichen oder selbständigen beruflichen Tätigkeit zu handeln.`,
      '(3) Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen ausdrücklich in Textform zustimmt.',
    ] },
    { titel: '§ 2 Leistungen', absaetze: [
      `(1) ${APP_NAME} Basis: Die App kann ohne Registrierung kostenlos genutzt werden. Die Daten werden dabei ausschließlich im Speicher des Browsers auf dem jeweiligen Gerät gespeichert; der Anbieter hat darauf keinen Zugriff und kann sie nicht wiederherstellen. Der Export von Austauschdateien im XML-Format (ISYBAU, DWA-M 150) ist in ${APP_NAME} Basis nicht enthalten.`,
      `(2) ${APP_NAME} Pro umfasst zusätzlich ein Firmenkonto auf dem Server des Anbieters mit Synchronisation zwischen den Geräten und Benutzern des Kunden, Benutzerverwaltung, zentral gepflegte Firmendaten sowie den Export von Austauschdateien im XML-Format. Im Einzelnen gilt die Leistungsbeschreibung in der App zum Zeitpunkt der Buchung.`,
      '(3) Der Anbieter entwickelt die App weiter. Er darf Funktionen ändern, soweit der wesentliche Leistungsumfang (Erfassung, Synchronisation, Export) erhalten bleibt und die Änderung für den Kunden zumutbar ist.',
      '(4) Die App ist ein Hilfsmittel. Die fachliche Verantwortung für Kodierung, Zustandsbewertung und Maßangaben sowie für die Prüfung der Exportdateien gegen die Anforderungen des jeweiligen Auftraggebers liegt beim Kunden. KI-Vorschläge und Foto-Tiefenschätzungen sind unverbindliche Hilfen.',
    ] },
    { titel: '§ 3 Registrierung, Vertragsschluss, Testzeitraum', absaetze: [
      '(1) Der Vertrag über das Firmenkonto kommt zustande, wenn der Kunde nach der Registrierung seine E-Mail-Adresse über den zugesandten Link bestätigt. Die registrierende Person versichert, den Kunden vertreten zu dürfen.',
      '(2) Zu Beginn steht ein kostenloser Testzeitraum zur Verfügung, dessen Dauer bei der Registrierung angezeigt wird. Er endet automatisch. Eine Zahlungspflicht entsteht nur, wenn der Kunde Schachtblick Pro ausdrücklich bucht.',
      '(3) Endet der Testzeitraum ohne Buchung, kann das Firmenkonto nur noch lesend genutzt werden (Daten ansehen und auf die Geräte laden). Nach weiteren 30 Tagen darf der Anbieter das Firmenkonto mit allen Daten löschen.',
      '(4) Der Kunde hält die Zugangsdaten geheim und ist für die Benutzer verantwortlich, die er einlädt oder anlegt.',
    ] },
    { titel: '§ 4 Preise und Zahlung', absaetze: [
      '(1) Es gelten die bei der Buchung in der App angezeigten Preise je Firmenkonto zuzüglich der gesetzlichen Umsatzsteuer, soweit diese anfällt. Enthalten ist die bei der Buchung gewählte Zahl von Benutzern.',
      '(2) Die Vergütung ist für den jeweiligen Abrechnungszeitraum (Monat oder Jahr) im Voraus zu zahlen. Der Anbieter stellt die Rechnung per E-Mail; sie ist innerhalb von 14 Tagen ohne Abzug fällig. Wird während des Testzeitraums gebucht, beginnt die Abrechnung erst nach dessen Ende.',
      '(3) Ist der Kunde mit der Zahlung mehr als 30 Tage im Verzug, darf der Anbieter den Zugang nach vorheriger Ankündigung in Textform sperren, bis die offenen Beträge bezahlt sind.',
      '(4) Preisänderungen teilt der Anbieter mindestens sechs Wochen vor ihrem Wirksamwerden in Textform mit. Der Kunde kann den Vertrag dann zum Zeitpunkt des Wirksamwerdens kündigen.',
    ] },
    { titel: '§ 5 Laufzeit und Kündigung', absaetze: [
      '(1) Bei monatlicher Abrechnung läuft der Vertrag auf unbestimmte Zeit und kann jederzeit zum Ende des laufenden Abrechnungsmonats gekündigt werden. Bei jährlicher Abrechnung verlängert er sich jeweils um ein Jahr, wenn er nicht vor Ende des laufenden Vertragsjahres gekündigt wird.',
      '(2) Die Kündigung ist in der App (Einstellungen → Abo & Verträge) oder in Textform (z. B. per E-Mail) möglich; der Anbieter bestätigt sie per E-Mail. Der Anbieter kann mit einer Frist von drei Monaten zum Ende eines Abrechnungszeitraums kündigen. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
      '(3) Bis zum Vertragsende kann der Kunde seine Daten jederzeit exportieren. Danach bleiben sie 30 Tage lesend abrufbar; auf Wunsch stellt der Anbieter sie in dieser Zeit als Datei bereit. Anschließend werden sie gelöscht, soweit keine gesetzliche Pflicht zur Aufbewahrung besteht.',
    ] },
    { titel: '§ 6 Pflichten des Kunden', absaetze: [
      '(1) Der Kunde nutzt die App nur im Rahmen der geltenden Gesetze und lädt keine rechtswidrigen Inhalte hoch. Er achtet darauf, dass Fotos möglichst keine Personen oder Kfz-Kennzeichen zeigen.',
      '(2) Technische Beschränkungen der App, etwa die des Tarifs Basis, dürfen nicht umgangen werden. Die App darf nicht so genutzt werden, dass ihr Betrieb beeinträchtigt wird (z. B. durch automatisierte Massenabfragen).',
      '(3) Der Kunde sichert Daten, die für ihn wichtig sind, zusätzlich in eigenen Systemen, insbesondere durch regelmäßigen Export der Ergebnisse.',
    ] },
    { titel: '§ 7 Verfügbarkeit', absaetze: [
      '(1) Der Anbieter bemüht sich um eine hohe Verfügbarkeit des Servers, sagt aber keine bestimmte Verfügbarkeit zu. Wartungsarbeiten führt er nach Möglichkeit außerhalb der üblichen Arbeitszeiten durch.',
      '(2) Die App speichert Daten zuerst auf dem Gerät und funktioniert auch ohne Verbindung zum Server. Änderungen werden übertragen, sobald der Server wieder erreichbar ist.',
    ] },
    { titel: '§ 8 Daten des Kunden, Datenschutz', absaetze: [
      '(1) Alle Rechte an den Daten des Kunden (Projekte, Inspektionen, Fotos) verbleiben beim Kunden. Der Anbieter verwendet sie nur, um die vereinbarten Leistungen zu erbringen.',
      '(2) Soweit der Anbieter personenbezogene Daten im Auftrag des Kunden verarbeitet, gilt der Auftragsverarbeitungsvertrag (AVV), den die Parteien bei der Registrierung bzw. in der App abschließen.',
      '(3) Für Daten, die der Anbieter für eigene Zwecke verarbeitet (z. B. Vertragsabwicklung, Rechnungen, Schutz vor Missbrauch), gelten die Datenschutzhinweise der App.',
    ] },
    { titel: '§ 9 Nutzungsrechte', absaetze: [
      'Der Kunde erhält für die Dauer des Vertrags das einfache, nicht übertragbare Recht, die App im vereinbarten Umfang für eigene Zwecke zu nutzen. Mit der App erstellte Exportdateien und Berichte darf der Kunde ohne zeitliche Beschränkung nutzen und weitergeben.',
    ] },
    { titel: '§ 10 Haftung', absaetze: [
      '(1) Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz sowie im Umfang einer übernommenen Garantie.',
      '(2) Bei leichter Fahrlässigkeit haftet der Anbieter nur bei Verletzung einer wesentlichen Vertragspflicht, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung der Kunde regelmäßig vertrauen darf. Die Haftung ist dann auf den vertragstypischen, vorhersehbaren Schaden begrenzt.',
      '(3) Für den Verlust von Daten haftet der Anbieter nur in dem Umfang, in dem der Schaden auch bei einer regelmäßigen, dem Risiko angemessenen Datensicherung durch den Kunden (§ 6 Abs. 3) eingetreten wäre.',
      `(4) Bei unentgeltlicher Nutzung (${APP_NAME} Basis, Testzeitraum) haftet der Anbieter nur für Vorsatz und grobe Fahrlässigkeit sowie in den Fällen des Absatzes 1.`,
      '(5) Die verschuldensunabhängige Haftung für Mängel, die bereits bei Vertragsschluss vorhanden waren (§ 536a Abs. 1 Alt. 1 BGB), ist ausgeschlossen.',
    ] },
    { titel: '§ 11 Änderung dieser Bedingungen', absaetze: [
      'Der Anbieter kann diese Bedingungen mit Wirkung für die Zukunft ändern, wenn dafür ein sachlicher Grund besteht (z. B. neue Funktionen, geänderte Rechtslage). Er teilt Änderungen mindestens sechs Wochen vor ihrem Inkrafttreten in Textform oder in der App mit. Widerspricht der Kunde nicht bis zum Inkrafttreten, gelten die Änderungen als angenommen; darauf weist der Anbieter in der Mitteilung besonders hin. Widerspricht der Kunde, können beide Parteien den Vertrag zum Inkrafttreten der Änderung kündigen.',
    ] },
    { titel: '§ 12 Schlussbestimmungen', absaetze: [
      '(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.',
      '(2) Ist der Kunde Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand der Sitz des Anbieters.',
      '(3) Sollte eine Bestimmung unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.',
    ] },
  ],
};

export const AVV = {
  art: 'avv',
  titel: 'Vertrag über die Verarbeitung personenbezogener Daten im Auftrag (Art. 28 DSGVO)',
  kurz: 'Auftragsverarbeitungsvertrag (AVV)',
  version: VERTRAG_VERSION.avv,
  stand: VERTRAG_STAND,
  parteien: {
    auftraggeber: 'die im Firmenkonto angegebene Firma (Verantwortlicher, im Folgenden „Auftraggeber“)',
    auftragnehmer: `${ANBIETER} (Auftragsverarbeiter, im Folgenden „Auftragnehmer“)`,
  },
  abschnitte: [
    { titel: '§ 1 Gegenstand und Dauer', absaetze: [
      `(1) Der Auftragnehmer stellt dem Auftraggeber die Web-App ${APP_NAME} Pro bereit (Firmenkonto mit Synchronisation über den Server des Auftragnehmers). Dabei verarbeitet er personenbezogene Daten im Auftrag des Auftraggebers. Gegenstand, Art und Zweck der Verarbeitung, die Art der Daten und die Kategorien betroffener Personen ergeben sich aus Anlage 1.`,
      '(2) Der Vertrag gilt, solange der Auftragnehmer personenbezogene Daten für den Auftraggeber verarbeitet, also für die Laufzeit des Nutzungsvertrags einschließlich des Testzeitraums und bis zur Löschung oder Rückgabe der Daten.',
      '(3) Die Verarbeitung findet ausschließlich in Mitgliedstaaten der Europäischen Union oder des Europäischen Wirtschaftsraums statt. Eine Verlagerung in ein Drittland bedarf der vorherigen Zustimmung des Auftraggebers und ist nur zulässig, wenn die Voraussetzungen der Art. 44 ff. DSGVO erfüllt sind.',
    ] },
    { titel: '§ 2 Weisungen', absaetze: [
      '(1) Der Auftragnehmer verarbeitet die Daten nur auf dokumentierte Weisung des Auftraggebers, es sei denn, er ist nach dem Recht der Union oder eines Mitgliedstaats zur Verarbeitung verpflichtet. In diesem Fall teilt er dem Auftraggeber diese rechtlichen Anforderungen vor der Verarbeitung mit, sofern das betreffende Recht dies nicht verbietet.',
      '(2) Weisungen sind dieser Vertrag, der Nutzungsvertrag und die Nutzung der Funktionen der App durch den Auftraggeber und seine Benutzer. Weitere Weisungen erteilt der Auftraggeber in Textform.',
      '(3) Der Auftragnehmer informiert den Auftraggeber unverzüglich, wenn eine Weisung nach seiner Auffassung gegen Datenschutzvorschriften verstößt.',
    ] },
    { titel: '§ 3 Vertraulichkeit', absaetze: [
      'Der Auftragnehmer setzt bei der Verarbeitung nur Personen ein, die zur Vertraulichkeit verpflichtet wurden oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen. Er greift auf Inhaltsdaten des Auftraggebers nur zu, soweit dies für Betrieb, Fehlerbehebung oder auf Wunsch des Auftraggebers (z. B. Export) erforderlich ist.',
    ] },
    { titel: '§ 4 Sicherheit der Verarbeitung', absaetze: [
      'Der Auftragnehmer trifft die technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO, die in Anlage 2 beschrieben sind. Er darf sie an den Stand der Technik anpassen, sofern das vereinbarte Schutzniveau nicht unterschritten wird; wesentliche Änderungen dokumentiert er.',
    ] },
    { titel: '§ 5 Unterauftragsverarbeiter', absaetze: [
      '(1) Der Auftraggeber erteilt die allgemeine Genehmigung, Unterauftragsverarbeiter einzusetzen. Die in Anlage 3 genannten Unterauftragsverarbeiter gelten als genehmigt.',
      '(2) Der Auftragnehmer informiert den Auftraggeber mindestens vier Wochen im Voraus in Textform über jede beabsichtigte Hinzuziehung oder Ersetzung eines Unterauftragsverarbeiters. Der Auftraggeber kann der Änderung aus wichtigem datenschutzrechtlichem Grund widersprechen. Kommt keine Einigung zustande, kann der Auftraggeber den Nutzungsvertrag zum Zeitpunkt der Änderung kündigen.',
      '(3) Der Auftragnehmer erlegt jedem Unterauftragsverarbeiter vertraglich die Datenschutzpflichten dieses Vertrags auf (Art. 28 Abs. 4 DSGVO).',
    ] },
    { titel: '§ 6 Unterstützung des Auftraggebers', absaetze: [
      '(1) Der Auftragnehmer unterstützt den Auftraggeber mit geeigneten technischen und organisatorischen Maßnahmen dabei, Anträge betroffener Personen zu beantworten (Art. 12 bis 23 DSGVO). Die App bietet dafür Funktionen zum Berichtigen, Löschen und Exportieren. Wendet sich eine betroffene Person direkt an den Auftragnehmer, leitet er die Anfrage unverzüglich an den Auftraggeber weiter.',
      '(2) Er unterstützt den Auftraggeber unter Berücksichtigung der Art der Verarbeitung und der ihm verfügbaren Informationen bei der Einhaltung der Pflichten aus Art. 32 bis 36 DSGVO (Sicherheit, Meldung von Datenschutzverletzungen, Datenschutz-Folgenabschätzung, vorherige Konsultation).',
      '(3) Verletzungen des Schutzes personenbezogener Daten meldet der Auftragnehmer dem Auftraggeber unverzüglich, möglichst innerhalb von 48 Stunden nach Bekanntwerden, mit den Angaben nach Art. 33 Abs. 3 DSGVO, soweit sie vorliegen.',
    ] },
    { titel: '§ 7 Löschung und Rückgabe', absaetze: [
      '(1) Nach dem Ende des Nutzungsvertrags kann der Auftraggeber seine Daten 30 Tage lang abrufen; auf Wunsch stellt der Auftragnehmer sie als Datei (Datensätze und Fotos) bereit. Danach löscht der Auftragnehmer alle personenbezogenen Daten des Auftraggebers, sofern nicht nach dem Recht der Union oder eines Mitgliedstaats eine Pflicht zur Speicherung besteht.',
      '(2) Kopien in Datensicherungen werden im regulären Sicherungszyklus überschrieben, spätestens nach 90 Tagen.',
      '(3) Daten auf den Geräten der Benutzer (Speicher des Browsers) liegen im Verantwortungsbereich des Auftraggebers.',
    ] },
    { titel: '§ 8 Nachweise und Kontrollen', absaetze: [
      '(1) Der Auftragnehmer stellt dem Auftraggeber alle Informationen zur Verfügung, die zum Nachweis der Einhaltung der Pflichten aus Art. 28 DSGVO erforderlich sind.',
      '(2) Er ermöglicht Überprüfungen einschließlich Inspektionen durch den Auftraggeber oder einen von diesem beauftragten, zur Verschwiegenheit verpflichteten Prüfer und trägt dazu bei. Inspektionen sind mit angemessener Frist anzukündigen und während der üblichen Geschäftszeiten durchzuführen. Für die Einrichtungen der Unterauftragsverarbeiter können Nachweise wie Zertifikate oder Prüfberichte vorgelegt werden.',
    ] },
    { titel: '§ 9 Haftung und Schlussbestimmungen', absaetze: [
      '(1) Für die Haftung gegenüber betroffenen Personen gilt Art. 82 DSGVO. Im Verhältnis der Parteien gelten im Übrigen die Haftungsregeln des Nutzungsvertrags.',
      '(2) Bei Widersprüchen geht dieser Vertrag in Fragen des Datenschutzes dem Nutzungsvertrag vor.',
      '(3) Der Vertrag wird elektronisch geschlossen. Name und Funktion der annehmenden Person, Zeitpunkt und Fassung werden gespeichert und per E-Mail bestätigt. Änderungen bedürfen der Textform.',
      '(4) Es gilt deutsches Recht. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.',
    ] },
    { titel: 'Anlage 1 – Gegenstand der Verarbeitung', absaetze: [
      `Zweck: Bereitstellung der Web-App ${APP_NAME} Pro – Speicherung und Synchronisation von Inspektionsdaten zwischen den Geräten und Benutzern des Auftraggebers, Benutzerverwaltung, Versand von Einladungen und Passwort-Links. Berichte und Exportdateien entstehen auf den Geräten des Auftraggebers.`,
      'Art der Verarbeitung: Erheben über die App, Speichern, Übermitteln an die Geräte des Auftraggebers, Bereitstellen, Löschen.',
      'Art der Daten:',
      [
        'Benutzerdaten: Name, E-Mail-Adresse, Benutzername, Rolle, Passwort (nur als Hash), Zeitpunkt der letzten Anmeldung, Sitzungsschlüssel (nur als Hash), fehlgeschlagene Anmeldeversuche mit IP-Adresse (höchstens 24 Stunden).',
        'Inhaltsdaten: Projekte und Auftragsangaben (ggf. mit Namen von Ansprechpartnern), Schächte mit Straße und Koordinaten, Befunde, Bauteile, Fotos (können zufällig Personen, Kfz-Kennzeichen oder Grundstücke zeigen), Name des Inspekteurs, ändernder Benutzer und Änderungszeitpunkt je Datensatz.',
        'Firmendaten für Berichte: Firmenname, Anschrift, Kontaktdaten, Logo.',
      ],
      'Kategorien betroffener Personen: Beschäftigte und Beauftragte des Auftraggebers (Benutzer, Inspekteure), Ansprechpartner der Auftraggeber des Auftraggebers, ggf. Eigentümer, Anwohner und Passanten, soweit sie sich aus Lageangaben oder Fotos ergeben.',
      `Nicht erfasst: Daten, die nur im Tarif ${APP_NAME} Basis auf einem Gerät gespeichert werden (sie erreichen den Auftragnehmer nicht), sowie Vertrags- und Abrechnungsdaten, die der Auftragnehmer als eigener Verantwortlicher verarbeitet.`,
    ] },
    { titel: 'Anlage 2 – Technische und organisatorische Maßnahmen (Art. 32 DSGVO)', absaetze: [
      'Vertraulichkeit:',
      [
        'Rechenzentrum: Betrieb auf Servern der IONOS SE in Rechenzentren mit Zutrittskontrolle, Videoüberwachung und Sicherheitspersonal; maßgeblich sind die technischen und organisatorischen Maßnahmen und Zertifizierungen der IONOS SE (u. a. ISO/IEC 27001).',
        'Zugangskontrolle: persönliche Benutzerkonten; Passwörter mit mindestens 8 Zeichen, gespeichert nur als Hash (bcrypt); Sitzungen über zufällige 256-Bit-Schlüssel, die auf dem Server nur als Hash liegen und nach 30 Tagen ohne Nutzung ablaufen; Begrenzung fehlgeschlagener Anmeldeversuche.',
        'Zugriffskontrolle und Trennung: Mandantentrennung – jede Datenbankabfrage ist auf die Firma des angemeldeten Benutzers beschränkt; Fotos in getrennten Verzeichnissen je Firma; Rollen Administrator und Inspekteur; Konfiguration, Programmbibliotheken und Fotoverzeichnisse sind gegen direkten Abruf aus dem Internet gesperrt; Verwaltungszugang beim Auftragnehmer nur für den Inhaber.',
        'Verschlüsselung: Übertragung zwischen App und Server ausschließlich verschlüsselt (HTTPS/TLS); E-Mail-Versand über SMTP mit TLS.',
      ],
      'Integrität:',
      [
        'Weitergabekontrolle: nur verschlüsselte Übertragung; keine Weitergabe an Dritte außer an Unterauftragsverarbeiter nach Anlage 3.',
        'Eingabekontrolle: Zu jedem Datensatz werden Änderungszeitpunkt und ändernder Benutzer gespeichert.',
      ],
      'Verfügbarkeit und Belastbarkeit:',
      [
        'Offline-Fähigkeit: Die Daten liegen zusätzlich auf den Geräten der Benutzer; Änderungen werden nachträglich übertragen.',
        'Datensicherung von Datenbank und Fotos mindestens wöchentlich; Aufbewahrung der Sicherungen höchstens 90 Tage; Wiederherstellung wird regelmäßig geprüft.',
        'Software- und Sicherheitsupdates der App durch den Auftragnehmer, des Servers und der PHP-Umgebung durch den Hoster.',
      ],
      'Verfahren zur regelmäßigen Überprüfung:',
      [
        'Überprüfung dieser Maßnahmen mindestens jährlich und bei wesentlichen Änderungen.',
        'Datenschutzfreundliche Voreinstellungen: keine Cookies, kein Tracking; Datensparsamkeit (z. B. Löschung fehlgeschlagener Anmeldeversuche nach 24 Stunden).',
        'Auftragskontrolle: Unterauftragsverarbeiter nur mit Vertrag nach Art. 28 DSGVO.',
      ],
    ] },
    { titel: 'Anlage 3 – Unterauftragsverarbeiter', absaetze: [
      [
        'IONOS SE, Elgendorfer Str. 57, 56410 Montabaur – Webhosting (Server, Datenbank, Speicherung der Fotos) und Versand von E-Mails; Verarbeitung in Rechenzentren in Deutschland.',
      ],
      `Die KI-Bildanalyse der App (Übermittlung einzelner Fotos an einen KI-Dienst) ist auf der Plattform nicht eingeschaltet. Vor einer Einschaltung informiert der Auftragnehmer den Auftraggeber nach § 5 Abs. 2.`,
    ] },
  ],
};

export const VERTRAEGE = { agb: AGB, avv: AVV };

/** Ganzer Vertrag als einfacher Text (für Tests, Zwischenablage). */
export function vertragAlsText(v) {
  const zeilen = [v.titel, `Fassung ${v.version} · Stand ${v.stand}`, ''];
  if (v.parteien) zeilen.push(`zwischen ${v.parteien.auftraggeber}`, `und ${v.parteien.auftragnehmer}`, '');
  for (const a of v.abschnitte) {
    zeilen.push(a.titel);
    for (const p of a.absaetze) {
      if (Array.isArray(p)) p.forEach((x) => zeilen.push(`– ${x}`));
      else zeilen.push(p);
    }
    zeilen.push('');
  }
  return zeilen.join('\n');
}
