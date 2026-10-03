// Datenschutzhinweise der App (#/datenschutz) und Links zu Impressum/Datenschutz.
// Der Text beschreibt, was die App technisch tatsächlich tut – bei Änderungen an Speicherung,
// Übertragung oder Drittdiensten bitte hier mitpflegen. Entwurf: vor dem Einsatz rechtlich prüfen.

import { h, clear } from '../core/ui.js';
import { topbar } from '../core/shell.js';
import { sync } from '../sync.js';
import {
  APP_NAME, VENDOR, VENDOR_INHABER, VENDOR_ANSCHRIFT, VENDOR_EMAIL, IMPRESSUM_URL, DATENSCHUTZ_WEB_URL,
} from '../brand.js';

export const STAND = 'Oktober 2026';

/** Kleine Linkzeile „Impressum · Datenschutz“ für Fußzeilen. */
export function rechtsLinks() {
  return h('span', { class: 'legal-links' },
    h('a', { href: IMPRESSUM_URL, target: '_blank', rel: 'noopener' }, 'Impressum'),
    h('a', { href: '#/datenschutz' }, 'Datenschutz'));
}

const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
const liste = (...punkte) => h('ul', null, punkte.map((p) => h('li', null, p)));

export function renderDatenschutz(view) {
  const ki = !!sync.auth?.features?.ai;
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: true, title: 'Datenschutz', sub: APP_NAME }), main);
  main.append(h('article', { class: 'card card-pad rechtstext' },
    h('h1', { style: { fontSize: '1.3rem', margin: '0 0 4px' } }, `Datenschutzhinweise für die App ${APP_NAME}`),
    h('p', { class: 'muted small' }, `Stand: ${STAND}. Ergänzend gilt die `, a(DATENSCHUTZ_WEB_URL, 'Datenschutzerklärung der Website'), '.'),

    h('h2', '1. Verantwortlicher'),
    h('p', null, `${VENDOR_INHABER}, ${VENDOR}, ${VENDOR_ANSCHRIFT}, E-Mail: `, h('a', { href: `mailto:${VENDOR_EMAIL}` }, VENDOR_EMAIL), ' (siehe ', a(IMPRESSUM_URL, 'Impressum'), ').'),
    h('p', null, `${APP_NAME} Basis (ohne Anmeldung): Alle Inhalte bleiben im Browser auf Ihrem Gerät; ${VENDOR} erhält sie nicht. Beim Aufruf der App fallen lediglich die Server-Logfiles des Hosters an (Abschnitt 2).`),
    h('p', null, `${APP_NAME} Pro (Firmenkonto): Für die Daten Ihrer Firma (Benutzerkonten, Projekte, Inspektionen, Fotos) ist Ihre Firma verantwortlich; ${VENDOR} verarbeitet diese Daten in deren Auftrag auf Grundlage eines Auftragsverarbeitungsvertrags (Art. 28 DSGVO). Wenden Sie sich mit Fragen zu diesen Daten bitte zuerst an Ihre Firma. Für Registrierung, Vertragsnachweise, Abrechnung und den technischen Betrieb der Plattform (z. B. Server-Logfiles, Schutz vor Missbrauch) ist ${VENDOR} selbst verantwortlich.`),

    h('h2', '2. Welche Daten verarbeitet werden'),
    liste(
      'Benutzerkonto: Name, E-Mail-Adresse bzw. Benutzername, Rolle, Passwort (nur als nicht umkehrbarer Hash), Zeitpunkt der letzten Anmeldung. Sitzungen werden über einen zufälligen Schlüssel geführt, der auf dem Server nur als Hash gespeichert ist.',
      'Inhalte: Projekte, Schächte mit Lageangaben (Straße, Koordinaten), Befunde, Bauteile, Fotos, Name des Inspekteurs sowie wer einen Datensatz zuletzt geändert hat. Fotos können zufällig Personen oder Kfz-Kennzeichen zeigen – bitte vermeiden Sie das bei der Aufnahme.',
      'Firmendaten für Berichte: Firmenname, Anschrift, Kontakt, Logo.',
      'Einladungen und „Passwort vergessen“: E-Mail-Adresse, Name und Rolle der eingeladenen Person sowie ein Einmal-Link (Einladung 14 Tage, Passwort-Link 2 Stunden gültig).',
      'Registrierung eines Firmenkontos: Firmenname und Anschrift, Name, Funktion und E-Mail-Adresse der registrierenden Person, Passwort (nur als Hash). Bis zur Bestätigung liegen diese Angaben an einem Bestätigungslink (48 Stunden gültig).',
      'Vertragsnachweise: welche Fassung der Nutzungsbedingungen und des Auftragsverarbeitungsvertrags wann von wem (Name, Funktion, E-Mail) für die Firma angenommen wurde.',
      'Buchung und Abrechnung: Tarif, Abrechnungszeitraum, Benutzerzahl, Preis, Rechnungsanschrift, E-Mail-Adresse für Rechnungen, ggf. USt-IdNr. und Bestellnummer, Zeitpunkte von Buchung, Änderung und Kündigung sowie die Bestätigungs-E-Mails dazu.',
      'Sicherheit: fehlgeschlagene Anmeldeversuche und Anfragen nach einem Passwort-Link (Benutzername bzw. E-Mail, IP-Adresse, Zeitpunkt) zum Schutz vor Passwort-Raten; sie werden spätestens nach 24 Stunden gelöscht.',
      'Server-Logfiles des Hosters (IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Statuscode, Browser) – technisch erforderlich, sie werden nach kurzer Zeit automatisch gelöscht.'),

    h('h2', '3. Zwecke und Rechtsgrundlagen'),
    liste(
      'Bereitstellung der App, Benutzerverwaltung und Synchronisation zwischen den Geräten Ihrer Firma: Vertrag mit Ihrer Firma bzw. Auftragsverarbeitung (Art. 6 Abs. 1 lit. b, Art. 28 DSGVO).',
      'Registrierung, Vertragsschluss, Buchung und Abrechnung: Vertrag bzw. Vertragsanbahnung (Art. 6 Abs. 1 lit. b DSGVO); Aufbewahrung von Rechnungs- und Vertragsunterlagen: rechtliche Pflicht (Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 147 AO, § 257 HGB); Nachweis der Vertragsannahme: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).',
      'Sicherer und stabiler Betrieb, Schutz vor Missbrauch: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).',
      'Laden des Kartenhintergrunds: Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG), siehe Abschnitt 5.'),

    h('h2', '4. Speicherung auf Ihrem Gerät – keine Cookies'),
    h('p', null, `${APP_NAME} setzt keine Cookies und verwendet keine Analyse-, Tracking- oder Werbedienste. Damit die App auch ohne Netz funktioniert, speichert sie Ihre Daten im Speicher des Browsers auf Ihrem Gerät (IndexedDB: Projekte, Inspektionen, Fotos, Einstellungen, Anmeldeschlüssel; Cache: die Dateien der App; localStorage: die zuletzt gewählte Art der Höhenangabe). Diese Speicherung ist für den von Ihnen gewünschten Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und wird nicht zu anderen Zwecken genutzt. Sie können die Daten unter „Einstellungen → Alle lokalen Daten löschen“ oder über die Browsereinstellungen entfernen.`),
    h('p', null, 'Ihr Standort (GPS) wird nur auf dem Gerät verwendet, um Schächte in der Nähe zu finden bzw. Ihre Position auf der Karte zu zeigen. Er wird nicht an den Server übertragen. Kamera-Fotos werden auf dem Gerät gespeichert und beim Synchronisieren auf den Server Ihrer Firma übertragen. Ein Bluetooth-Laser wird direkt mit Ihrem Browser verbunden (nur nach Ihrer Auswahl im Dialog des Browsers); die Messwerte landen nur im angetippten Feld.'),

    h('h2', '5. Empfänger und Drittdienste'),
    liste(
      ['Hosting und E-Mail-Versand: IONOS SE, Elgendorfer Str. 57, 56410 Montabaur (Auftragsverarbeitung nach Art. 28 DSGVO). Einladungen und Passwort-Links werden über ein Postfach von ', VENDOR, ' bei IONOS verschickt.'],
      ['Kartenhintergrund (nur nach Ihrer Zustimmung in der Kartenansicht): Kartenkacheln von ', a('https://basemap.de', 'basemap.de'), ' (Bundesamt für Kartographie und Geodäsie) bzw. ', a('https://osmfoundation.org/wiki/Privacy_Policy', 'OpenStreetMap Foundation'), ' (Vereinigtes Königreich, Angemessenheitsbeschluss der EU-Kommission). Dabei werden Ihre IP-Adresse und der angezeigte Kartenausschnitt an den Dienst übertragen. Die Zustimmung können Sie unter „Einstellungen → Darstellung“ widerrufen.'],
      'Navigation: Tippen Sie auf „Navigation“, öffnet sich Google Maps mit den Koordinaten des Schachts. Erst ab diesem Schritt gelten die Datenschutzbestimmungen von Google.',
      ['Freiwillige Unterstützung: Der Link „Unterstützen“ öffnet eine Seite von PayPal (Europe) S.à r.l. et Cie, S.C.A., Luxemburg. Die App überträgt dabei keine Daten an PayPal; was Sie dort eingeben, verarbeitet PayPal nach seiner ', a('https://www.paypal.com/de/legalhub/privacy-full', 'Datenschutzerklärung'), '.'],
      ki
        ? 'KI-Bildanalyse (auf diesem Server eingeschaltet): Nur wenn Sie die Analyse für ein Foto auslösen, wird dieses Foto zur Auswertung an Anthropic PBC (USA) übertragen. Die Ergebnisse sind Vorschläge, die Sie prüfen. Die Funktion kann unter „Einstellungen → Darstellung“ ausgeblendet werden.'
        : 'KI-Bildanalyse: auf diesem Server nicht eingeschaltet – Fotos werden an keinen KI-Dienst übertragen.'),

    h('h2', '6. Speicherdauer'),
    h('p', null, 'Benutzerkonten bestehen, bis der Administrator Ihrer Firma sie löscht oder der Vertrag Ihrer Firma endet. Inhalte bleiben gespeichert, bis Ihre Firma sie löscht. Nach dem Ende des Vertrags bzw. des Testzeitraums bleiben die Daten der Firma 30 Tage lesbar (auf Wunsch als Datei) und werden danach gelöscht; Kopien in Datensicherungen spätestens nach 90 Tagen. Anmeldesitzungen laufen nach 30 Tagen ohne Nutzung ab. Nicht bestätigte Registrierungen werden nach Ablauf des Bestätigungslinks gelöscht.'),
    h('p', null, 'Vertragsnachweise, Bestellungen, Kündigungen und Rechnungsdaten bewahren wir auf, solange gesetzliche Aufbewahrungsfristen (in der Regel sechs bzw. zehn Jahre) oder Verjährungsfristen für mögliche Ansprüche laufen.'),

    h('h2', '7. Ihre Rechte'),
    h('p', null, 'Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie das Recht, eine Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen (Art. 7 Abs. 3 DSGVO). Außerdem können Sie sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel beim Hessischen Beauftragten für Datenschutz und Informationsfreiheit.'),
    h('p', { class: 'muted small' }, 'Diese Hinweise beschreiben die technische Funktionsweise der App. Bei Fragen: ', h('a', { href: `mailto:${VENDOR_EMAIL}` }, VENDOR_EMAIL), '.')));
}
