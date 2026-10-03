# Konzept: Schachtinspektion per Handy (ISYBAU / DWA)

Dieses Dokument beantwortet die Ausgangsfragen „Wie wäre das umsetzbar?“ und beschreibt, was im Prototyp bereits umgesetzt ist, wo die Grenzen liegen und wie es weitergehen kann.

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
- **Vertikale Lage**: Standard-Bezugspunkt ist die Sohle der tiefsten abgehenden Leitung (0,00 m). Eingaben „ab OK Deckel“ werden über die Schachttiefe umgerechnet; alternativ kann der Auftraggeber „OK Abdeckung“ als Bezug festlegen.
- **Import**: ISYBAU-Stammdaten (XML 2006/2013/2017/2024) und DWA-M 150 (Dezimalkomma oder -punkt, Gauß-Krüger oder UTM). Aus Deckel- und Sohlhöhen sowie der Leitungsgeometrie werden Schachttiefe, Anschlusshöhen und die Lage der Anschlüsse am Umfang **vorberechnet**. Test mit den offiziellen ISYBAU-Beispieldaten: 100 von 113 Schächten exakt, Rest ±1 Stunde. Fehlt die Deckelhöhe (häufig in älteren Bestandsdaten), wird sie aus Sohlhöhe + Schachttiefe berechnet; Schächte ohne Ablauf in den Stammdaten (Endschacht, Projektgrenze) werden gemeldet – dort legt der Inspekteur den Auslauf am Foto fest.
- **Export**: Abgabeformat pro Projekt wählbar – genau das, was der jeweilige Auftraggeber verlangt:

  | Format | Besonderheiten |
  |---|---|
  | ISYBAU XML-2006 | alter Namensraum, Liegenschaft Pflicht, ohne Datensatz-Index; Kodiersystem als DIN EN 13508-2:2003/DWA-M 149-2 (die Version kennt die Ausgabe 2011 noch nicht) |
  | ISYBAU XML-2013 | alter Namensraum, Liegenschaft Pflicht, Kodiersystem 9 (DWA) oder 10 (BFR) |
  | ISYBAU XML-2017 | Namensraum bfr-abwasser.de, Datensatz-Index, Drainage-Kennzeichen |
  | ISYBAU XML-2024 | zusätzlich Erfassungsart (KI-Vorschläge = „Assistenzsystem“) |
  | DWA-M 150 Typ B | je Schacht KG (Stammdaten) + KI (Inspektion) + KZ (Zustände), Referenztabellen, Dezimalkomma, Datum TT.MM.JJJJ |

  Automatisch erzeugt werden Inspektionsanfang/-ende (DDB A/B), Anschlüsse als DCA+DCG-Paare, Streckenfeststellungen (A/B mit laufender Nummer), Übersichtsfoto als DDA, Fotodateinamen nach Konvention. Jeder ISYBAU-Export ist in den automatischen Tests **gegen das offizielle XSD-Schema seiner Version validiert** (BFR- und DWA-Kodierung). Für DWA-M 150 gibt es kein öffentliches XSD; Aufbau und Schlüssel folgen der offiziellen DWA-Beispieldatei.
- Empfehlung vor dem ersten echten Projekt: einen Export mit der Prüfsoftware des Auftraggebers (z. B. PIETS) gegenprüfen lassen.

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

## 8. Stand des Prototyps

- Frontend: Projekte, Import, Schachtliste mit GPS, Inspektion (Foto/Uhr, Anschlüsse, Befunde, Kopfdaten), Plausibilität, Export, Protokoll, Einstellungen, Offline.
- Server: Einrichtung, Login, Benutzerverwaltung, Sync, Fotos, KI-Route.
- Tests: Unit-Tests (Import ISYBAU und DWA-M 150, Export mit XSD-Validierung 2006/2013/2017/2024, DWA-M-150-Struktur, Regeln, ZIP, Koordinaten, Laser-Eingaben), Server-Tests (SQLite, inkl. Mandantentrennung und KI-Anfrageformat), Browser-Tests (kompletter Ablauf auf Handy-Größe inkl. Export in drei Formaten und Sync Handy → PC).

## 9. Roadmap (Vorschlag)

**Phase 1 – Praxistest (2–4 Wochen)**
- Mit 1–2 Inspekteuren an echten Schächten testen, Bedienung nachschärfen.
- Erstes echtes Projekt: Export beim Auftraggeber prüfen lassen.
- Auf IONOS installieren, Team-Server einrichten.

**Phase 2 – Ausbau**
- Zustandsbewertung/Schadensklassen (ISYBAU-Bewertung bzw. DWA-M 149-3) und Bewertungsfelder im Export.
- Import vorhandener Zustandsdaten (Vorinspektionen zum Vergleich).
- DWA-M 149-2 in der aktuellen Ausgabe: DWA-spezifische Charakterisierungen ergänzen, die über die BFR-Liste hinausgehen.
- Kartenansicht der Schächte, mehrere Übersichtsfotos (z. B. Schachtkamera/360°).
- Auftraggeber-Profile (Pflichtfelder, Bezugspunkte, Fotokonventionen).

**Phase 3 – Für andere Firmen**
- Selbstregistrierung von Firmen, Lizenz/Abrechnung, Mandanten-Admin.
- Eigenes KI-Modell aus den gesammelten, kodierten Fotos.
