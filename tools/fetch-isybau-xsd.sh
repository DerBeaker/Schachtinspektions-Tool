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
  unzip -o -q -j "$tmp" '*.xsd' -d "$2"
  rm -f "$tmp"
}
fetch "$BASE/BeispieldatensaetzeXML2017/ISYBAU_XML_2017_Schema_Beispieldaten.zip" "$DEST/2017"
fetch "$BASE/XML-Schema-Dateien-2024/XML-Schema_ISYBAU_2024.zip" "$DEST/2024"
ls "$DEST"/2017 "$DEST"/2024
