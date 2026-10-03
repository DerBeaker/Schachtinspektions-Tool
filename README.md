# Schachtblick – Schachtinspektion nach ISYBAU & DWA

Web-App für Inspekteure: **Schacht von oben fotografieren, Anschlüsse und Schäden kodieren, als ISYBAU- oder DWA-M-150-Datei abgeben** – auf dem Handy (Android und iPhone), ohne Installation. Am PC läuft dieselbe App im Browser (z. B. zum Nachkodieren und für den Export).

> Arbeitstitel „Schachtblick“ – Name, Farben und Logo lassen sich leicht ändern.

## Was die App heute kann

| Bereich | Funktion |
|---|---|
| **Stammdaten** | Import von ISYBAU-XML (2006, 2013, 2017, 2024) und **DWA-M 150**: Schächte, Tiefen, Deckel-/Sohlhöhen, Koordinaten, angeschlossene Haltungen/Leitungen. Fehlt die Deckelhöhe, wird sie aus Sohlhöhe + Schachttiefe berechnet. Enthält eine Datei nur Haltungen (keine Schachtobjekte), werden die Schächte aus den Haltungsenden abgeleitet |
| **Anschlüsse automatisch** | Lage am Umfang (Uhrzeit, Auslauf = 12 Uhr) wird aus der Leitungsgeometrie **berechnet**, Höhen aus den Sohlhöhen. Bei den offiziellen ISYBAU-Beispieldaten stimmt das bei 100 von 113 Schächten exakt mit der echten Inspektion überein, der Rest weicht um eine Stunde ab. |
| **Foto von oben** | Foto aufnehmen, Zifferblatt per Fingerzug auf den Schacht legen (Mittelpunkt, Radius, 12 Uhr = tiefster Auslauf), Rohröffnungen antippen → Uhrzeit wird übernommen |
| **Kodierung** | Vollständiger Kodekatalog für Schächte nach DIN EN 13508-2 / BFR Abwasser (ISYBAU, Stand 01/2025) bzw. DWA-M 149-2: abhängige Charakterisierungen, Quantifizierungen mit Einheiten, Lage am Umfang (Punkt/Bereich), Schachtbereich A–J per Schnittbild, Streckenfeststellungen, Fotos je Befund |
| **Höhenangaben von unten oder oben** | Pro Projekt (und je Inspektion) umschaltbar, wie der Auftraggeber es verlangt: **von unten** (Anfang an der Sohle = 0,00 m, Ende am Deckel = Schachttiefe, Standard) oder **von oben** (Deckel = 0,00 m). Erfasst wird wahlweise „ab OK Deckel“ oder „über Sohle“ – die App rechnet beim Export um, deshalb lässt sich die Richtung auch nachträglich ändern |
| **Laser-Entfernungsmesser** | Geräte mit Bluetooth-Tastaturmodus (HID) funktionieren auf Android und iPhone: Feld antippen, messen – „2,345 m“ oder „2345 mm“ wird umgerechnet, Enter springt ins nächste Feld |
| **Plausibilitätsprüfung** | Regeln aus dem Kodierhandbuch (z. B. DAB B erst ab 0,5 mm, „Z“ braucht eine Anmerkung, DAO/DAP nur mit Primärschaden, Pflichtfelder) – live beim Erfassen |
| **Export** | **ISYBAU-XML 2006, 2013, 2017 oder 2024** (Zustandsdaten, jeweils gegen das **offizielle XSD-Schema geprüft**) oder **DWA-M 150 Typ B** (wahlweise mit ISYBAU-Schlüsseln und Dezimalpunkt wie gängige Kanalsoftware oder wie die DWA-Beispieldatei) – Kodierung nach BFR Abwasser oder DWA-M 149-2, Format pro Projekt wählbar. ZIP mit Fotos nach Namenskonvention (`S1005-001.jpg`) |
| **Protokoll** | Druckbares Schachtprotokoll (Browser → „Als PDF speichern“) |
| **Offline** | Läuft ohne Netz weiter (PWA). Alle Daten liegen zuerst auf dem Gerät |
| **Navigation** | „Schächte in der Nähe“ per GPS und Navigation zum Schacht (UTM- und Gauß-Krüger-Koordinaten werden umgerechnet) |
| **Team-Server (optional)** | PHP + MySQL auf dem eigenen Webspace: Anmeldung, Synchronisation Handy ↔ PC, Fotos, Benutzerverwaltung, mehrere Firmen (mandantenfähig) |
| **KI-Assistent (optional)** | Fotoanalyse mit Claude: schlägt Anschlüsse und sichtbare Schäden als Kodes vor – der Inspekteur bestätigt oder verwirft |
| **Tiefe aus dem Foto (experimentell)** | Schätzung über zwei Kreise bekannter Größe (Schachthals oben, Schacht-DN unten) – nur zur Plausibilitätskontrolle |

Mehr zum Konzept, zu Grenzen (Tiefenmessung, KI) und zur Roadmap: [docs/KONZEPT.md](docs/KONZEPT.md).

## Ausprobieren (lokal, 1 Minute)

Voraussetzung: PHP ≥ 8.1 (oder ein beliebiger statischer Webserver).

```bash
php -S 0.0.0.0:8080 -t app
# Browser: http://localhost:8080  →  „Demo ansehen“
```

Auf dem Handy im gleichen WLAN `http://<IP-des-PCs>:8080` öffnen. **Kamera, GPS und Offline-Modus brauchen HTTPS** – auf dem IONOS-Webspace mit SSL-Zertifikat ist das automatisch erfüllt.

## Installation auf dem IONOS-Webspace

