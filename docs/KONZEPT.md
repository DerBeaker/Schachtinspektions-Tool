# Konzept: Schachtinspektion per Handy (ISYBAU / DWA)

Dieses Dokument beantwortet die Ausgangsfragen „Wie wäre das umsetzbar?“ und beschreibt, was im Prototyp bereits umgesetzt ist, wo die Grenzen liegen und wie es weitergehen kann.

Schachtblick ist ein Produkt von **MMSE Software Engineering** (www.mmse-software.com). Der Hersteller erscheint in der App (Startseite, Einstellungen → „Über“), in der Fußzeile jedes PDF-Berichts und in den Exportdateien (ISYBAU `Systemname`/`Kommentar`, Kommentar im DWA-M-150-Kopf).

## 1. Grundidee

Ein Inspekteur steht am geöffneten Schacht, hat das Handy in der Hand und soll in wenigen Minuten fertig sein:

1. Schacht in der Liste finden (oder „In der Nähe“ per GPS).
2. **Ein Foto senkrecht von oben** – der Auslauf (tiefste abgehende Leitung) liegt auf 12 Uhr.
3. Anschlüsse am Foto antippen, Tiefen eintragen (von oben **oder** von unten gemessen).
4. Schäden aus dem Kodekatalog wählen – die App kennt die zulässigen Charakterisierungen und prüft mit.
5. Abschließen. Im Büro: ISYBAU-Export als ZIP mit Fotos, oder Protokoll als PDF.

## 2. Warum eine Web-App (PWA) und keine App aus dem App-Store?

| Anforderung | Lösung |
|---|---|
| „Man soll sie nicht installieren müssen“ | Läuft im Browser. Optional „Zum Startbildschirm hinzufügen“ – sieht dann aus wie eine App, ohne App-Store. |
| Handy **und** PC | Dieselbe Oberfläche passt sich an: Handy = Reiter und große Tasten, PC = zweispaltig mit Foto links und Liste rechts. |
| Schlechter Empfang am Schacht | Offline-first: Alles wird sofort auf dem Gerät gespeichert (IndexedDB), Synchronisation passiert im Hintergrund, sobald Netz da ist. |
| Vorhandener IONOS-Webspace mit Datenbank | Passt genau: Die App sind statische Dateien, der optionale Server ist reines PHP mit MySQL – genau das, was IONOS-Webhosting bietet. Kein Node.js, kein eigener Server nötig. |
| Updates | Neue Version hochladen – alle Geräte haben sie beim nächsten Öffnen. |

Grenze einer Web-App: Spezialsensoren wie der LiDAR-Scanner im iPhone Pro sind aus dem Browser nicht erreichbar (siehe Abschnitt 5). Falls das später gewünscht ist, lässt sich dieselbe App in eine dünne native Hülle (z. B. Capacitor) packen – der Code bleibt.

## 3. Architektur

```
 Handy / Tablet / PC (Browser)                 IONOS-Webspace
┌──────────────────────────────┐             ┌──────────────────────────┐
│ Web-App (HTML/JS, offline)   │  HTTPS/JSON │ api/ (PHP 8)             │
│ • IndexedDB: Projekte,       │ ◄─────────► │ • Login, Benutzer, Firmen│
│   Schächte, Inspektionen,    │             │ • Sync (Revisionen)      │
│   Fotos                      │             │ • Foto-Ablage            │
│ • ISYBAU Import/Export       │             │ MySQL/MariaDB            │
│ • Plausibilitätsprüfung      │             └───────────┬──────────────┘
└──────────────────────────────┘                         │ optional
                                                         ▼
                                              KI-Bildanalyse (Claude-API)
```

- **Ohne Server** funktioniert alles auf einem Gerät; Austausch über ISYBAU-Dateien.
- **Mit Server** (optional): Mehrere Inspekteure, Handy ↔ PC-Abgleich, zentrale Fotos. Konflikte: Der zuletzt bearbeitete Stand eines Schachts gewinnt (in der Praxis bearbeitet ein Inspekteur einen Schacht).
- **Mandantenfähig**: Jede Firma ist ein eigener Mandant mit eigenen Benutzern – Grundlage dafür, die App später auch anderen Firmen anzubieten.

