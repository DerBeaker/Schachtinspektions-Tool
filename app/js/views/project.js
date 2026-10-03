// Projektansicht: Schachtliste mit Suche, Filter, GPS-Sortierung.

import { h, clear, btn, icon, sheet, toast, menu, field, input, numInput, select, confirmDialog, empty, badge } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getProject, saveProject, listManholes, addManhole, deleteProject } from '../core/store.js';
import { REF } from '../data/reflists.js';
import { fmtM, num } from '../core/util.js';
import { distance, navUrl } from '../lib/geo.js';
import { importFlow } from './projects.js';
import { validateInspection } from '../isybau/validate.js';
import { EXPORT_FORMATS } from '../isybau/export.js';

const STATUS = { offen: 'offen', inArbeit: 'in Arbeit', fertig: 'fertig' };

export async function renderProject(view, projectId, params) {
  const project = await getProject(projectId);
  if (!project || project.deleted) { navigate('#/', { replace: true }); return; }
  const state = { q: params.q || '', filter: params.f || 'alle', sort: 'name', pos: null, watch: null };
  let manholes = await listManholes(projectId);

  const listEl = h('div', { class: 'list' });
  const statsEl = h('div', { class: 'stat-row' });
  const chipsEl = h('div', { class: 'chips' });
  const main = h('main', { class: 'main' });

  const status = (m) => (m.inspection ? (m.inspection.status === 'fertig' ? 'fertig' : 'inArbeit') : 'offen');

  function renderStats() {
    const c = { offen: 0, inArbeit: 0, fertig: 0 };
    manholes.forEach((m) => c[status(m)]++);
    clear(statsEl,
      h('div', { class: 'stat' }, h('b', String(c.offen)), h('span', 'offen')),
      h('div', { class: 'stat' }, h('b', String(c.inArbeit)), h('span', 'in Arbeit')),
      h('div', { class: 'stat' }, h('b', String(c.fertig)), h('span', 'fertig')));
    clear(chipsEl, [['alle', `Alle ${manholes.length}`], ['offen', 'Offen'], ['inArbeit', 'In Arbeit'], ['fertig', 'Fertig']].map(([k, t]) =>
      h('button', { class: ['chip', state.filter === k && 'active'], onclick: () => { state.filter = k; renderStats(); renderList(); } }, t)),
    h('button', { class: ['chip', state.sort === 'dist' && 'active'], onclick: toggleGps }, icon('nav', 16), state.sort === 'dist' ? 'nach Entfernung' : 'In der Nähe'));
  }

  function renderList() {
    let list = manholes.filter((m) => state.filter === 'alle' || status(m) === state.filter);
    const q = state.q.trim().toLowerCase();
    if (q) list = list.filter((m) => `${m.name} ${m.strasse || ''} ${m.ortsteil || ''}`.toLowerCase().includes(q));
    if (state.sort === 'dist' && state.pos) {
      list = list.map((m) => ({ m, d: m.wgs ? distance(state.pos, m.wgs) : Infinity })).sort((a, b) => a.d - b.d).map((x) => ({ ...x.m, _d: x.d }));
    }
    if (!manholes.length) {
      clear(listEl, h('div', { class: 'card' }, empty('manhole', 'Noch keine Schächte', 'Importiere Stammdaten (ISYBAU oder DWA-M 150) oder lege Schächte manuell an.',
        btn('Stammdaten importieren', { icon: 'upload', variant: 'primary', onClick: () => importFlow(projectId) }),
        btn('Schacht anlegen', { icon: 'plus', onClick: addSheet }))));
      return;
    }
    if (!list.length) { clear(listEl, h('p', { class: 'muted', style: { padding: '20px', textAlign: 'center' } }, 'Keine Treffer.')); return; }
    clear(listEl, list.slice(0, 400).map((m) => {
      const st = status(m);
      const insp = m.inspection;
      const v = insp ? validateInspection(insp, { kodiersystem: project.kodiersystem }) : null;
      return h('div', { class: 'item', role: 'button', tabindex: '0', onclick: () => navigate(`#/s/${m.id}`), onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/s/${m.id}`); } },
        h('span', { class: ['status-dot', st], title: STATUS[st] }),
        h('div', { class: 'grow' },
          h('div', { class: 'row between' },
            h('span', { class: 'mh-name' }, m.name),
            h('span', { class: 'row', style: { gap: '6px' } },
              insp && insp.findings.length ? badge(`${insp.findings.length} Befunde`, 'info') : null,
              v && v.errors ? badge(`${v.errors} Fehler`, 'err') : null,
              st === 'fertig' && v && !v.errors ? badge('fertig', 'ok') : null)),
          h('div', { class: 'meta' },
            m.strasse ? h('span', m.strasse) : null,
            h('span', `Tiefe ${fmtM(insp?.tiefe ?? m.tiefe)}`),
            m.pipes?.length ? h('span', `${m.pipes.length} ${m.pipes.length === 1 ? 'Anschluss' : 'Anschlüsse'}`) : null,
            m._d != null && Number.isFinite(m._d) ? h('span', { style: { color: 'var(--primary)', fontWeight: 700 } }, m._d < 1000 ? `${Math.round(m._d)} m` : `${(m._d / 1000).toFixed(1)} km`) : null)),
        m.wgs ? h('a', { class: 'btn btn-ghost btn-icon', href: navUrl(m.wgs), target: '_blank', rel: 'noopener', title: 'Navigation starten', 'aria-label': 'Navigation', onclick: (e) => e.stopPropagation() }, icon('nav', 20)) : null);
    }));
  }

  function toggleGps() {
    if (state.sort === 'dist') {
      state.sort = 'name';
      if (state.watch != null) navigator.geolocation.clearWatch(state.watch);
      state.watch = null;
      renderStats(); renderList();
      return;
    }
    if (!navigator.geolocation) return toast('GPS wird von diesem Gerät nicht unterstützt.', 'error');
    if (!manholes.some((m) => m.wgs)) return toast('Für dieses Projekt liegen keine Koordinaten vor.', 'error');
    toast('Standort wird ermittelt …');
    state.watch = navigator.geolocation.watchPosition((p) => {
      state.pos = { lat: p.coords.latitude, lon: p.coords.longitude };
      state.sort = 'dist';
      renderStats(); renderList();
    }, (e) => toast('Standort nicht verfügbar: ' + e.message, 'error'), { enableHighAccuracy: true, maximumAge: 10000 });
  }

  function addSheet() {
    const d = { name: '', strasse: '', tiefe: '' };
    const s = sheet({
      title: 'Schacht anlegen',
      body: h('div', { class: 'stack' },
        field('Schachtbezeichnung', input('', (v) => (d.name = v), { placeholder: 'z. B. S1234', autocapitalize: 'characters' })),
        field('Straße', input('', (v) => (d.strasse = v))),
        field('Schachttiefe (m)', numInput('', (v) => (d.tiefe = v), { placeholder: 'Deckel bis Sohle, z. B. 2,35', unit: 'm' }))),
      actions: [btn('Anlegen', { variant: 'primary', onClick: async () => {
        if (!d.name.trim()) return toast('Bezeichnung fehlt.', 'error');
        if (manholes.some((m) => m.name === d.name.trim())) return toast('Diese Bezeichnung gibt es schon.', 'error');
        const m = await addManhole(projectId, { name: d.name.trim(), strasse: d.strasse.trim(), tiefe: num(d.tiefe) });
        s.close();
        navigate(`#/s/${m.id}`);
      } })],
    });
  }

  function editProject() {
    const p = { ...project };
    const s = sheet({
      title: 'Projekt & Auftrag',
      body: h('div', { class: 'stack' },
        field('Projektname', input(p.name, (v) => (p.name = v))),
        field('Ort / Liegenschaft', input(p.ort, (v) => (p.ort = v))),
        field('Auftraggeber', input(p.auftraggeber, (v) => (p.auftraggeber = v), { placeholder: 'z. B. Stadt Musterstadt' })),
        field('Auftragsbezeichnung', input(p.auftragBezeichnung, (v) => (p.auftragBezeichnung = v)), 'Pflichtfeld im ISYBAU-Export (max. 60 Zeichen)'),
        h('div', { class: 'grid2' },
          field('Auftragsnummer', input(p.auftragNummer, (v) => (p.auftragNummer = v))),
          field('Auftragsdatum', input(p.auftragDatum, (v) => (p.auftragDatum = v), { type: 'date' }))),
        field('Inspektionszweck', select(p.zweck, REF.U101, (v) => (p.zweck = v))),
        field('Kodiersystem', select(p.kodiersystem, REF.U102, (v) => (p.kodiersystem = v)),
          'ISYBAU (BFR Abwasser) ist strenger als DWA-M 149-2 – die Hauptkodes sind identisch.'),
        field('Vertikaler Bezugspunkt (Standard für neue Inspektionen)', select(p.bezugVertikal, REF.U115, (v) => (p.bezugVertikal = v))),
        field('Abgabeformat', select(p.exportFormat || '2017-07', EXPORT_FORMATS, (v) => (p.exportFormat = v)), 'Was der Auftraggeber verlangt – im Export änderbar.'),
        h('div', { class: 'grid2' },
          field('Liegenschaft Nr.', input(p.liegenschaftNummer, (v) => (p.liegenschaftNummer = v), { maxlength: 20 })),
          field('Liegenschaft Name', input(p.liegenschaftBezeichnung, (v) => (p.liegenschaftBezeichnung = v), { maxlength: 40 }))),
        h('p', { class: 'muted small' }, 'Liegenschaft ist nur in ISYBAU 2006/2013 Pflicht; leer = Auftragsnummer bzw. Projektname.')),
      actions: [btn('Speichern', { variant: 'primary', onClick: async () => {
        Object.assign(project, p);
        await saveProject(project);
        s.close();
        toast('Gespeichert.', 'ok');
        window.dispatchEvent(new Event('app:route'));
      } })],
    });
  }

  const search = h('div', { class: 'search' }, icon('search', 20), h('input', {
    class: 'input', type: 'search', placeholder: 'Schacht oder Straße suchen …', value: state.q,
    oninput: (e) => { state.q = e.target.value; renderList(); },
  }));

  clear(view,
    topbar({
      back: '#/', title: project.name, sub: [project.ort, project.kodiersystem === '9' ? 'DWA-M 149-2' : 'ISYBAU'].filter(Boolean).join(' · '),
      actions: [
        btn('', { icon: 'download', variant: 'ghost', aria: 'Export', onClick: () => navigate(`#/p/${projectId}/export`) }),
        btn('', { icon: 'more', variant: 'ghost', aria: 'Mehr', onClick: () => menu([
          { label: 'Projekt & Auftragsdaten', icon: 'edit', onClick: editProject },
          { label: 'Stammdaten (nach-)importieren', icon: 'upload', onClick: () => importFlow(projectId) },
          { label: 'Schacht manuell anlegen', icon: 'plus', onClick: addSheet },
          { label: 'Export (ISYBAU / DWA-M 150)', icon: 'download', onClick: () => navigate(`#/p/${projectId}/export`) },
          { label: 'Projekt löschen', icon: 'trash', danger: true, onClick: async () => {
            if (await confirmDialog(`Projekt „${project.name}“ mit allen Inspektionen und Fotos auf diesem Gerät löschen?`, { ok: 'Löschen', danger: true })) {
              await deleteProject(projectId);
              toast('Projekt gelöscht.');
              navigate('#/');
            }
          } },
        ]) }),
      ],
    }),
    main,
    h('button', { class: 'fab', onclick: addSheet, 'aria-label': 'Schacht anlegen' }, icon('plus', 24)));

  main.append(statsEl, h('div', { style: { height: '12px' } }), search, h('div', { style: { height: '10px' } }), chipsEl, h('div', { style: { height: '6px' } }), listEl);
  renderStats();
  renderList();

  const onSynced = async () => { manholes = await listManholes(projectId); renderStats(); renderList(); };
  window.addEventListener('app:synced', onSynced);
  return () => {
    window.removeEventListener('app:synced', onSynced);
    if (state.watch != null) navigator.geolocation.clearWatch(state.watch);
  };
}