### Variante A – nur die App (ohne Server, ohne Login)
1. Den Inhalt des Ordners `app/` per SFTP/FTP in ein Verzeichnis des Webspace hochladen, z. B. `/schacht/`.
2. Im IONOS-Kundenbereich ein SSL-Zertifikat für die Domain aktivieren.
3. `https://deine-domain.de/schacht/` auf dem Handy öffnen → im Browsermenü **„Zum Startbildschirm hinzufügen“**. Fertig – kein App-Store nötig.

Jedes Gerät speichert dann seine eigenen Daten; Austausch über ISYBAU-Export.

### Variante B – mit Team-Server (Sync Handy ↔ PC, mehrere Inspekteure)
1. Wie Variante A hochladen (der Ordner `api/` gehört dazu).
2. Im IONOS-Kundenbereich unter *Hosting → Datenbanken* eine **MySQL/MariaDB-Datenbank** anlegen.
3. `api/config.sample.php` als `api/config.php` kopieren und die Datenbank-Zugangsdaten eintragen.
4. `https://deine-domain.de/schacht/api/setup.php` aufrufen → Firma und ersten Administrator anlegen (die Seite sperrt sich danach selbst).
5. In der App: *Einstellungen → Team-Server* → anmelden. Weitere Benutzer legt der Administrator dort unter „Benutzer verwalten“ an.

Fotos liegen in `api/data/photos` (per `.htaccess` gesperrt). Besser: in `config.php` einen Pfad **außerhalb** des Webordners eintragen (`photo_dir`).

### Optional: KI-Assistent
1. API-Schlüssel bei Anthropic anlegen (console.anthropic.com) und in `config.php` bei `anthropic_api_key` eintragen.
2. Im Ordner `api/` einmal `composer install --no-dev` ausführen (IONOS per SSH; alternativ lokal ausführen und den Ordner `api/vendor/` hochladen – ca. 70 MB).
3. In der App erscheint im Foto-Reiter der Knopf **„KI-Analyse“**.

Hinweis Datenschutz: Bei aktivierter KI wird das Schachtfoto zur Analyse an Anthropic übertragen. Ohne API-Schlüssel verlässt kein Foto den eigenen Server.

## Bedienung in Kürze

1. **Projekt** anlegen bzw. Stammdaten (ISYBAU oder DWA-M 150) importieren → Schachtliste (Suche, Filter, „In der Nähe“). Unter „Projekt & Auftrag“ Kodiersystem (BFR/DWA) und Abgabeformat festlegen.
2. **Schacht öffnen → Foto**: senkrecht von oben fotografieren, „Uhr ausrichten“, Anschlüsse antippen.
3. **Anschlüsse** prüfen (DN, Höhe ab Deckel oder über Sohle). DCA/DCG entstehen automatisch.
4. **Befunde**: Schnellauswahl oder Suche („DAB“, „Riss“) → Charakterisierungen antippen → Lage, Bereich, Foto.
5. **Abschließen** → später im Projekt **Export** (ISYBAU 2006–2024 oder DWA-M 150 als ZIP) oder **Protokoll** drucken.

## Projektstruktur

```
app/                    ← kommt auf den Webspace
  index.html, sw.js     Web-App (PWA, ohne Build-Schritt)
  js/data/              Kodekatalog (BFR Abwasser A-2.3.8) und Referenzlisten
  js/isybau/            XML-Parser, Stammdaten-Import, ISYBAU-Export (2006–2024), DWA-M 150, Plausibilität
  js/views/, components Oberfläche (Foto mit Uhr, Schachtschnitt, Editoren)
  api/                  optionaler PHP-Server (MySQL oder SQLite)
docs/KONZEPT.md         Konzept, Grenzen, Roadmap
tests/                  automatische Tests (Node + PHP)
tools/                  Demo-Daten, Icons, Browser-Tests
```

## Entwicklung & Tests

```bash
npm run xsd     # offizielle ISYBAU-XSD-Schemas 2006/2013/2017/2024 laden (für die Exportprüfung)
npm test        # Import/Export (alle Versionen + DWA-M 150)/Plausibilität/ZIP/Koordinaten + PHP-Server inkl. KI-Mock
npm run serve   # lokaler Server auf Port 8080
node tools/make-test-photo.mjs /tmp/schacht.jpg
node tools/e2e.mjs http://127.0.0.1:8080/ /tmp/schacht.jpg /tmp/e2e     # Browser-Test (Playwright)
node tools/e2e-sync.mjs /tmp/schacht.jpg /tmp/e2e-sync                    # Sync Handy → PC
```

Keine npm-Abhängigkeiten für die App selbst; die Browser-Tests nutzen ein global installiertes Playwright.

## Quellen

- BFR Abwasser (Baufachliche Richtlinien Abwasser), Anhang A-2.3.5 und A-2.3.8 „Kodiersystem – zulässige Kodes für Schächte“, Stand Januar 2025 – https://www.bfr-abwasser.de
- ISYBAU-Austauschformate Abwasser (XML-2006, -2013, -2017, -2024), XSD-Schemas und Beispieldaten – https://www.bfr-abwasser.de (Materialien)
- DWA-M 150 „Datenaustauschformat für die Zustandserfassung von Entwässerungssystemen“ (Stand 04-2010), Felddefinitionen und Beispieldatei Typ B. Ein offizielles XSD liegt uns nicht vor – Exporte bitte beim ersten Projekt mit der Software des Auftraggebers prüfen.
- DIN EN 13508-2:2011 / DWA-M 149-2 (Kodiersystem; die Hauptkodes für Schächte sind identisch, ISYBAU legt strengere Regeln fest)

Die fachliche Verantwortung für die Kodierung liegt beim zertifizierten Inspekteur. KI-Vorschläge und Foto-Tiefenschätzungen sind Hilfsmittel.
