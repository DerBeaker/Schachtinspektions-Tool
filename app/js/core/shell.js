// Navigation und Kopfzeile (von allen Ansichten genutzt).

import { h, btn, icon } from './ui.js';
import { sync } from '../sync.js';

export function navigate(hash, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', hash);
  else if (location.hash !== hash) history.pushState(null, '', hash);
  window.dispatchEvent(new Event('app:route'));
}

export function topbar({ back, title, sub, actions = [], brand = false }) {
  return h('header', { class: 'topbar' },
    back ? btn('', { icon: 'back', variant: 'ghost', aria: 'Zurück', onClick: () => navigate(back === true ? '#/' : back) }) : null,
    brand
      ? h('div', { class: 'brand title' },
        h('div', { class: 'brand-mark' }, icon('manhole', 22)),
        h('div', { class: 'grow' }, h('h1', 'Schachtblick'), h('div', { class: 'sub' }, sub || 'Schachtinspektion nach ISYBAU & DWA')))
      : h('div', { class: 'title' }, h('h1', title), sub ? h('div', { class: 'sub' }, sub) : null),
    syncIndicator(),
    ...actions);
}

function syncIndicator() {
  const dot = h('span', { class: 'sync-dot' });
  const b = h('button', { class: 'btn btn-ghost btn-icon', title: 'Synchronisation', 'aria-label': 'Synchronisation', onclick: () => sync.run({ manual: true }) }, dot);
  let mounted = false;
  let off = () => {};
  const upd = (st) => {
    if (mounted && !b.isConnected) { off(); return; } // Kopfzeile wurde ersetzt
    b.hidden = !st.enabled;
    dot.className = 'sync-dot ' + (st.state === 'busy' ? 'busy' : st.state === 'error' ? 'err' : st.state === 'ok' ? 'ok' : '');
    b.title = st.message || 'Synchronisation';
  };
  upd(sync.status);
  off = sync.subscribe(upd);
  requestAnimationFrame(() => { mounted = true; });
  return b;
}