## 4. ISYBAU und DWA

- **Kodiersystem**: DIN EN 13508-2:2011. Die Hauptkodes für Schächte (DAA … DDG, DCA/DCG usw.) sind bei ISYBAU (BFR Abwasser) und DWA-M 149-2 gleich; ISYBAU erlaubt weniger Charakterisierungen und hat strengere Regeln. Der Katalog in der App entspricht der aktuellen BFR-Abwasser-Liste „Zulässige Kodes für Schächte“ (Stand 01/2025). Pro Projekt wählbar: ISYBAU (Kodiersystem 10) oder DWA-M 149-2 (Kodiersystem 9).
- **Lage am Umfang**: Draufsicht, tiefster Auslauf = 12 Uhr (BFR A-2.3.5). Genau das bildet das Zifferblatt über dem Foto ab.
- **Vertikale Lage**: Pro Projekt umschaltbar. **Von unten** (Standard, ISYBAU-Bezugspunkt 1): Inspektionsanfang an der Sohle der tiefsten abgehenden Leitung = 0,00 m, Inspektionsende am Deckel = Schachttiefe (z. B. 2,34 m). **Von oben** (Bezugspunkt 2): Deckel = 0,00 m, Sohle = Schachttiefe. Die Werte werden so gespeichert, wie sie gemessen wurden („ab OK Deckel“ oder „über Sohle“), und erst beim Export umgerechnet – die Richtung kann deshalb auch nach der Aufnahme noch geändert werden.
- **Import**: ISYBAU-Stammdaten (XML 2006/2013/2017/2024) und DWA-M 150 (Dezimalkomma oder -punkt, Gauß-Krüger oder UTM). Aus Deckel- und Sohlhöhen sowie der Leitungsgeometrie werden Schachttiefe, Anschlusshöhen und die Lage der Anschlüsse am Umfang **vorberechnet**. Test mit den offiziellen ISYBAU-Beispieldaten: 100 von 113 Schächten exakt, Rest ±1 Stunde. Fehlt die Deckelhöhe (häufig in älteren Bestandsdaten), wird sie aus Sohlhöhe + Schachttiefe berechnet; Schächte ohne Ablauf in den Stammdaten (Endschacht, Projektgrenze) werden gemeldet – dort legt der Inspekteur den Auslauf am Foto fest.
- **Export**: Abgabeformat pro Projekt wählbar – genau das, was der jeweilige Auftraggeber verlangt:

  | Format | Besonderheiten |
  |---|---|
  | ISYBAU XML-2006 | alter Namensraum, Liegenschaft Pflicht, ohne Datensatz-Index; Kodiersystem als DIN EN 13508-2:2003/DWA-M 149-2 (die Version kennt die Ausgabe 2011 noch nicht) |
  | ISYBAU XML-2013 | alter Namensraum, Liegenschaft Pflicht, Kodiersystem 9 (DWA) oder 10 (BFR) |
  | ISYBAU XML-2017 | Namensraum bfr-abwasser.de, Datensatz-Index, Drainage-Kennzeichen |
  | ISYBAU XML-2024 | zusätzlich Erfassungsart (KI-Vorschläge = „Assistenzsystem“) |
  | DWA-M 150 Typ B | je Schacht KG (Stammdaten) + KI (Inspektion) + KZ (Zustände) + Referenztabellen. Zwei Schlüsselvarianten: ISYBAU-Werte mit Dezimalpunkt und Datum JJJJ-MM-TT (so schreiben es gängige Kanalinspektionsprogramme, Standard) oder Buchstabenschlüssel mit Dezimalkomma wie die DWA-Beispieldatei. Die verwendeten Schlüssel stehen in jedem Fall in den RT-Tabellen der Datei. |

  Automatisch erzeugt werden Inspektionsanfang/-ende (DDB A/B), Anschlüsse als DCA+DCG-Paare, Streckenfeststellungen (A/B mit laufender Nummer), Übersichtsfoto als DDA, Fotodateinamen nach Konvention. Jeder ISYBAU-Export ist in den automatischen Tests **gegen das offizielle XSD-Schema seiner Version validiert** (BFR- und DWA-Kodierung). Für DWA-M 150 gibt es kein öffentliches XSD; Aufbau und Schlüssel folgen der offiziellen DWA-Beispieldatei.
