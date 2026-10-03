// Herstellerangaben der App (erscheinen in Einstellungen, Berichten und Exportdateien).

export const APP_NAME = 'Schachtblick';
export const APP_VERSION = '0.6.3';
export const VENDOR = 'MMSE Software Engineering';
export const VENDOR_URL = 'https://www.mmse-software.com';
export const VENDOR_WEB = 'www.mmse-software.com';
export const VENDOR_TAGLINE = 'Software, die zu Ihrem Betrieb passt';
export const CREATED_WITH = `Erstellt mit ${APP_NAME} · ${VENDOR} · ${VENDOR_WEB}`;
// Rechtliches: Impressum der Website, Datenschutzerklärung der Website (die App-spezifischen
// Datenschutzhinweise stehen in der App unter #/datenschutz, Text in views/rechtliches.js)
export const IMPRESSUM_URL = 'https://www.mmse-software.com/impressum.html';
export const DATENSCHUTZ_WEB_URL = 'https://www.mmse-software.com/datenschutz.html';
// Verantwortlicher (wie im Impressum der Website)
export const VENDOR_INHABER = 'Manuel Moldan';
export const VENDOR_ANSCHRIFT = 'Am Wingert 18, 63579 Freigericht';
// Kontakt für App, Datenschutz, AVV und Pro-Anfragen (Absender der E-Mails: noreply@… in api/config.php)
export const VENDOR_EMAIL = 'info@schachtblick.mmse-software.com';
// Öffentliche Adresse der App (auch fest in index.html, schachtinspektion.html, robots.txt, sitemap.xml)
export const APP_URL = 'https://schachtblick.mmse-software.com/';
// Freiwillige Unterstützung (Spende ohne Gegenleistung)
export const SPENDEN_URL = 'https://www.paypal.com/paypalme/derbeaker';
// Anzeige der Preise, solange der Server keine liefert (Demo, offline); maßgeblich sind die
// Werte im Betreiber-Bereich (Plattform-Einstellungen).
export const PLATTFORM_STANDARD = {
  freigegeben: false, testTage: 30, steuer: 'ohne Umsatzsteuer (Kleinunternehmer nach § 19 UStG)',
  preise: { monat: 25, jahr: 250, inklusive: 3, zusatzMonat: 5, zusatzJahr: 50 },
};
