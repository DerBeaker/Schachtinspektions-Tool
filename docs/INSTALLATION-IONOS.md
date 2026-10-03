# Schachtblick auf IONOS installieren (Testbetrieb)

Diese Anleitung bringt Schachtblick mit Team-Server auf einen IONOS-Webspace – zum Beispiel unter
`https://schachtblick.mmse-software.com`. Zeitbedarf: etwa 30 Minuten. Die Menüpunkte im IONOS-Kundenbereich
heißen sinngemäß wie unten angegeben; IONOS ändert die Oberfläche gelegentlich.

## Was Sie brauchen

- IONOS-Webhosting mit **PHP ≥ 8.1** und **MySQL/MariaDB** (in allen Webhosting-Tarifen enthalten)
- eine Domain oder Subdomain mit **SSL-Zertifikat** (ohne HTTPS funktionieren Kamera und GPS nicht)
- ein SFTP-Programm (z. B. FileZilla) oder den Webspace-Explorer von IONOS
- das Upload-Paket `schachtblick-<version>.zip` (enthält den Ordner `schachtblick/` und diese Anleitung)

## 1. Subdomain und SSL

1. IONOS-Kundenbereich → **Domains & SSL** → Ihre Domain → **Subdomain anlegen**, z. B. `schachtblick`.
2. Als Ziel **Webspace** wählen und ein neues Verzeichnis angeben: `/schachtblick`.
3. Für die Subdomain ein **SSL-Zertifikat** aktivieren bzw. zuweisen und „HTTPS“ als Standard nutzen.

## 2. PHP-Version

**Hosting** → **PHP-Version** (bzw. „PHP-Einstellungen“): für das Verzeichnis bzw. die Subdomain
**PHP 8.2 oder 8.3** einstellen.

## 3. Datenbank anlegen

1. **Hosting** → **Datenbanken** → **Datenbank anlegen** (MySQL/MariaDB).
2. Beschreibung z. B. „Schachtblick“, ein sicheres Passwort vergeben.
3. Notieren: **Hostname** (z. B. `db5001234567.hosting-data.io`), **Datenbankname** (`dbs1234567`),
   **Benutzername** (`dbu1234567`) und Passwort.

## 4. E-Mail-Postfach für den Versand (Einladungen, „Passwort vergessen“)

1. IONOS-Kundenbereich → **E-Mail** → ein Postfach anlegen, z. B. `noreply@schachtblick.mmse-software.com`,
   und das Passwort notieren.
2. In `config.php` (Schritt 6) den Block **`smtp`** eintragen – das ist bei IONOS der zuverlässige Weg:

   ```php
   'smtp' => [
       'host' => 'smtp.ionos.de',
       'port' => 465,
       'user' => 'noreply@schachtblick.mmse-software.com',
       'pass' => 'POSTFACH-PASSWORT',
   ],
   'mail_from' => 'noreply@schachtblick.mmse-software.com',   // gleiche Adresse wie das Postfach
   ```

3. Nach der Einrichtung im **Betreiber-Bereich → „E-Mail-Versand testen“** prüfen. Klappt es nicht, steht
   dort der Grund (z. B. falsches Postfach-Passwort).

Ohne `smtp` versucht der Server PHP `mail()`; das lehnt IONOS ab, wenn der Absender kein Postfach der
eigenen Domain ist. Kommt keine Mail an, zeigt die App den Einladungslink trotzdem an – er kann dann
per E-Mail oder Messenger weitergegeben werden.

## 5. Dateien hochladen

1. ZIP auf dem PC entpacken.
2. Per SFTP (Zugangsdaten unter **Hosting** → **SFTP & SSH**) den **Inhalt** des Ordners `schachtblick/`
   in das Webspace-Verzeichnis `/schachtblick` hochladen. Danach liegen dort u. a. `index.html`,
   `sw.js`, die Ordner `js/`, `css/`, `vendor/` und `api/`.