- Empfehlung vor dem ersten echten Projekt: einen Export mit der Prüfsoftware des Auftraggebers (z. B. PIETS) gegenprüfen lassen.

### 4.1 Zustandsklassen (Bewertung)

- Verfahren nach **BFR Abwasser Anhang A-3** (Stand 01/2025), das auch in den ISYBAU-Beispieldaten steckt: Für jeden Befund ergibt sich aus Kode, Charakterisierungen, Schachtbereich und Quantifizierung je Schutzziel (D Dichtheit, S Standsicherheit, B Betriebssicherheit) eine **vorläufige Einzelschadensklasse** (Tabellen A-3-38 … A-3-70). Bei Verformungen unterscheidet die Tabelle biegeweiche und biegesteife Werkstoffe.
- **Zusatzpunkte** (Tab. A-3-4) aus Entwässerungsart, Abwasserart, Wasserschutzzone, Grundwasser, Bodenart und „im Bereich einer Verbindung“ → endgültige Einzelschadenszahl/-klasse.
- **Objektbewertung**: maßgebender Schaden, Objektzahl vorläufig, Schadenslängenzuschlag (Strecken mit ihrer Länge, Punkte mit 0,5 m, bezogen auf die Schachttiefe) → **Objektklasse 0–5** (5 = umgehender Handlungsbedarf).
- Randbedingungen kommen aus den Stammdaten (ISYBAU-Umweltparameter) oder werden je Projekt unter „Projekt & Auftrag“ eingetragen.
- Die App zeigt die Klassen live beim Erfassen, je Befund, je Schacht und in der Schachtliste; im ISYBAU-Export (alle Versionen) stehen sie in `Klassifizierung` (je Zustand) und `Bewertung` (je Schacht, Bewertungsverfahren 1). Abschaltbar im Export.
- **Prüfung**: Gegen die offiziellen, bewerteten ISYBAU-Beispieldaten 2024 stimmen alle 113 Schächte (Objektzahl und -klasse) und alle Einzelklassen überein.
- **Nicht enthalten**: Bewertung nach DWA-M 149-3 (andere Klassenrichtung, Tabellen urheberrechtlich geschützt). Pauschale Einordnungen sind markiert (*) und vom Fachingenieur zu prüfen.

### 4.2 Vorinspektionen

Zustandsdaten früherer Inspektionen (ISYBAU-XML 2006–2024, DWA-M 150 KG/KI/KZ) werden beim Import erkannt – auch zusammen mit Stammdaten in einer Datei. Je Schacht wird die jüngste Inspektion gespeichert und in der Inspektion angezeigt (Befunde mit Klassen aus der Datei). Befunde lassen sich einzeln oder komplett übernehmen, Anschlüsse ebenfalls (DCA/DCG-Paare). Schächte, die nur in den Zustandsdaten vorkommen, werden angelegt.

### 4.3 Berichte und Aufmaß

- **Schachtprotokoll als PDF** (im Browser erzeugt, kein Server nötig): Firmenkopf mit Logo, Anschrift, Kontakt (Einstellungen); Kopfdaten; Übersichtsfoto mit Zifferblatt und Anschlüssen; Tabelle der Zustandsdaten in Exportreihenfolge mit Klassen; Bewertung; Befundfotos. Mehrere Schächte ergeben einen Sammelbericht mit Übersichtsseite (Tabelle und Klassenverteilung). Fußzeile mit Seitenzahl und Herstellerangabe.
- **Aufmaß** als PDF (mit Unterschriftsfeldern Auftragnehmer/Auftraggeber) und Excel (XLSX): Position, Schacht, Straße, Datum, Tiefe, Tiefenstaffel, Mehrtiefe, Verfahren, Reinigung, Fotos, Befunde, Status; Summen je Staffel. Staffelgrenzen und Grenztiefe für die Mehrtiefe werden je Projekt gespeichert.
- PDF und XLSX werden mit eigenem, kleinem Code erzeugt (keine Fremdbibliothek, funktioniert offline).

### 4.4 Bauteilbeschreibung und 3D-Modell

