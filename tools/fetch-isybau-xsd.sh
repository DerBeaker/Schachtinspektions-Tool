#!/usr/bin/env bash
# Lädt die offiziellen ISYBAU-XML-Schemas (BFR Abwasser) nach .cache/isybau-xsd und die
# bewerteten Beispieldaten 2024 nach .cache/isybau-samples. Die Tests validieren damit den
# Export (xmllint) und gleichen die Zustandsbewertung mit den offiziellen Ergebnissen ab.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=.cache/isybau-xsd
mkdir -p "$DEST"
BASE=https://www.bfr-abwasser.de/Materialien/Beispiele
fetch() { # url zielordner
  local tmp; tmp=$(mktemp)
  curl -fsSL -o "$tmp" "$1"
  mkdir -p "$2"
  unzip -o -q -j "$tmp" '*.xsd' -d "$2"
  rm -f "$tmp"
  # ältere Schemas verweisen mit Windows-Pfaden (".\datei.xsd") aufeinander
  sed -i 's#schemaLocation="\.\\#schemaLocation="./#' "$2"/*.xsd
  sleep 1
}
fetch "$BASE/BeispieldatensaetzeXML2006/ISYBAU_XML_2006_Schema_Beispieldaten.zip" "$DEST/2006"
fetch "$BASE/BeispieldatensaetzeXML2013/ISYBAU_XML_2013_Schema_Beispieldaten.zip" "$DEST/2013"
fetch "$BASE/BeispieldatensaetzeXML2017/ISYBAU_XML_2017_Schema_Beispieldaten.zip" "$DEST/2017"
fetch "$BASE/XML-Schema-Dateien-2024/XML-Schema_ISYBAU_2024.zip" "$DEST/2024"
# bewertete Beispieldaten 2024 (Stammdaten + Zustandsdaten mit Klassifizierung/Bewertung)
SAMPLES=.cache/isybau-samples/2024
mkdir -p "$SAMPLES"
tmp=$(mktemp)
curl -fsSL -o "$tmp" "$BASE/XML-Schema-Dateien-2024/ISYBAU_XML_2024_Schema_Beispieldaten.zip"
unzip -o -q -j "$tmp" '2_Stammdaten/ISYBAU_XML-2024-Stammdaten.xml' '3_Zustandsdaten/*bewertet*.xml' -d "$SAMPLES"
rm -f "$tmp"
ls "$DEST"/* "$SAMPLES"
