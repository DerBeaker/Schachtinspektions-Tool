#!/usr/bin/env bash
# Lädt die offiziellen ISYBAU-XML-Schemas (BFR Abwasser) nach .cache/isybau-xsd
# Sie werden von den Tests zur Validierung des Exports genutzt (xmllint).
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
ls "$DEST"/*
