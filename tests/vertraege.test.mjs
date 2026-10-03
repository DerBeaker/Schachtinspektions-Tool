// Vertragstexte (Nutzungsbedingungen, AVV): Fassungen gleich wie auf dem Server, Pflichtinhalte
// nach Art. 28 Abs. 3 DSGVO vorhanden, PDF mit Annahmenachweis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { AGB, AVV, VERTRAG_VERSION, vertragAlsText } from '../app/js/data/vertraege.js';
import { vertragPdf } from '../app/js/report/vertrag.js';

test('Vertragsfassungen in App und Server stimmen überein', () => {
  const php = readFileSync(new URL('../app/api/lib/konto.php', import.meta.url), 'utf8');
  const m = /const SB_VERTRAG = \['agb' => '([^']+)', 'avv' => '([^']+)'\];/.exec(php);
  assert.ok(m, 'SB_VERTRAG in konto.php nicht gefunden');
  assert.deepEqual({ agb: m[1], avv: m[2] }, VERTRAG_VERSION);
  assert.equal(AGB.version, VERTRAG_VERSION.agb);
  assert.equal(AVV.version, VERTRAG_VERSION.avv);
});

test('AVV enthält die Pflichtinhalte nach Art. 28 Abs. 3 DSGVO', () => {
  const t = vertragAlsText(AVV);
  for (const [was, re] of [
    ['Gegenstand und Dauer', /Gegenstand und Dauer/],
    ['Weisungen', /dokumentierte Weisung/],
    ['Vertraulichkeit', /Vertraulichkeit verpflichtet/],
    ['Sicherheit Art. 32', /Art\. 32 DSGVO/],
    ['Unterauftragsverarbeiter', /Unterauftragsverarbeiter[\s\S]*Art\. 28 Abs\. 4/],
    ['Betroffenenrechte', /Art\. 12 bis 23 DSGVO/],
    ['Art. 32–36', /Art\. 32 bis 36 DSGVO/],
    ['Löschung/Rückgabe', /Löschung und Rückgabe/],
    ['Nachweise/Kontrollen', /Inspektionen/],
    ['Art der Daten', /Art der Daten/],
    ['Betroffene', /Kategorien betroffener Personen/],
    ['TOM', /Anlage 2 – Technische und organisatorische Maßnahmen/],
    ['IONOS', /IONOS SE, Elgendorfer Str\. 57, 56410 Montabaur/],
  ]) assert.match(t, re, was);
});

test('Nutzungsbedingungen: nur Unternehmer, Basis ohne XML-Export, Kündigung', () => {
  const t = vertragAlsText(AGB);
  assert.match(t, /§ 14 BGB/);
  assert.match(t, /XML-Format \(ISYBAU, DWA-M 150\) ist in Schachtblick Basis nicht enthalten/);
  assert.match(t, /jederzeit zum Ende des laufenden Abrechnungsmonats/);
  assert.match(t, /Testzeitraums gebucht, beginnt die Abrechnung erst nach dessen Ende/);
});

test('AVV als PDF mit Vertragsparteien und Annahmenachweis', () => {
  const bytes = vertragPdf(AVV, {
    kunde: { name: 'Muster Kanal GmbH', anschrift: 'Musterweg 1\n12345 Musterstadt' },
    annahme: { am: 1790000000, name: 'Max Muster', funktion: 'Geschäftsführer', email: 'max@example.test', version: '1.0' },
  });
  const s = Buffer.from(bytes).toString('latin1');
  assert.equal(s.slice(0, 5), '%PDF-');
  assert.ok((s.match(/\/Type \/Page\b/g) || []).length >= 2, 'mehrseitig');
  let text = null;
  try { text = execFileSync('pdftotext', ['-', '-'], { input: Buffer.from(bytes) }).toString(); } catch { /* pdftotext fehlt */ }
  if (text) {
    assert.match(text, /Muster Kanal GmbH, Musterweg 1, 12345 Musterstadt/);
    assert.match(text, /durch Max Muster \(Geschäftsführer\)/);
    assert.match(text, /Anlage 3/);
    assert.match(text, /Seite 1 von \d/);
  }
  // ohne Annahme: Hinweis statt Nachweis
  const leer = execFileSyncSafe(vertragPdf(AVV, {}));
  if (leer) assert.match(leer, /Noch nicht angenommen/);
});

function execFileSyncSafe(bytes) {
  try { return execFileSync('pdftotext', ['-', '-'], { input: Buffer.from(bytes) }).toString(); } catch { return null; }
}