Viele Auftraggeber verlangen neben dem Zustand eine Beschreibung des Schachtaufbaus. ISYBAU sieht dafür in den **Stammdaten** (Knoten/Schacht) feste Felder vor: Abdeckung (Form, Typ, Länge/Breite, Klasse, Material, Schmutzfänger), Auflageringe (Anzahl, Gesamthöhe in cm), Schachtaufbau (Form, Konus, Abdeckplatte, DN/Länge, Breite, Höhe, Material), untere Schachtzone (nur Sonderschächte: Übergangsplatte, Konus, Podest), Unterteil (Form, Maße, Material, Gerinneform und -material), Steighilfen (Art, Material) und Schachtfunktion. Genau diese Felder erfasst der Reiter „Aufbau“.

- Vorbelegung aus importierten Stammdaten (ISYBAU 2006–2024 bzw. DWA-M 150), alternativ Vorlage „Regelschacht DN 1000“ (Höhen bleiben leer und werden gemessen).
- Höhenbilanz: Auflageringe + Aufbau + untere Zone + Unterteil gegen die Schachttiefe; der Rest entspricht Abdeckung und Rahmen.
- Export: Der ISYBAU-Export enthält zusätzlich ein **Stammdatenkollektiv** mit der Bauteilbeschreibung je Schacht (2006/2013: Abdeckung im Schacht-Element, ab 2017: Knoten/Abdeckungen/Deckel; Schachtfunktionen 13–22 nur in 2024) – gegen alle vier XSD geprüft und abschaltbar. DWA-M 150 schreibt die vorhandenen KG-Felder (Schachtform/-maße, Material, Deckel, Gerinne, Steighilfen, Innenschutz) samt Referenztabellen; Konus und Auflageringe kennt M 150 nicht.
- Das **3D-Modell** wird aus denselben Daten erzeugt (three.js, lokal mitgeliefert, funktioniert offline): aufgeschnittener Schacht mit allen Bauteilen, Berme und Gerinne zum Auslauf bei 12 Uhr, Anschlüssen in Uhrlage und Höhe, Steigeisen. Fehlende Maße werden mit üblichen Werten ergänzt und benannt. Im PDF-Protokoll erscheint es als Bild neben der Bauteiltabelle. Das 3D-Modell selbst wird nicht ausgetauscht – die empfangende Software baut es aus den Stammdaten wieder auf.

### 4.5 Karte

Schächte (Kreise, eingefärbt nach Status oder Objektklasse) und Leitungen eines Projekts auf der Karte; Koordinaten aus den Stammdaten (UTM/Gauß-Krüger → WGS84). Hintergrund: **basemap.de** (amtliche Karte des BKG, farbig oder grau) oder OpenStreetMap. Kartenbibliothek Leaflet liegt in `app/vendor/` (keine externe Einbindung). Die Kartenkacheln brauchen eine Internetverbindung; ohne Netz bleiben Schachtliste und „In der Nähe“ nutzbar.

## 4a. Mehrere Firmen (Betrieb durch MMSE)

- **Eine Installation, viele Firmen:** Jede Firma ist ein Mandant mit eigenen Benutzern, Projekten und Fotos. Jede Datenbankabfrage ist auf den Mandanten beschränkt (automatisch getestet).
- **Betreiber:** Der Benutzer, der die Installation einrichtet (MMSE), sieht den Betreiber-Bereich: Firmen anlegen, Administrator per Einladungslink, Lizenz je Firma (max. Benutzer, gültig bis, Testzugang 30 Tage), sperren, Daten exportieren (JSON) und löschen. Inhalte der Firmen (Projekte, Inspektionen) sieht der Betreiber in der App nicht.
- **Firmen-Administrator:** lädt Mitarbeiter per E-Mail ein (Inspekteur oder Administrator), pflegt Firmendaten und Logo – diese gelten automatisch auf allen Geräten der Firma und erscheinen in PDF-Berichten.
- **Anmeldung:** mit E-Mail-Adresse (oder Benutzername); „Passwort vergessen“ schickt einen Link (2 Stunden gültig). Einladungslinks gelten 14 Tage und einmal.
- **Lizenz:** abgelaufene oder gesperrte Firmen können sich nicht anmelden und nicht synchronisieren; die Daten auf den Geräten bleiben erhalten. Die Benutzergrenze greift beim Anlegen, Einladen und Entsperren.
- **Datenbank-Updates** laufen automatisch (Schema-Version in `sb_meta`), bestehende Installationen werden beim ersten Aufruf nach dem Update ergänzt.
- Getestet mit SQLite und MariaDB 10.11 sowie unter Apache mit den mitgelieferten `.htaccess`-Regeln.
- Alternative **Weg B** (eigene Installation je Kunde) funktioniert mit demselben Paket.

