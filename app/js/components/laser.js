// Oberfläche für den Bluetooth-Laser: Statusknopf in der Kopfzeile, Karte in den Einstellungen und ein
// kleiner „Laser verbinden“-Knopf bei den Maßfeldern. Die Verbindung selbst steckt in core/laser.js.

import { h, clear, btn, icon, toast, field, numInput } from '../core/ui.js';
import { laserMoeglich, laserZustand, laserVerbinden, laserNeuVerbinden, laserTrennen, feldWert } from '../core/laser.js';

const STATUS = { aus: 'nicht verbunden', verbinde: 'verbinde …', verbunden: 'verbunden', getrennt: 'getrennt' };

/** Verbinden mit Fehlermeldung als Toast; Abbruch im Auswahl-Dialog bleibt still. */
export async function laserKoppeln({ neu = false } = {}) {
  try {
    const ok = await (neu ? laserNeuVerbinden() : laserVerbinden());
    const z = laserZustand();
    if (ok) toast(`Laser verbunden: ${z.name}. Maßfeld antippen, am Gerät messen.`, 'ok', 4000);
    else toast(`Laser nicht verbunden: ${z.fehler || 'unbekannter Fehler'}`, 'error', 5000);
  } catch (e) {
    if (e?.name === 'NotFoundError' || /cancel/i.test(e?.message || '')) return; // Auswahl abgebrochen
    toast(e.message || String(e), 'error', 5000);
  }
}

function anLaser(el, fn) {
  const upd = (e) => { if (!el.isConnected && el.dataset.montiert) { window.removeEventListener('app:laser', upd); return; } fn(e?.detail || laserZustand()); };
  window.addEventListener('app:laser', upd);
  requestAnimationFrame(() => { el.dataset.montiert = '1'; });
  upd();
  return el;
}

/** Statusknopf in der Kopfzeile – nur sichtbar, solange ein Laser gekoppelt ist. */
export function laserAnzeige() {
  const b = h('button', { class: 'btn btn-ghost btn-icon laser-status', 'aria-label': 'Bluetooth-Laser' }, icon('bluetooth', 20));
  b.onclick = () => {
    const z = laserZustand();
    if (z.status === 'getrennt') laserKoppeln({ neu: true });
    else location.hash = '#/settings';
  };
  return anLaser(b, (z) => {
    b.hidden = z.status === 'aus';
    b.className = `btn btn-ghost btn-icon laser-status ${z.status}`;
    b.title = `Laser ${z.name ? `(${z.name}) ` : ''}${STATUS[z.status]}${z.status === 'getrennt' ? ' – antippen zum Neu-Verbinden' : ''}`;
  });
}

/** Kleiner Knopf bei Maßfeldern: „Laser verbinden“ bzw. Status. Ohne Web Bluetooth: nichts. */
export function laserKnopf() {
  if (!laserMoeglich()) return null;
  const wrap = h('div', { class: 'row wrap laser-knopf' });
  return anLaser(wrap, (z) => clear(wrap,
    z.status === 'verbunden'
      ? h('span', { class: 'small laser-ok row' }, icon('bluetooth', 16), `Laser verbunden (${z.name}) – Feld antippen, am Gerät messen`)
      : btn(z.status === 'getrennt' ? 'Laser neu verbinden' : z.status === 'verbinde' ? 'verbinde …' : 'Laser direkt verbinden', {
        icon: 'bluetooth', variant: 'soft', small: true, disabled: z.status === 'verbinde',
        onClick: () => laserKoppeln({ neu: z.status === 'getrennt' }),
      })));
}

/** Karte für die Einstellungen. */
export function laserKarte() {
  const statusEl = h('div', { class: 'stack-sm' });
  const knoepfe = h('div', { class: 'row wrap' });
  const probe = numInput('', () => {}, { unit: 'm', placeholder: 'antippen und am Laser messen' });
  anLaser(statusEl, (z) => {
    clear(statusEl,
      h('div', { class: 'row' }, h('span', { class: `sync-dot ${z.status === 'verbunden' ? 'ok' : z.status === 'verbinde' ? 'busy' : z.status === 'getrennt' ? 'err' : ''}` }),
        h('b', z.name ? `${z.name}: ${STATUS[z.status]}` : `Laser ${STATUS[z.status]}`)),
      z.fehler ? h('div', { class: 'small muted' }, z.fehler) : null,
      z.letzter != null ? h('div', { class: 'small' }, `Letzter Messwert: ${feldWert(z.letzter, 'm')} m`) : null);
    clear(knoepfe,
      z.status === 'verbunden' || z.status === 'getrennt'
        ? [z.status === 'getrennt' ? btn('Neu verbinden', { icon: 'refresh', variant: 'primary', small: true, onClick: () => laserKoppeln({ neu: true }) }) : null,
          btn('Anderes Gerät', { icon: 'bluetooth', variant: 'soft', small: true, onClick: () => laserKoppeln() }),
          btn('Trennen', { icon: 'x', variant: 'ghost', small: true, onClick: () => laserTrennen() })]
        : btn(z.status === 'verbinde' ? 'verbinde …' : 'Laser verbinden', { icon: 'bluetooth', variant: 'primary', small: true, disabled: z.status === 'verbinde', onClick: () => laserKoppeln() }));
  });
  return h('div', { class: 'card card-pad stack' },
    h('h3', 'Laser-Entfernungsmesser (Bluetooth)'),
    h('p', { class: 'small' }, h('b', 'Tastaturmodus – geht überall, auch auf dem iPhone: '),
      'Laser in den Bluetooth-Einstellungen von Handy, Tablet oder PC als Tastatur koppeln (z. B. Leica DISTO X3, X4, D5; Stabila LD 530 BT). In der App ein Maßfeld antippen, am Laser messen – der Wert steht im Feld, der Cursor springt weiter.'),
    h('p', { class: 'small' }, h('b', 'Direkt verbinden (Beta): '),
      'für günstigere Laser ohne Tastaturmodus, z. B. Leica DISTO D1, D110, D2 oder Bosch GLM 50-27 C. Geht in Chrome und Edge auf Android, Windows und Mac – nicht in Safari auf iPhone/iPad.'),
    laserMoeglich()
      ? [statusEl, knoepfe, field('Probemessung', h('div', { class: 'input-unit' }, probe, h('span', { class: 'unit' }, 'm')), 'Feld antippen, am Laser messen. Der Laser trennt sich beim Ausschalten – dann „Neu verbinden“ oder oben auf das Bluetooth-Symbol tippen.')]
      : h('p', { class: 'muted small row' }, icon('info', 16), h('span', 'Dieser Browser kann Laser nicht direkt verbinden – bitte den Tastaturmodus nutzen oder die App in Chrome bzw. Edge öffnen.')));
}

// Messwert ohne aktives Maßfeld: anzeigen statt verwerfen
if (typeof window !== 'undefined') {
  window.addEventListener('app:laserwert', (e) => {
    if (!e.detail.eingetragen) toast(`Laser: ${feldWert(e.detail.meter, 'm')} m – zum Übernehmen zuerst ein Maßfeld antippen.`, 'info', 4000);
  });
}