3. Wichtig: auch die versteckten Dateien `.htaccess` hochladen (in FileZilla: Server → „Anzeigen
   versteckter Dateien erzwingen“). Sie schützen `api/lib`, `api/data` und die Konfiguration.

## 6. Konfiguration

Im Ordner `api/` die Datei `config.sample.php` als **`config.php`** kopieren und anpassen:

```php
'db_dsn'  => 'mysql:host=db5001234567.hosting-data.io;dbname=dbs1234567;charset=utf8mb4',
'db_user' => 'dbu1234567',
'db_pass' => 'IHR-DATENBANK-PASSWORT',
'photo_dir' => __DIR__ . '/data/photos',          // durch .htaccess geschützt
'app_url' => 'https://schachtblick.mmse-software.com/',      // Adresse für Links in E-Mails
'mail_from' => 'noreply@schachtblick.mmse-software.com',
'smtp' => ['host' => 'smtp.ionos.de', 'port' => 465, 'user' => 'noreply@schachtblick.mmse-software.com', 'pass' => 'POSTFACH-PASSWORT'],
```

`config.php` niemals weitergeben – sie enthält das Datenbank-Passwort. Der KI-Assistent bleibt
ausgeschaltet, solange `anthropic_api_key` leer ist.

## 7. Einrichten

1. `https://schachtblick.mmse-software.com/api/setup.php` öffnen.
2. **Firma:** `MMSE Software Engineering`, Ihr Name, **E-Mail-Adresse** und ein Passwort (mind. 10 Zeichen).
3. „Einrichten“ – die Tabellen werden angelegt, Sie sind **Betreiber** der Installation.
   Die Seite sperrt sich danach selbst.

## 8. Erster Test

1. `https://schachtblick.mmse-software.com` öffnen → **Einstellungen** → Firmenkonto: mit E-Mail und Passwort
   anmelden. Das Feld „Server-Adresse“ (unter „Erweitert“) bleibt leer – die App findet den Server
   automatisch unter `…/api/`. Die Datenbank-Zugangsdaten stehen nur in `api/config.php`.
2. **Betreiber-Bereich** → **Firma anlegen**: z. B. eine Testfirma mit „Test 30 Tage“, max. 3 Benutzer
   und der E-Mail-Adresse ihres Administrators. Die Einladung geht per Mail raus und wird angezeigt.
3. Einladungslink auf dem Handy öffnen → Name und Passwort festlegen → angemeldet.
4. Als Firmen-Admin unter **Einstellungen** Anschrift, Kontakt und **Logo** hinterlegen – sie gelten für
   alle Geräte der Firma (Kopf der PDF-Berichte).
5. Auf dem Handy im Browsermenü **„Zum Startbildschirm hinzufügen“** – die App startet dann wie eine
   installierte App und funktioniert auch offline.
6. Stammdaten importieren, einen Schacht aufnehmen, abschließen und auf dem PC (im selben Firmenkonto
   angemeldet) prüfen, ob alles ankommt; Export und PDF-Protokoll testen.

## Bei Google gefunden werden und den Link teilen

Die App bringt alles mit, was Suchmaschinen und Messenger brauchen: Titel und Beschreibung, eine Info-Seite
mit echtem Text (`/schachtinspektion.html`: „Schachtinspektion per App – kostenlos“), ein Vorschaubild für
WhatsApp & Co. (`og-bild.jpg`), `robots.txt` und `sitemap.xml`. Die Adresse
`https://schachtblick.mmse-software.com` steht fest in `index.html`, `schachtinspektion.html`, `robots.txt`,
`sitemap.xml` und `js/brand.js` (`APP_URL`) – bei einer anderen Adresse dort ändern.