## 5. Tiefen automatisch aus dem Foto?

Ehrliche Einordnung – ISYBAU verlangt Lagen auf den Zentimeter (zwei Nachkommastellen in Metern):

| Methode | Genauigkeit | Status |
|---|---|---|
| **Aus Stammdaten** (Deckel- minus Sohlhöhe) | so gut wie die Vermessung | ✅ umgesetzt – Tiefen und Anschlusshöhen sind vorbelegt, der Inspekteur prüft/korrigiert |
| **Messlatte / Zollstock / Lot** | ±1 cm | Standard – Eingabe „ab Deckel“ oder „über Sohle“ |
| **Laser-Entfernungsmesser mit Bluetooth-Tastaturmodus** (HID, z. B. Leica DISTO mit Keyboard-Modus) | ±2 mm | ✅ funktioniert auf Android **und** iPhone: Das Handy erkennt den Laser wie eine Tastatur, der Messwert landet im angetippten Feld. Die App versteht „2,345“, „2.345 m“, „2345 mm“; Enter springt weiter. Direkte Kopplung per Web Bluetooth ginge nur unter Android/Chrome |
| **Foto-Schätzung** (zwei Kreise bekannter Größe: Schachthals oben, Schacht-DN unten, Brennweite aus EXIF) | ca. ±10 % | ✅ experimentell umgesetzt („Tiefe schätzen“) – gut als Plausibilitätskontrolle, nicht als Aufmaß |
| **LiDAR (iPhone Pro / iPad Pro)** | ±1–3 cm bis ca. 5 m | nur mit nativer App möglich |
| **KI schätzt Tiefe** | grob | nur als Hinweis, nicht für ISYBAU |

**Fazit**: Aus einem einzelnen Foto lässt sich die Tiefe nicht ISYBAU-genau bestimmen. Die beste Kombination ist: Stammdaten vorbelegen, mit Laser bestätigen, Foto-Schätzung als Plausibilitätscheck.

Hinweis zur Gerätewahl: Vor dem Kauf im Datenblatt auf „Bluetooth HID“ bzw. „Keyboard-Modus“ achten. Reine App-Kopplung (nur Herstellerapp) reicht nicht, weil der Browser diese Verbindung nicht nutzen kann.

## 6. Schäden automatisch erkennen?

**Umgesetzt (optional)**: Der Knopf „KI-Analyse“ schickt das Übersichtsfoto über den eigenen Server an ein Bildanalyse-Modell (Claude). Zurück kommen **Vorschläge**:
- erkannte Rohröffnungen mit Uhrzeit und geschätzter Nennweite,
- sichtbare Zustände als Kode mit Charakterisierung (z. B. DAB, DAF, DBF, DAQ, DBB), Lage am Umfang, Schachtbereich, Sicherheit und Begründung.

Der Inspekteur hakt an, was stimmt; übernommene Befunde sind als „KI-Vorschlag“ markiert und werden im ISYBAU-2024-Export als *Erfassungsart 3 – Assistenzsystem* gekennzeichnet.

Realistische Erwartung:
- Gut: Anschlüsse finden, grobe Schäden (Ablagerungen, Inkrustationen, fehlende/korrodierte Steigeisen, Wasserzutritt, deutliche Abplatzungen).
- Schwierig: feine Risse in der Tiefe, Quantifizierungen in Millimetern, alles was im Draufsichtfoto nur schräg/dunkel zu sehen ist → Detailfotos und das Auge des Inspekteurs bleiben nötig.
- Kosten grob 5–10 Cent pro Foto (Modell Claude Opus 5.5, Stand 10/2026). Die Bilddaten gehen dabei an Anthropic (USA) – im Datenschutzkonzept berücksichtigen bzw. Auftraggeber informieren.

