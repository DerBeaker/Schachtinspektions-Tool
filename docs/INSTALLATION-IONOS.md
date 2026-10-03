# Schachtblick auf IONOS installieren (Testbetrieb)

Diese Anleitung bringt Schachtblick mit Team-Server auf einen IONOS-Webspace – zum Beispiel unter
`https://app.mmse-software.com`. Zeitbedarf: etwa 30 Minuten. Die Menüpunkte im IONOS-Kundenbereich
heißen sinngemäß wie unten angegeben; IONOS ändert die Oberfläche gelegentlich.

## Was Sie brauchen

- IONOS-Webhosting mit **PHP ≥ 8.1** und **MySQL/MariaDB** (in allen Webhosting-Tarifen enthalten)
- eine Domain oder Subdomain mit **SSL-Zertifikat** (ohne HTTPS funktionieren Kamera und GPS nicht)
- ein SFTP-Programm (z. B. FileZilla) oder den Webspace-Explorer von IONOS
- das Upload-Paket `schachtblick-<version>.zip` (enthält den Ordner `schachtblick/` und diese Anleitung)

## 1. Subdomain und SSL

1. IONOS-Kundenbereich → **Domains & SSL** → Ihre Domain → **Subdomain anlegen**, z. B. `app`.
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

1. IONOS-Kundenbereich → **E-Mail** → ein Postfach anlegen, z. B. `noreply@mmse-software.com`,
   und das Passwort notieren.
2. In `config.php` (Schritt 6) den Block **`smtp`** eintragen – das ist bei IONOS der zuverlässige Weg:

   ```php
   'smtp' => [
       'host' => 'smtp.ionos.de',
       'port' => 465,
       'user' => 'noreply@mmse-software.com',
       'pass' => 'POSTFACH-PASSWORT',
   ],
   'mail_from' => 'noreply@mmse-software.com',   // gleiche Adresse wie das Postfach
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
'app_url' => 'https://app.mmse-software.com/',      // Adresse für Links in E-Mails
'mail_from' => 'noreply@mmse-software.com',
'smtp' => ['host' => 'smtp.ionos.de', 'port' => 465, 'user' => 'noreply@mmse-software.com', 'pass' => 'POSTFACH-PASSWORT'],
```

`config.php` niemals weitergeben – sie enthält das Datenbank-Passwort. Der KI-Assistent bleibt
ausgeschaltet, solange `anthropic_api_key` leer ist.

## 7. Einrichten

1. `https://app.mmse-software.com/api/setup.php` öffnen.
2. **Firma:** `MMSE Software Engineering`, Ihr Name, **E-Mail-Adresse** und ein Passwort (mind. 10 Zeichen).
3. „Einrichten“ – die Tabellen werden angelegt, Sie sind **Betreiber** der Installation.
   Die Seite sperrt sich danach selbst.

## 8. Erster Test

1. `https://app.mmse-software.com` öffnen → **Einstellungen** → Team-Server: Adresse leer lassen,
   mit E-Mail und Passwort anmelden.
2. **Betreiber-Bereich** → **Firma anlegen**: z. B. eine Testfirma mit „Test 30 Tage“, max. 3 Benutzer
   und der E-Mail-Adresse ihres Administrators. Die Einladung geht per Mail raus und wird angezeigt.
3. Einladungslink auf dem Handy öffnen → Name und Passwort festlegen → angemeldet.
4. Als Firmen-Admin unter **Einstellungen** Anschrift, Kontakt und **Logo** hinterlegen – sie gelten für
   alle Geräte der Firma (Kopf der PDF-Berichte).
5. Auf dem Handy im Browsermenü **„Zum Startbildschirm hinzufügen“** – die App startet dann wie eine
   installierte App und funktioniert auch offline.
6. Stammdaten importieren, einen Schacht aufnehmen, abschließen und auf dem PC (im selben Firmenkonto
   angemeldet) prüfen, ob alles ankommt; Export und PDF-Protokoll testen.

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

## Vor dem Einsatz bei Kunden (Weg A: Betrieb durch MMSE)

Bereits in der App:
- **Impressum** und **Datenschutz** sind auf der Startseite, in den Einstellungen und auf den
  Einladungsseiten verlinkt (Impressum der Website, eigene Datenschutzhinweise der App unter `#/datenschutz`).
- **Kein Cookie-Banner nötig:** Die App setzt keine Cookies und nutzt kein Tracking. Gespeichert wird nur,
  was für den Betrieb nötig ist (Offline-Daten, Anmeldung) – das ist ohne Einwilligung zulässig
  (§ 25 Abs. 2 Nr. 2 TDDDG).
- **Karte mit Einwilligung:** Kartenkacheln von basemap.de/OpenStreetMap werden erst nach Klick geladen
  („Einmal laden“ / „Immer laden“), widerrufbar unter Einstellungen → Darstellung.
- Löschfunktionen: Benutzer (Firmen-Admin), ganze Firma samt Fotos (Betreiber), Fehlversuche nach 24 Stunden.

Noch zu erledigen:
- Datenschutzhinweise der App (Text in `app/js/views/rechtliches.js`) einmal **rechtlich prüfen** lassen.
- **Auftragsverarbeitungsvertrag (AVV)** mit IONOS abschließen (im Kundenbereich unter Datenschutz) und den
  Kundenfirmen einen AVV von MMSE anbieten – MMSE verarbeitet deren Inspektionsdaten in ihrem Auftrag.
- **Nutzungsbedingungen/AGB** und Preise für die Kundenfirmen festlegen; Lizenzen (Benutzerzahl, Laufzeit)
  im Betreiber-Bereich pflegen.
- Regelmäßige Sicherung einplanen (siehe oben).

---

Schachtblick · MMSE Software Engineering · www.mmse-software.com
