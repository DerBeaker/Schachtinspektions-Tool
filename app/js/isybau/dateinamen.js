// Dateinamen für den Export: Fotos (Verweis „Fotodatei“ in ISYBAU bzw. KZ009/KI118 in DWA-M 150 und
// Datei im ZIP) und Schachtprotokolle (PDF je Schacht). Die Namen entstehen aus einem Muster mit
// Platzhaltern; das Übersichtsfoto von oben ist immer das erste Foto eines Schachts (Nr. 001).

export const PLATZHALTER = [
  ['{Schacht}', 'Schachtnummer'],
  ['{Datum}', 'Inspektionsdatum (JJJJMMTT)'],
  ['{Nr}', 'Fotonummer im Schacht (001 = Übersichtsfoto)'],
  ['{LfdNr}', 'Fotonummer im ganzen Export (0001 …)'],
  ['{Kode}', 'Inspektionskode (DDA = Übersichtsfoto)'],
  ['{Bericht}', 'Berichtnummer'],
  ['{Auftrag}', 'Auftragsnummer'],
  ['{Strasse}', 'Straße'],
  ['{Projekt}', 'Projektname'],
];

export const FOTO_STANDARD = '{Schacht}-{Nr}';
export const FOTO_MUSTER = [
  ['{Schacht}-{Nr}', 'BFR-Standard'],
  ['{Schacht}_{Datum}_{Nr}', 'Schacht, Datum, Nr.'],
  ['{Schacht}_{Datum}_{Bericht}_{Nr}', 'Schacht, Datum, Bericht, Nr.'],
  ['{Auftrag}_{Schacht}_{Nr}', 'Auftrag, Schacht, Nr.'],
  ['{Schacht}_{Kode}_{Nr}', 'Schacht, Kode, Nr.'],
];

export const BERICHT_STANDARD = 'Schachtprotokoll_{Schacht}_{Datum}';
export const BERICHT_MUSTER = [
  ['Schachtprotokoll_{Schacht}_{Datum}', 'Schachtprotokoll, Schacht, Datum'],
  ['{Schacht}_{Datum}_{Bericht}', 'Schacht, Datum, Bericht'],
  ['{Bericht}_{Schacht}', 'Bericht, Schacht'],
  ['{Auftrag}_{Schacht}_{Datum}', 'Auftrag, Schacht, Datum'],
];

const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** Für Dateinamen taugliche Zeichen: Umlaute umschreiben, Sonderzeichen und Leerraum zu „_“. */
export function dateiTeil(s) {
  return String(s ?? '')
    .replace(/[äöüÄÖÜß]/g, (c) => UMLAUTE[c])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
}

const datumKurz = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10).replace(/-/g, '') : '');

/** Muster mit Werten füllen (Platzhalter ohne Groß-/Kleinschreibung); leere Werte fallen samt Trenner weg. */
export function musterAnwenden(muster, werte) {
  const map = Object.fromEntries(Object.entries(werte).map(([k, v]) => [k.toLowerCase(), v == null ? '' : String(v)]));
  const roh = String(muster || '').replace(/\{([A-Za-z]+)\}/g, (_, k) => dateiTeil(map[k.toLowerCase()] ?? ''));
  return dateiTeil(roh.replace(/([_-])[_-]+/g, '$1')).slice(0, 200);
}

/** Werte eines Schachts für die Platzhalter. */
export function schachtWerte({ project = {}, manhole = {}, inspection = {} }) {
  return {
    schacht: manhole.name || '',
    datum: datumKurz(inspection.datum),
    bericht: inspection.berichtNr || '',
    auftrag: project.auftragNummer || '',
    strasse: manhole.strasse || '',
    projekt: project.name || '',
  };
}

/**
 * Vergibt die Fotonamen für einen ganzen Export. Je Schacht `fuer(...)` aufrufen; `name(photoId, kode)`
 * liefert den Dateinamen (gleiches Foto = gleicher Name). Namen sind im ganzen Export eindeutig.
 */
export function fotoBenenner({ muster = FOTO_STANDARD, project = {} } = {}) {
  const vergeben = new Set();
  let lfd = 0;
  const alle = [];
  const eindeutig = (basis) => {
    let n = basis || 'Foto';
    for (let i = 2; vergeben.has(n.toLowerCase()); i++) n = `${basis}_${i}`;
    vergeben.add(n.toLowerCase());
    return n;
  };
  return {
    fuer(manhole, inspection = {}) {
      const map = new Map();
      const werte = schachtWerte({ project, manhole, inspection });
      return {
        name(photoId, kode = '') {
          if (!photoId) return null;
          if (!map.has(photoId)) {
            lfd += 1;
            const basis = musterAnwenden(muster, { ...werte, nr: String(map.size + 1).padStart(3, '0'), lfdnr: String(lfd).padStart(4, '0'), kode });
            const file = `${eindeutig(basis)}.jpg`;
            map.set(photoId, file);
            alle.push({ id: photoId, file });
          }
          return map.get(photoId);
        },
        entries: () => [...map.entries()].map(([id, file]) => ({ id, file })),
      };
    },
    alle: () => alle.slice(),
  };
}

/** Dateinamen der Schachtprotokolle (je Schacht ein PDF), eindeutig im ZIP. */
export function berichtNamen(items, { muster = BERICHT_STANDARD, project = {} } = {}) {
  const vergeben = new Set();
  return items.map(({ manhole, inspection }) => {
    const basis = musterAnwenden(muster, schachtWerte({ project, manhole, inspection })) || 'Schachtprotokoll';
    let n = basis;
    for (let i = 2; vergeben.has(n.toLowerCase()); i++) n = `${basis}_${i}`;
    vergeben.add(n.toLowerCase());
    return `${n}.pdf`;
  });
}

/** Schachtnamen, die im Export mehrfach vorkommen (ohne Groß-/Kleinschreibung, ohne Leerraum am Rand). */
export function doppelteSchaechte(items) {
  const zaehler = new Map();
  for (const { manhole } of items) {
    const k = String(manhole.name || '').trim().toLowerCase();
    zaehler.set(k, [...(zaehler.get(k) || []), String(manhole.name || '').trim()]);
  }
  return [...zaehler.values()].filter((v) => v.length > 1).map((v) => v[0]);
}

/**
 * Berichtnummern vergeben, wo noch keine steht: fortlaufend nach der höchsten vorhandenen Nummer im
 * Projekt, in der Reihenfolge der übergebenen Inspektionen. Liefert die geänderten Inspektionen.
 */
export function berichtNummernVergeben(alleInspektionen, zuVergeben) {
  let max = 0;
  for (const i of alleInspektionen) {
    const n = /^\d+$/.test(String(i.berichtNr || '')) ? Number(i.berichtNr) : 0;
    if (n > max) max = n;
  }
  const geaendert = [];
  for (const i of zuVergeben) {
    if (String(i.berichtNr || '').trim()) continue;
    i.berichtNr = String(++max).padStart(3, '0');
    geaendert.push(i);
  }
  return geaendert;
}
