// Einstieg: Router, Service Worker, Sync-Start.

import { h, clear, btn, toast } from './core/ui.js';
import { navigate, topbar } from './core/shell.js';
import { getSettings } from './core/store.js';
import { sync } from './sync.js';
import { renderProjects } from './views/projects.js';
import { renderProject } from './views/project.js';
import { renderInspection } from './views/inspection.js';
import { renderExport } from './views/export.js';
import { renderSettings } from './views/settings.js';
import { renderReport } from './views/report.js';

const app = document.getElementById('app');
let cleanup = null;
let seq = 0;

async function route() {
  const my = ++seq;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  const parts = path.split('/').filter(Boolean);
  const view = h('div', { class: 'view' });
  clear(app, view);
  window.scrollTo(0, 0);
  try {
    let c;
    if (!parts.length) c = await renderProjects(view);
    else if (parts[0] === 'p' && parts[2] === 'export') c = await renderExport(view, parts[1]);
    else if (parts[0] === 'p') c = await renderProject(view, parts[1], params);
    else if (parts[0] === 's') c = await renderInspection(view, parts[1], params);
    else if (parts[0] === 'r') c = await renderReport(view, parts[1]);
    else if (parts[0] === 'settings') c = await renderSettings(view);
    else return navigate('#/', { replace: true });
    if (my === seq) cleanup = c || null; else if (c) c();
  } catch (e) {
    console.error(e);
    clear(view, topbar({ back: true, title: 'Fehler' }), h('main', { class: 'main' },
      h('div', { class: 'card card-pad stack' }, h('h2', 'Da ist etwas schiefgelaufen'),
        h('p', { class: 'muted' }, String(e.message || e)),
        btn('Zur Startseite', { variant: 'primary', onClick: () => navigate('#/') }))));
  }
}

window.addEventListener('popstate', route);
window.addEventListener('app:route', route);

async function init() {
  const s = await getSettings();
  if (s.theme) document.documentElement.dataset.theme = s.theme;
  await route();
  sync.init();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener('offline', () => toast('Offline – alles wird lokal gespeichert.', 'info'));
}

init();
