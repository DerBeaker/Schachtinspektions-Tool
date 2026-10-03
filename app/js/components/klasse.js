// Anzeige von Zustandsklassen (BFR Abwasser A-3): Einzelschadensklassen 1–5 je Schutzziel
// und Objektklasse 0–5 des Schachts. Farben von grün (0) bis dunkelrot (5).

import { h } from '../core/ui.js';
import { ZIELE, ZIEL_NAME, OBJEKTKLASSEN } from '../isybau/bewertung.js';

export function klasseBadge(k, { text, title } = {}) {
  if (k == null) return null;
  return h('span', { class: ['kl', `kl-${k}`], title: title || OBJEKTKLASSEN[k] || '' }, text ?? `Klasse ${k}`);
}

/** Einzelschadensklassen eines Befundes, z. B. „D3 · B1*“ (* = pauschal). */
export function befundKlassen(kl, { leer = null } = {}) {
  const parts = ZIELE.filter((z) => kl?.[z]).map((z) => klasseBadge(kl[z].k, {
    text: `${z}${kl[z].k}${kl[z].pauschal ? '*' : ''}`,
    title: `${ZIEL_NAME[z]}: vorläufige Einzelschadensklasse ${kl[z].k}${kl[z].pauschal ? ' (pauschale Einordnung – vom Fachingenieur zu prüfen)' : ''}`,
  }));
  return parts.length ? h('span', { class: 'kl-row' }, parts) : leer;
}

/** Objektklasse mit Bedeutung als kompakter Block. */
export function objektklasseBlock(b) {
  if (!b) return null;
  return h('div', { class: 'row', style: { gap: '12px', alignItems: 'center' } },
    h('span', { class: ['kl', 'kl-big', `kl-${b.OK}`] }, String(b.OK)),
    h('div', { class: 'grow' },
      h('b', `Objektklasse ${b.OK}`),
      h('div', { class: 'muted small' }, OBJEKTKLASSEN[b.OK])));
}