Damit Google die Seite findet (dauert erfahrungsgemäß einige Tage bis Wochen):
1. [Google Search Console](https://search.google.com/search-console) → Property hinzufügen → **Domain**
   `schachtblick.mmse-software.com`. Google zeigt einen TXT-Eintrag; diesen im IONOS-Kundenbereich unter
   **Domains & SSL → mmse-software.com → DNS** als TXT-Eintrag für `schachtblick` anlegen, dann bestätigen.
2. In der Search Console unter **Sitemaps** `https://schachtblick.mmse-software.com/sitemap.xml` einreichen
   und unter **URL-Prüfung** die Startseite und die Info-Seite „Indexierung beantragen“.
3. Am meisten hilft ein Link von Ihrer Website www.mmse-software.com (Produktseite „Schachtblick“) und
   Erwähnungen in Fachkreisen (LinkedIn, Branchenforen, Kunden).

**Per WhatsApp teilen:** einfach `https://schachtblick.mmse-software.com` schicken – WhatsApp zeigt Bild, Titel
und Beschreibung. In der App gibt es dafür „Weiterempfehlen“ (Startseite unten, Einstellungen → Über).
WhatsApp merkt sich die Vorschau eine Weile; wer den Link vor dem Hochladen der neuen Version schon geteilt
hat, sieht eventuell noch die alte Vorschau. Die Bilder neu erzeugen: `node tools/make-bilder.mjs`.

## Updates einspielen

Neue Version entpacken und den Inhalt von `schachtblick/` erneut hochladen. **Nicht überschreiben:**
`api/config.php` und `api/data/` (Fotos). Datenbank-Änderungen übernimmt der Server automatisch beim
ersten Aufruf. Geräte laden die neue Version beim nächsten Öffnen (ggf. App einmal neu laden).

## Datensicherung

- Datenbank: **Hosting** → **Datenbanken** → Sicherung/Export (bzw. phpMyAdmin → Exportieren)
- Fotos: Ordner `api/data/photos` per SFTP sichern
- Je Firma: Betreiber-Bereich → **Daten exportieren** (JSON mit allen Projekten und Inspektionen)

## Fehlersuche

| Problem | Lösung |
|---|---|
| Fehlermeldung 500 / weiße Seite bei `api/` | PHP-Version prüfen (≥ 8.1), `config.php` vorhanden und Zugangsdaten richtig? |
| „Server noch nicht eingerichtet (config.php fehlt)“ | `config.php` liegt nicht im Ordner `api/` |
| „Datenbankverbindung fehlgeschlagen“ | Hostname, Datenbankname, Benutzer und Passwort aus Schritt 3 prüfen |
| Kamera/GPS funktionieren nicht | Seite über **https://** aufrufen (SSL-Zertifikat aktiv?) |
| „Der Server konnte keine E-Mail senden“ | SMTP in `config.php` eintragen (Schritt 4); im Betreiber-Bereich „E-Mail-Versand testen“ zeigt den Grund. Bis dahin den angezeigten Link weitergeben |
| Mail verschickt, kommt aber nicht an | Spam-Ordner prüfen; Absender (`mail_from`) = SMTP-Postfach |
| App bleibt bei „Schachtblick wird geladen …“ | Nach einem Update lagen noch alte Dateien im Browser. Nach wenigen Sekunden erscheint „Neu laden“ – antippen. Ab Version 0.5.5 prüft der Browser die Programmdateien bei jedem Start (`.htaccess` mit hochladen!) |
| Kartenhintergrund fehlt | Internetverbindung nötig (basemap.de / OpenStreetMap); Schächte werden trotzdem angezeigt |
| `api/lib/` im Browser erreichbar | `.htaccess`-Dateien wurden nicht hochgeladen (versteckte Dateien anzeigen) |

## Kunden: Basis, Pro und Verträge

**So funktioniert es für die Kunden**

- **Basis (kostenlos, ohne Anmeldung):** Jeder kann die App sofort nutzen. Alle Daten bleiben im Browser
  auf dem Gerät – es gibt kein gemeinsames Konto, über das andere Firmen etwas sehen könnten. Gesperrt ist
  nur der XML-Export (ISYBAU, DWA-M 150); PDF-Protokolle und Aufmaß gehen auch in Basis.
- **Pro (Firmenkonto):** Die Firma registriert sich selbst (Tarife → „30 Tage kostenlos testen“), bestätigt
  ihre E-Mail-Adresse und nimmt dabei **Nutzungsbedingungen und AVV** per Häkchen an – mit Name, Funktion
  und Zeitpunkt, wie bei IONOS. Beide Seiten bekommen eine Bestätigung per E-Mail, der AVV lässt sich als
  PDF speichern. Jede Firma ist ein eigener Mandant: Ihre Benutzer sehen nur ihre eigenen Daten.
- **Nach dem Test:** ohne Buchung nur noch lesen (Daten ansehen und laden, kein XML-Export, keine neuen
  Änderungen auf dem Server). Nach weiteren 30 Tagen zeigt der Betreiber-Bereich „löschen?“.
- **Pro buchen:** Der Firmen-Administrator bucht unter Einstellungen → **Abo & Verträge** (monatlich oder
  jährlich, Benutzerzahl, Rechnungsanschrift). Pro ist sofort freigeschaltet, die Abrechnung beginnt nach dem
  Testzeitraum. Sie bekommen eine E-Mail und sehen die Buchung im Betreiber-Bereich unter **Aufträge** –
  Rechnung stellen (z. B. mit Ihrem Buchhaltungsprogramm) und den Auftrag als „erledigt“ markieren.
  Kündigen geht dort ebenfalls (zum Ende des Abrechnungsmonats bzw. Vertragsjahres).
- Firmen, die Sie selbst angelegt haben, sehen nach dem Update einen Hinweis und nehmen AGB und AVV
  unter Abo & Verträge nachträglich an.

**Bevor Sie die Freigabe einschalten** (Betreiber-Bereich → **Plattform & Preise**):

1. Texte rechtlich prüfen lassen (Fachanwalt für IT-Recht oder ein AGB-Dienst für SaaS): Nutzungs-
   bedingungen (`#/agb`), AVV mit Anlagen (`#/avv`), Datenschutzhinweise (`#/datenschutz`). Die Texte stehen
   in `app/js/data/vertraege.js` bzw. `app/js/views/rechtliches.js`. Bei inhaltlichen Änderungen die
   Fassung erhöhen (dort **und** in `app/api/lib/konto.php`, `SB_VERTRAG`) – Kunden bestätigen dann neu.
2. Zusagen im AVV einhalten oder anpassen: **mindestens wöchentliche Sicherung** von Datenbank und Fotos,
   Sicherungen höchstens 90 Tage aufbewahren (Anlage 2); Rechenzentrum in Deutschland (IONOS-Vertrag
   prüfen, Anlage 3); Meldung von Datenschutzverletzungen innerhalb von 48 Stunden.
3. Preise prüfen. Voreingestellt ist „ohne Umsatzsteuer (Kleinunternehmer nach § 19 UStG)“; wer die Grenze
   überschreitet, stellt auf „zzgl. gesetzlicher Umsatzsteuer“ um. Auf Ihren Rechnungen muss als Kleinunternehmer
   der Hinweis auf die Steuerbefreiung nach § 19 UStG stehen.
4. Optional in `config.php`: `'betreiber_email' => 'info@…'` für Benachrichtigungen (sonst die E-Mail
   des Betreiber-Kontos).
5. Freigabe einschalten. Danach auf der Website auf `https://schachtblick.mmse-software.com/#/pro` verlinken.

Weiterhin gilt:
- **Kein Cookie-Banner nötig:** keine Cookies, kein Tracking; gespeichert wird nur, was für den Betrieb
  nötig ist (§ 25 Abs. 2 Nr. 2 TDDDG). Karten erst nach Klick (Einwilligung, widerrufbar).
- Der „Unterstützen“-Link (PayPal) ist eine freiwillige Spende ohne Gegenleistung. Hinweis: Bei einem
  Gewerbe sind Spenden Betriebseinnahmen; PayPal erwartet für geschäftliche Zahlungen ein Geschäftskonto.
- Regelmäßige Sicherung einplanen (siehe oben).

---

Schachtblick · MMSE Software Engineering · www.mmse-software.com
