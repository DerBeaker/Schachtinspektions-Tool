# Schachtblick – Schachtinspektion nach ISYBAU & DWA

Web-App für Inspekteure: **Schacht von oben fotografieren, Anschlüsse und Schäden kodieren, als ISYBAU- oder DWA-M-150-Datei abgeben** – auf dem Handy (Android und iPhone), ohne Installation. Am PC läuft dieselbe App im Browser (z. B. zum Nachkodieren und für den Export).

Ein Produkt von **MMSE Software Engineering** – [www.mmse-software.com](https://www.mmse-software.com) · *Software, die zu Ihrem Betrieb passt.*

## Was die App heute kann

| Bereich | Funktion |
|---|---|
| **Stammdaten** | Import von ISYBAU-XML (2006, 2013, 2017, 2024) und **DWA-M 150**: Schächte, Tiefen, Deckel-/Sohlhöhen, Koordinaten, angeschlossene Haltungen/Leitungen. Fehlt die Deckelhöhe, wird sie aus Sohlhöhe + Schachttiefe berechnet. Enthält eine Datei nur Haltungen (keine Schachtobjekte), werden die Schächte aus den Haltungsenden abgeleitet |
| **Anschlüsse automatisch** | Lage am Umfang (Uhrzeit, Auslauf = 12 Uhr) wird aus der Leitungsgeometrie **berechnet**, Höhen aus den Sohlhöhen. Bei den offiziellen ISYBAU-Beispieldaten stimmt das bei 100 von 113 Schächten exakt mit der echten Inspektion überein, der Rest weicht um eine Stunde ab. |
| **Foto von oben** | Foto aufnehmen, Zifferblatt per Fingerzug auf den Schacht legen (Mittelpunkt, Radius, 12 Uhr = tiefster Auslauf), Rohröffnungen antippen → Uhrzeit wird übernommen |
| **Kodierung** | Vollständiger Kodekatalog für Schächte nach DIN EN 13508-2 / BFR Abwasser (ISYBAU, Stand 01/2025) bzw. DWA-M 149-2: abhängige Charakterisierungen, Quantifizierungen mit Einheiten, Lage am Umfang (Punkt/Bereich), Schachtbereich A–J per Schnittbild, Streckenfeststellungen, Fotos je Befund |
| **Höhenangaben von unten oder oben** | Pro Projekt (und je Inspektion) umschaltbar, wie der Auftraggeber es verlangt: **von unten** (Anfang an der Sohle = 0,00 m, Ende am Deckel = Schachttiefe, Standard) oder **von oben** (Deckel = 0,00 m). Erfasst wird wahlweise „ab OK Deckel“ oder „über Sohle“ – die App rechnet beim Export um, deshalb lässt sich die Richtung auch nachträglich ändern |
| **Laser-Entfernungsmesser (Bluetooth)** | Zwei Wege: **Tastaturmodus** (HID, z. B. Leica DISTO X3/X4/D5, Stabila LD 530 BT) auf Android, iPhone und PC – Feld antippen, messen, „2,345 m“ oder „2345 mm“ wird umgerechnet, Enter springt weiter. **Direkt verbunden** (Beta, Web Bluetooth in Chrome/Edge auf Android, Windows, Mac; nicht Safari/iOS) für günstigere Laser ohne Tastaturmodus: Leica DISTO mit Bluetooth (D1, D110, D2 …) und Bosch GLM mit Bluetooth (z. B. GLM 50-27 C). Einstellungen → „Laser verbinden“; der Messwert landet im zuletzt angetippten Maßfeld, das Bluetooth-Symbol in der Kopfzeile zeigt den Status und verbindet nach dem Ausschalten neu |
| **Plausibilitätsprüfung** | Regeln aus dem Kodierhandbuch (z. B. DAB B erst ab 0,5 mm, „Z“ braucht eine Anmerkung, DAO/DAP nur mit Primärschaden, Pflichtfelder) – live beim Erfassen |
| **Export** | **ISYBAU-XML 2006, 2013, 2017 oder 2024** (Zustandsdaten, jeweils gegen das **offizielle XSD-Schema geprüft**) oder **DWA-M 150 Typ B** (wahlweise mit ISYBAU-Schlüsseln und Dezimalpunkt wie gängige Kanalsoftware oder wie die DWA-Beispieldatei) – Kodierung nach BFR Abwasser oder DWA-M 149-2, Format pro Projekt wählbar. ZIP mit Fotos nach Namenskonvention (`S1005-001.jpg`) |
| **Bauteilbeschreibung** | Reiter „Aufbau“ je Schacht: Abdeckung (Form, Klasse, Maße, Material, Lüftung, Schmutzfänger), Auflageringe, Schachtaufbau mit Konus oder Abdeckplatte, untere Schachtzone (Übergangsplatte, Podest), Unterteil mit Gerinne, Steighilfen, Schachtfunktion – genau die Felder der ISYBAU-Stammdaten. Vorbelegung aus den Stammdaten oder per Vorlage „Regelschacht DN 1000“, Höhenbilanz gegen die Schachttiefe, Laser-Eingabe in m/cm. Export als ISYBAU-Stammdaten (alle Versionen, XSD-geprüft) bzw. DWA-M-150-Felder, im PDF-Protokoll als Tabelle |
| **3D-Modell** | Drehbares, aufgeschnittenes 3D-Modell aus der Bauteilbeschreibung: Unterteil, Ringe, Konus, Auflageringe, Rahmen und Deckel, Berme mit Gerinne, Anschlüsse in Uhrlage und Höhe, Steigeisen. Auch als Bild im Schachtprotokoll |
| **Zustandsklassen** | Automatische Bewertung nach **BFR Abwasser Anhang A-3** (Stand 01/2025): Einzelschadensklassen je Befund für Dichtheit, Standsicherheit und Betriebssicherheit, Zusatzpunkte aus den Randbedingungen (Entwässerungsart, Wasserschutzzone, Grundwasser, Boden), Objektzahl und **Objektklasse 0–5** je Schacht – live beim Erfassen und im ISYBAU-Export (`Klassifizierung` je Zustand, `Bewertung` je Schacht). Gegen die bewerteten offiziellen ISYBAU-Beispieldaten geprüft: 113 von 113 Schächten identisch |
| **Vorinspektionen** | Alte Zustandsdaten (ISYBAU-XML 2006–2024 oder DWA-M 150) einlesen – mit oder ohne Stammdaten. Je Schacht wird die letzte Inspektion angezeigt; Befunde und Anschlüsse lassen sich einzeln oder komplett übernehmen |
| **Karte** | Alle Schächte und Leitungen eines Projekts auf der amtlichen Karte (basemap.de, farbig oder grau) oder OpenStreetMap, eingefärbt nach Status oder Objektklasse; eigener Standort, Navigation zum Schacht |
| **PDF-Berichte** | **Schachtprotokolle als PDF** mit Firmenlogo, Anschrift und Kontakt: Kopfdaten, Übersichtsfoto mit Zifferblatt und Anschlüssen, Zustandsdaten mit Klassen, Bewertung, Befundfotos. Mehrere Schächte → Sammelbericht mit Übersichtsseite. Auf dem Handy direkt teilen (z. B. per E-Mail) |
| **Aufmaß** | Aufmaß der inspizierten Schächte für die Abrechnung als **PDF** (mit Unterschriftsfeldern) oder **Excel**: Tiefe je Schacht, frei einstellbare **Tiefenstaffel** (z. B. bis 2 m / 2–3 m / 3–5 m / über 5 m), Mehrtiefe über einer Grenztiefe, Reinigung, Fotos, Summen |
| **Protokoll (Druck)** | Druckansicht des Schachtprotokolls im Browser |
| **Offline** | Läuft ohne Netz weiter (PWA). Alle Daten liegen zuerst auf dem Gerät |
| **Navigation** | „Schächte in der Nähe“ per GPS und Navigation zum Schacht (UTM- und Gauß-Krüger-Koordinaten werden umgerechnet) |
| **Team-Server (optional)** | PHP + MySQL auf dem eigenen Webspace: Anmeldung (E-Mail oder Benutzername, „Passwort vergessen“), Synchronisation Handy ↔ PC, Fotos, Benutzerverwaltung mit Einladungen per E-Mail, Firmendaten und Logo zentral für alle Geräte einer Firma |
| **Datenschutz** | Keine Cookies, kein Tracking; Impressum- und Datenschutz-Links in der App, eigene Datenschutzhinweise (`#/datenschutz`), Kartenhintergrund erst nach Einwilligung, Löschfunktionen für Benutzer und Firmen |
| **Mehrere Firmen** | Betreiber-Bereich (MMSE): Firmen anlegen, Administrator per Einladungslink, Lizenz je Firma (Benutzerzahl, Laufzeit, Testzugang), sperren, Daten exportieren oder löschen. Jede Firma sieht nur ihre eigenen Daten |
| **Tarife** | **Basis** kostenlos ohne Anmeldung (Daten nur auf dem Gerät, kein XML-Export) · **Pro** mit Firmenkonto: XML-Export, Sync, Benutzer. Selbstregistrierung mit E-Mail-Bestätigung und Testzeitraum, Nutzungsbedingungen und AVV (Art. 28 DSGVO) online annehmen inkl. PDF, Pro buchen/ändern/kündigen (Zahlung per Rechnung), Aufträge im Betreiber-Bereich. Freigabe erst nach rechtlicher Prüfung der Texte |
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

Schritt für Schritt mit Upload-Paket: **[docs/INSTALLATION-IONOS.md](docs/INSTALLATION-IONOS.md)**. Paket bauen: `npm run paket` → `dist/schachtblick-<version>.zip`.

### Variante A – nur die App (ohne Server, ohne Login)
1. Den Inhalt des Ordners `app/` per SFTP/FTP in ein Verzeichnis des Webspace hochladen, z. B. `/schacht/`.
2. Im IONOS-Kundenbereich ein SSL-Zertifikat für die Domain aktivieren.
3. `https://deine-domain.de/schacht/` auf dem Handy öffnen → im Browsermenü **„Zum Startbildschirm hinzufügen“**. Fertig – kein App-Store nötig.

Jedes Gerät speichert dann seine eigenen Daten; Austausch über ISYBAU-Export.

### Variante B – mit Team-Server (Sync Handy ↔ PC, mehrere Inspekteure)
1. Wie Variante A hochladen (der Ordner `api/` gehört dazu).
2. Im IONOS-Kundenbereich unter *Hosting → Datenbanken* eine **MySQL/MariaDB-Datenbank** anlegen.
3. `api/config.sample.php` als `api/config.php` kopieren und die Datenbank-Zugangsdaten eintragen.
4. `https://deine-domain.de/schacht/api/setup.php` aufrufen → Firma und ersten Administrator anlegen (die Seite sperrt sich danach selbst). Dieser erste Benutzer ist **Betreiber** der Installation.
5. In der App: *Einstellungen → Firmenkonto* → anmelden (Server-Adresse unter „Erweitert“ leer lassen). Weitere Benutzer lädt der Administrator dort unter „Benutzer verwalten“ per E-Mail ein; weitere Firmen legt der Betreiber im **Betreiber-Bereich** an.

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
5. **Abschließen** → später im Projekt unter **Export & Berichte**: Datenexport (ISYBAU 2006–2024 oder DWA-M 150 als ZIP), Schachtprotokolle als PDF, Aufmaß als PDF oder Excel.
6. Einmalig unter **Einstellungen → Firma** Firmenname, Anschrift, Kontakt und **Logo** für die Berichte hinterlegen.

## Projektstruktur

```
app/                    ← kommt auf den Webspace
  index.html, sw.js     Web-App (PWA, ohne Build-Schritt)
  js/data/              Kodekatalog (BFR Abwasser A-2.3.8) und Referenzlisten
  js/isybau/            XML-Parser, Import (Stamm- und Zustandsdaten), ISYBAU-Export (2006–2024), DWA-M 150,
                        Plausibilität, Zustandsbewertung (BFR A-3)
  js/report/, js/lib/   PDF-Schachtprotokoll, Aufmaß (PDF/Excel), eigener PDF- und XLSX-Writer
  js/views/, components Oberfläche (Foto mit Uhr, Schachtschnitt, Editoren, Bauteile/3D, Karte, Betreiber-Bereich)
  vendor/leaflet/       Kartenbibliothek Leaflet 1.9.4 (BSD-2-Clause)
  vendor/three/         3D-Bibliothek three.js r160 (MIT)
  api/                  optionaler PHP-Server (MySQL oder SQLite)
docs/KONZEPT.md         Konzept, Grenzen, Roadmap
tests/                  automatische Tests (Node + PHP)
tools/                  Demo-Daten, Icons, Browser-Tests
```

## Entwicklung & Tests

```bash
npm run xsd     # offizielle ISYBAU-XSD-Schemas 2006/2013/2017/2024 laden (für die Exportprüfung)
npm test        # Import/Export (alle Versionen + DWA-M 150), Bewertung, PDF/Aufmaß, Plausibilität, ZIP, Koordinaten + PHP-Server inkl. KI-Mock
npm run serve   # lokaler Server auf Port 8080
node tools/make-test-photo.mjs /tmp/schacht.jpg
node tools/e2e.mjs http://127.0.0.1:8080/ /tmp/schacht.jpg /tmp/e2e     # Browser-Test (Playwright)
node tools/e2e-sync.mjs /tmp/schacht.jpg /tmp/e2e-sync                    # Sync Handy → PC
node tools/e2e-firmen.mjs /tmp/schacht.jpg /tmp/e2e-firmen                # Betreiber, Einladung, Lizenz, Firmendaten, Registrierung, AVV, Buchung
node tools/e2e-laser.mjs http://127.0.0.1:8080/ /tmp/e2e-laser            # Bluetooth-Laser direkt (simuliertes Leica DISTO / Bosch GLM)
SB_TEST_MYSQL="mysql:host=…;dbname=leer|benutzer|passwort" node --test tests/api.test.mjs   # Server-Tests gegen MySQL/MariaDB
npm run paket   # Upload-Paket für den Webspace
```

Keine npm-Abhängigkeiten für die App selbst; die Browser-Tests nutzen ein global installiertes Playwright.

## Quellen

- BFR Abwasser (Baufachliche Richtlinien Abwasser), Anhang A-2.3.5 und A-2.3.8 „Kodiersystem – zulässige Kodes für Schächte“, Stand Januar 2025 – https://www.bfr-abwasser.de
- ISYBAU-Austauschformate Abwasser (XML-2006, -2013, -2017, -2024), XSD-Schemas und Beispieldaten – https://www.bfr-abwasser.de (Materialien)
- DWA-M 150 „Datenaustauschformat für die Zustandserfassung von Entwässerungssystemen“ (Stand 04-2010), Felddefinitionen und Beispieldatei Typ B. Ein offizielles XSD liegt uns nicht vor – Exporte bitte beim ersten Projekt mit der Software des Auftraggebers prüfen.
- DIN EN 13508-2:2011 / DWA-M 149-2 (Kodiersystem; die Hauptkodes für Schächte sind identisch, ISYBAU legt strengere Regeln fest)
- BFR Abwasser Anhang A-3 „Zustandsklassifizierung und -bewertung“ (Stand 01/2025), Tabellen A-3-4 und A-3-38 bis A-3-70 für Schächte. Die Bewertung nach DWA-M 149-3 ist nicht enthalten (Tabellen nicht frei verfügbar).
- Karten: basemap.de Web Raster © BKG (Datenlizenz Deutschland – Namensnennung 2.0), OpenStreetMap © OpenStreetMap-Mitwirkende (ODbL), Leaflet © Volodymyr Agafonkin (BSD-2-Clause)
- 3D: three.js © three.js authors (MIT)
- Bauteilbeschreibung: BFR Abwasser Anhang A-7.4 (ISYBAU-Stammdaten Knoten/Schacht) und A-7.9 (Referenzlisten G301–G309); DWA-M 150 KG-Felder 304–325

Die fachliche Verantwortung für die Kodierung liegt beim zertifizierten Inspekteur. KI-Vorschläge und Foto-Tiefenschätzungen sind Hilfsmittel.

---

© MMSE Software Engineering · [www.mmse-software.com](https://www.mmse-software.com)
