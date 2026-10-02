// Startseite: Projektübersicht, Import, Demo.

import { h, clear, btn, icon, sheet, toast, empty, field, input } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { listProjects, createProject, importIntoProject, getSettings } from '../core/store.js';
import { fmtRelative, readFile } from '../core/util.js';
import { pickFile } from '../lib/image.js';

export async function renderProjects(view) {
  const settings = await getSettings();
  const main = h('main', { class: 'main' });
  clear(view,
    topbar({ brand: true, actions: [btn('', { icon: 'settings', variant: 'ghost', aria: 'Einstellungen', onClick: () => navigate('#/settings') })] }),
    main);

  const projects = await listProjects();
  if (projects.length) view.append(h('button', { class: 'fab', onclick: newProjectSheet, 'aria-label': 'Neues Projekt' }, icon('plus', 24), h('span', 'Projekt')));
  const totals = projects.reduce((a, p) => ({ total: a.total + p.stats.total, fertig: a.fertig + p.stats.fertig, offen: a.offen + p.stats.total - p.stats.fertig }), { total: 0, fertig: 0, offen: 0 });

  const hello = settings.inspector ? `Hallo ${settings.inspector.split(' ')[0]}!` : 'Willkommen!';
  main.append(
    h('section', { class: 'hero' },
      heroArt(),
      h('h2', hello),
      h('p', projects.length
        ? `${totals.offen} Schächte offen, ${totals.fertig} fertig inspiziert.`
        : 'Stammdaten (ISYBAU-XML) importieren, Schacht von oben fotografieren, kodieren und als ISYBAU-Zustandsdaten exportieren.'),
      h('div', { class: 'row wrap', style: { marginTop: '14px' } },
        btn('Stammdaten importieren', { icon: 'upload', variant: 'primary', onClick: () => importFlow() }),
        !projects.length ? btn('Demo ansehen', { icon: 'sparkles', onClick: loadDemo }) : null)),
  );

  if (!projects.length) {
    main.append(h('div', { class: 'card', style: { marginTop: '16px' } },
      empty('folder', 'Noch keine Projekte', 'Lege ein Projekt an oder importiere ISYBAU-Stammdaten. Ohne Stammdaten kannst du Schächte auch manuell anlegen.',
        btn('Leeres Projekt', { icon: 'plus', variant: 'soft', onClick: newProjectSheet }))));
    if (!settings.inspector) main.append(firstRunHint());
    return;
  }

  main.append(h('div', { class: 'section-title' }, 'Projekte'));
  main.append(h('div', { class: 'list grid-cards' }, projects.map((p) => {
    const pct = p.stats.total ? Math.round((p.stats.fertig / p.stats.total) * 100) : 0;
    return h('button', { class: 'item', onclick: () => navigate(`#/p/${p.id}`) },
      h('div', { class: 'item-icon' }, icon('folder')),
      h('div', { class: 'grow' },
        h('div', { class: 'row between' }, h('h3', { class: 'ellipsis' }, p.name), h('span', { class: 'badge' }, `${p.stats.fertig}/${p.stats.total}`)),
        h('div', { class: 'meta' }, p.ort ? h('span', p.ort) : null, h('span', p.kodiersystem === '9' ? 'DWA-M 149-2' : 'ISYBAU'), h('span', fmtRelative(p.updatedAt))),
        h('div', { class: 'progress' }, h('span', { style: { width: pct + '%' } }))),
      icon('chevron', 20));
  })));
}

function heroArt() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 100 100');
  s.setAttribute('class', 'hero-art');
  s.innerHTML = '<g fill="none" stroke="#fff" stroke-width="3"><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="14"/><path d="M50 6v14M50 80v14M6 50h14M80 50h14"/></g>';
  return s;
}

function firstRunHint() {
  return h('div', { class: 'card card-pad row', style: { marginTop: '12px' } },
    h('div', { class: 'item-icon' }, icon('user')),
    h('div', { class: 'grow' }, h('h3', 'Tipp: Name & Firma hinterlegen'), h('p', { class: 'muted small' }, 'Wird automatisch in jede Inspektion und den ISYBAU-Export übernommen.')),
    btn('Einstellungen', { small: true, onClick: () => navigate('#/settings') }));
}

function newProjectSheet() {
  const data = { name: '', ort: '' };
  const s = sheet({
    title: 'Neues Projekt',
    body: h('div', { class: 'stack' },
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => { s.close(); importFlow(); } }, icon('upload'), h('div', null, h('div', 'ISYBAU-Stammdaten importieren'), h('div', { class: 'muted small' }, 'XML-Datei (2006 bis 2024) – Schächte, Tiefen, Anschlüsse'))),
        h('button', { class: 'menu-item', onclick: () => { s.close(); loadDemo(); } }, icon('sparkles'), h('div', null, h('div', 'Demo-Projekt laden'), h('div', { class: 'muted small' }, 'Fiktive Straße mit 8 Schächten zum Ausprobieren')))),
      h('div', { class: 'section-title' }, 'oder leeres Projekt'),
      field('Projektname', input('', (v) => (data.name = v), { placeholder: 'z. B. Kaserne Nord, BA 3' })),
      field('Ort', input('', (v) => (data.ort = v), { placeholder: 'optional' }))),
    actions: [btn('Anlegen', { variant: 'primary', onClick: async () => {
      if (!data.name.trim()) return toast('Bitte einen Projektnamen eingeben.', 'error');
      const p = await createProject({ name: data.name.trim(), ort: data.ort.trim() });
      s.close();
      navigate(`#/p/${p.id}`);
    } })],
  });
}

export async function importFlow(projectId) {
  const file = await pickFile('.xml,text/xml,application/xml');
  if (!file) return;
  try {
    const buf = await readFile(file);
    const r = await importIntoProject(buf, { projectId, fileName: file.name });
    toast(`${r.added} Schächte importiert${r.updated ? `, ${r.updated} aktualisiert` : ''} (ISYBAU ${r.version || '?'}).`, 'ok', 4500);
    for (const w of r.warnings) toast(w, 'info', 5000);
    if (projectId) window.dispatchEvent(new Event('app:route'));
    else navigate(`#/p/${r.project.id}`);
  } catch (e) {
    console.error(e);
    toast('Import fehlgeschlagen: ' + e.message, 'error', 6000);
  }
}

async function loadDemo() {
  try {
    const res = await fetch('./demo/demo-stammdaten.xml');
    const r = await importIntoProject(await res.arrayBuffer(), { fileName: 'Demo Musterweg.xml' });
    r.project.name = 'Demo: Musterweg';
    r.project.ort = 'Beispielstadt';
    r.project.auftragBezeichnung = 'Schachtinspektion Musterweg (Demo)';
    const { saveProject } = await import('../core/store.js');
    await saveProject(r.project);
    toast('Demo-Projekt geladen.', 'ok');
    navigate(`#/p/${r.project.id}`);
  } catch (e) {
    toast('Demo konnte nicht geladen werden: ' + e.message, 'error');
  }
}