**Ausbaustufe**: Jedes in der App kodierte Foto ist ein beschriftetes Trainingsbeispiel. Nach einigen tausend Schächten kann ein eigenes, spezialisiertes Erkennungsmodell trainiert werden, das auf dem eigenen Server läuft.

## 7. Datenschutz & Sicherheit

- Daten liegen auf dem Handy und – mit Server – auf dem eigenen IONOS-Webspace in Deutschland.
- Passwörter gehasht (bcrypt/argon2 über `password_hash`), Sitzungen als Zufalls-Token (nur Hash in der DB), Sperre nach 10 Fehlversuchen.
- Jede Firma sieht nur ihre Daten (Mandantentrennung in jeder Abfrage, per Test geprüft).
- Fotos und Konfiguration per `.htaccess` gegen Direktzugriff gesperrt; besser Fotoordner außerhalb des Webordners.
- HTTPS ist Pflicht (Kamera/GPS funktionieren sonst nicht).
- Die Kartenansicht lädt Kartenkacheln von basemap.de (BKG) bzw. OpenStreetMap; dabei wird – wie bei jedem Kartendienst – die IP-Adresse des Geräts übertragen, aber keine Projektdaten.
- PDF-Berichte, Aufmaß und Exporte entstehen vollständig auf dem Gerät.

## 8. Stand des Prototyps

- Frontend: Projekte, Import (Stamm- und Zustandsdaten), Schachtliste mit GPS, Karte, Inspektion (Foto/Uhr, Anschlüsse, Befunde, Kopfdaten, Vorinspektion), Plausibilität, Zustandsklassen, Export, PDF-Protokolle, Aufmaß, Einstellungen mit Firmenlogo, Offline.
- Server: Einrichtung, Login, Benutzerverwaltung, Sync, Fotos, KI-Route.
- Tests: Unit-Tests (Import ISYBAU und DWA-M 150, Export mit XSD-Validierung 2006/2013/2017/2024, DWA-M-150-Struktur, Bewertung gegen die offiziellen Beispieldaten, Vorinspektion, PDF/Aufmaß/XLSX, Regeln, ZIP, Koordinaten, Laser-Eingaben), Server-Tests (SQLite, inkl. Mandantentrennung und KI-Anfrageformat), Browser-Tests (kompletter Ablauf auf Handy-Größe inkl. Export in drei Formaten, PDF-Protokoll, Aufmaß PDF/Excel und Sync Handy → PC).

## 9. Roadmap (Vorschlag)

**Phase 1 – Praxistest (2–4 Wochen)**
- Mit 1–2 Inspekteuren an echten Schächten testen, Bedienung nachschärfen.
- Erstes echtes Projekt: Export beim Auftraggeber prüfen lassen.
- Auf IONOS installieren, Team-Server einrichten.

**Phase 2 – Ausbau**
- ✔ Zustandsbewertung nach BFR Abwasser A-3 mit Bewertungsfeldern im Export, ✔ Vorinspektionen, ✔ Karte, ✔ PDF-Berichte mit Logo, ✔ Aufmaß, ✔ Bauteilbeschreibung mit 3D-Modell, ✔ mehrere Firmen mit Betreiber-Bereich und Lizenzen.
- KI-Analyse der Fotos im Praxistest weiterentwickeln (zurückgestellt).
- Bewertung nach DWA-M 149-3, sobald die Tabellen lizenziert vorliegen.
- DWA-M 149-2 in der aktuellen Ausgabe: DWA-spezifische Charakterisierungen ergänzen, die über die BFR-Liste hinausgehen.
- Mehrere Übersichtsfotos (z. B. Schachtkamera/360°); Selbstregistrierung von Firmen und Online-Bezahlung.
- Auftraggeber-Profile (Pflichtfelder, Bezugspunkte, Fotokonventionen, Aufmaßpositionen mit Preisen).

**Phase 3 – Für andere Firmen**
- Selbstregistrierung von Firmen, Lizenz/Abrechnung, Mandanten-Admin.
- Eigenes KI-Modell aus den gesammelten, kodierten Fotos.
