// Inspektion eines Schachts: Foto mit Uhr, Anschlüsse, Befunde (Kodierung), Kopfdaten.

import { h, clear, btn, icon, sheet, toast, menu, field, input, numInput, select, toggle, segmented, confirmDialog, badge, empty } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import {
  getManhole, getProject, openOrCreateInspection, saveInspection, deleteInspection,
  addPhoto, photoUrl, getPhoto, getSettings, saveManhole,
} from '../core/store.js';
import { CODES, GROUPS, codeLabel, fullCode, FAVORITES, quantDef } from '../data/codes.js';
import { REF, refLabel } from '../data/reflists.js';
import { photoView } from '../components/photoview.js';
import { shaftOverview } from '../components/shaft.js';
import { openFindingEditor, openConnectionEditor, defaultLageMode } from './editors.js';
import { validateInspection } from '../isybau/validate.js';
import { bothDepths, connectionsFromStamm } from '../isybau/model.js';
import { pickPhoto, processPhoto } from '../lib/image.js';
import { circleFrom3, estimateDepth } from '../lib/depth.js';
import { debounce, fmtNum, fmtM, clockLabel, uid, num } from '../core/util.js';
import { navUrl } from '../lib/geo.js';
import { runAiAnalysis, aiAvailable } from './ai.js';

const TABS = [['foto', 'Foto', 'camera'], ['anschluesse', 'Anschlüsse', 'target'], ['befunde', 'Befunde', 'list'], ['daten', 'Daten', 'file']];

export async function renderInspection(view, manholeId, params) {
  const manhole = await getManhole(manholeId);
  if (!manhole) { navigate('#/', { replace: true }); return; }
  const project = await getProject(manhole.projectId);
  const insp = await openOrCreateInspection(manholeId);
  let tab = params.t || (insp.overview?.photoId ? 'befunde' : 'foto');
  let pv = null;
  let pvMode = 'view';

  const persist = debounce(async () => { await saveInspection(insp); }, 400);
  const changed = (rerender = true) => {
    if (insp.status === 'offen') insp.status = 'inArbeit';
    persist();
    if (rerender) renderAll();
  };

  const tabsEl = h('nav', { class: 'tabs', role: 'tablist' });
  const main = h('main', { class: 'main' });
  const bottom = h('div', { class: 'bottombar' });
  const fab = h('div');

  clear(view,
    topbar({
      back: `#/p/${project.id}`, title: `Schacht ${manhole.name}`,
      sub: [manhole.strasse, insp.tiefe ? `Tiefe ${fmtM(insp.tiefe)}` : null].filter(Boolean).join(' · '),
      actions: [btn('', { icon: 'more', variant: 'ghost', aria: 'Mehr', onClick: moreMenu })],
    }),
    tabsEl, main, fab, bottom);

  function renderAll() {
    const v = validateInspection(insp, { kodiersystem: project.kodiersystem });
    const counts = { anschluesse: insp.connections.length, befunde: insp.findings.length };
    const errTab = {
      foto: !insp.overview?.photoId,
      anschluesse: insp.connections.some((c) => !c.clock || c.lageValue === '' || c.lageValue == null),
      befunde: Object.values(v.byFinding).some((l) => l.some((x) => x.level === 'error')),
      daten: !insp.datum || insp.tiefe === '' || insp.tiefe == null,
    };
    clear(tabsEl, TABS.map(([k, t, ic]) => h('button', {
      class: ['tab', tab === k && 'active'], role: 'tab', 'aria-selected': tab === k ? 'true' : 'false',
      onclick: () => { tab = k; history.replaceState(null, '', `#/s/${manholeId}?t=${k}`); renderAll(); window.scrollTo(0, 0); },
    }, icon(ic, 18), h('span', t), counts[k] ? h('span', { class: 'count' }, String(counts[k])) : null, errTab[k] ? h('span', { class: 'dot', title: 'unvollständig' }) : null)));

    clear(fab);
    if (tab === 'foto') renderFoto();
    else if (tab === 'anschluesse') renderConnections();
    else if (tab === 'befunde') renderFindings(v);
    else renderData();
    renderBottom(v);
  }

  // ------------------------------------------------------------------ Bottom
  function renderBottom(v) {
    const done = insp.status === 'fertig';
    clear(bottom, h('div', { class: 'inner' },
      h('button', { class: 'btn btn-ghost grow', style: { justifyContent: 'flex-start' }, onclick: () => showIssues(v) },
        v.errors ? h('span', { class: 'badge badge-err' }, `${v.errors} Fehler`)
          : v.warnings ? h('span', { class: 'badge badge-warn' }, `${v.warnings} ${v.warnings === 1 ? 'Hinweis' : 'Hinweise'}`)
            : h('span', { class: 'badge badge-ok' }, '✓ plausibel'),
        icon('chevron', 16)),
      done
        ? btn('Wieder öffnen', { icon: 'edit', onClick: () => { insp.status = 'inArbeit'; changed(); } })
        : btn('Abschließen', { icon: 'check', variant: 'primary', onClick: async () => {
          if (v.errors && !(await confirmDialog(`Es gibt noch ${v.errors} Fehler. Trotzdem abschließen? Der ISYBAU-Export kann dann unvollständig sein.`, { ok: 'Trotzdem abschließen' }))) return;
          insp.status = 'fertig';
          persist.flush();
          toast(`Schacht ${manhole.name} abgeschlossen.`, 'ok');
          navigate(`#/p/${project.id}`);
        } })));
  }

  function showIssues(v) {
    const items = [
      ...v.general.map((x) => ({ ...x, where: 'Allgemein' })),
      ...insp.findings.flatMap((f) => (v.byFinding[f.id] || []).map((x) => ({ ...x, where: fullCode(f), f }))),
    ];
    const s = sheet({
      title: 'Prüfung', body: items.length ? h('div', { class: 'issues' }, items.map((x) => h('button', {
        class: ['issue', x.level], style: { border: 0, textAlign: 'left', cursor: x.f ? 'pointer' : 'default' },
        onclick: () => { if (x.f) { s.close(); editFinding(x.f); } },
      }, icon(x.level === 'error' ? 'alert' : 'info', 18), h('span', null, h('b', x.where + ': '), x.msg)))) : h('p', { class: 'muted' }, 'Alles plausibel.'),
    });
  }

  // ------------------------------------------------------------------ Foto
  async function renderFoto() {
    const ovUrl = insp.overview?.photoId ? await photoUrl(insp.overview.photoId) : null;
    const photo = ovUrl ? await getPhoto(insp.overview.photoId) : null;
    if (tab !== 'foto') return;
    if (!photo) {
      clear(main, h('div', { class: 'layout-2' },
        h('div', { class: 'capture-cta' },
          h('button', { class: 'big', onclick: () => takeOverview(true), 'aria-label': 'Foto aufnehmen' }, icon('camera', 42)),
          h('h2', 'Foto von oben aufnehmen'),
          h('p', { class: 'muted' }, 'Handy waagerecht über die Schachtöffnung halten. Tiefsten Auslauf möglichst oben im Bild (12 Uhr) – das Ausrichten geht danach auch per Fingerzug.'),
          btn('Foto aus Galerie wählen', { icon: 'image', variant: 'ghost', onClick: () => takeOverview(false) })),
        howTo()));
      return;
    }
    pv = photoView({
      url: ovUrl, width: photo.width, height: photo.height, clock: insp.overview.clock, connections: insp.connections, mode: pvMode,
      onClockChange: (c) => { insp.overview.clock = c; changed(false); syncSliders(); },
      onTap: (t) => (pvMode === 'connect' ? assignConnection(t.hour) : measureTap(t)),
    });
    const rot = h('input', { type: 'range', min: 0, max: 359, value: Math.round(insp.overview.clock.rot), oninput: (e) => { insp.overview.clock.rot = +e.target.value; pv.setClock(insp.overview.clock); rotV.textContent = `${e.target.value}°`; changed(false); } });
    const rad = h('input', { type: 'range', min: 5, max: 75, value: Math.round(insp.overview.clock.r * 100), oninput: (e) => { insp.overview.clock.r = +e.target.value / 100; pv.setClock(insp.overview.clock); changed(false); } });
    const rotV = h('span', { class: 'muted' }, `${Math.round(insp.overview.clock.rot)}°`);
    function syncSliders() { rot.value = Math.round(insp.overview.clock.rot); rad.value = Math.round(insp.overview.clock.r * 100); rotV.textContent = `${rot.value}°`; }

    const modeCtl = segmented(pvMode, [['view', 'Ansehen'], ['align', 'Uhr ausrichten'], ['connect', 'Anschluss setzen']], (m) => {
      pvMode = m; pv.setMode(m); sliders.hidden = m !== 'align';
    });
    const sliders = h('div', { class: 'card card-pad stack-sm', hidden: pvMode !== 'align' },
      h('div', { class: 'slider-row' }, h('span', 'Drehung'), rot, rotV),
      h('div', { class: 'slider-row' }, h('span', 'Radius'), rad, h('span')));

    const side = h('div', { class: 'stack' },
      connectionSummary(),
      h('div', { class: 'row wrap' },
        btn('Neues Foto', { icon: 'camera', small: true, onClick: () => takeOverview(true) }),
        btn('Tiefe schätzen', { icon: 'ruler', small: true, onClick: startMeasure }),
        aiAvailable() ? btn('KI-Analyse', { icon: 'sparkles', small: true, variant: 'soft', onClick: aiFlow }) : null),
      howTo(true));
    clear(main, h('div', { class: 'layout-2' }, h('div', { class: 'stack' }, pv.el, modeCtl, sliders), side));
  }

  function howTo(compact) {
    return h('div', { class: 'card card-pad stack-sm' },
      h('h3', 'So geht’s'),
      h('ol', { class: 'muted small', style: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' } },
        h('li', 'Foto senkrecht von oben aufnehmen (Blitz/Lampe hilft).'),
        h('li', '„Uhr ausrichten“: Kreis auf die Schachtwand legen, grünen 12-Uhr-Griff auf den tiefsten Auslauf ziehen.'),
        h('li', '„Anschluss setzen“: auf jede Rohröffnung tippen – die Uhrzeit wird übernommen.'),
        h('li', 'Tiefen und Befunde in den Reitern „Anschlüsse“ und „Befunde“ erfassen.')),
      compact ? null : h('p', { class: 'muted small' }, 'Anschlüsse aus den Stammdaten sind bereits vorbelegt (Lage aus der Leitungsgeometrie berechnet) – bitte am Foto prüfen.'));
  }

  function connectionSummary() {
    if (!insp.connections.length) return h('div', { class: 'card card-pad muted small' }, 'Noch keine Anschlüsse – im Modus „Anschluss setzen“ auf die Rohröffnungen tippen.');
    return h('div', { class: 'card card-pad stack-sm' }, h('h3', 'Anschlüsse'),
      insp.connections.map((c) => h('div', { class: 'row small' },
        icon(c.dir === 'out' ? 'outflow' : c.dir === 'closed' ? 'closed' : 'inflow', 18),
        h('span', { class: 'grow' }, `${c.dir === 'out' ? 'Ablauf' : c.dir === 'closed' ? 'verschlossen' : 'Zulauf'} ${c.pipeName || ''}`),
        h('b', c.clock ? `${c.clock} Uhr` : '– Uhr'),
        c.clockFromStamm && !c.clockSet ? badge('aus Stammdaten', 'info') : null)));
  }

  async function takeOverview(camera) {
    const file = await pickPhoto({ camera });
    if (!file) return;
    toast('Foto wird verarbeitet …');
    const processed = await processPhoto(file);
    const p = await addPhoto(insp, processed, 'overview');
    insp.overview = { photoId: p.id, clock: insp.overview?.clock || { cx: 0.5, cy: 0.5, r: 0.36, rot: 0 } };
    pvMode = 'align';
    changed();
    toast('Jetzt die Uhr auf den Schacht ausrichten.', 'info', 4000);
  }

  function assignConnection(hour) {
    const dist = (c) => (c.clock ? Math.min(Math.abs(c.clock - hour), 12 - Math.abs(c.clock - hour)) : 6.5) + (c.isReference && hour !== 12 ? 10 : 0);
    const open = insp.connections.filter((c) => !c.clockSet).sort((a, b) => dist(a) - dist(b));
    const s = sheet({
      title: `Anschluss bei ${hour} Uhr`,
      body: h('div', { class: 'menu' },
        open.map((c) => h('button', { class: 'menu-item', onclick: () => { c.clock = hour; c.clockSet = true; s.close(); changed(); } },
          icon(c.dir === 'out' ? 'outflow' : 'inflow'),
          h('div', null, h('div', `${c.dir === 'out' ? 'Ablauf' : 'Zulauf'} ${c.pipeName || ''}${c.dn ? ' · DN ' + c.dn : ''}`),
            h('div', { class: 'muted small' }, c.clock ? `bisher ${c.clock} Uhr${c.clockFromStamm ? ' (aus Stammdaten berechnet)' : ''}` : 'noch keine Lage')))),
        h('button', { class: 'menu-item', onclick: () => {
          s.close();
          openConnectionEditor({ insp, conn: { id: uid(), dir: 'in', clock: hour, clockSet: true, dn: '', dnB: '', form: 'A', dca: 'B', dcaC2: '', bereich: 'J', lageMode: defaultLageMode(), lageValue: '', kommentar: '' },
            onSave: (c) => { insp.connections.push(c); changed(); } });
        } }, icon('plus'), h('div', null, h('div', 'Neuer Anschluss'), h('div', { class: 'muted small' }, 'nicht in den Stammdaten'))),
        insp.connections.filter((c) => c.clockSet).length ? h('div', { class: 'section-title' }, 'Bereits zugeordnet') : null,
        insp.connections.filter((c) => c.clockSet).map((c) => h('button', { class: 'menu-item', onclick: () => { c.clock = hour; s.close(); changed(); } },
          icon('refresh'), h('span', `${c.dir === 'out' ? 'Ablauf' : 'Zulauf'} ${c.pipeName || ''} (${c.clock} Uhr) hierher verschieben`)))),
    });
  }

  // Tiefenschätzung (experimentell)
  let measure = null;
  function startMeasure() {
    measure = { stage: 'top', top: [], bottom: [] };
    pvMode = 'measure';
    pv.setMode('measure');
    pv.setAnnotations([], 'Tippe 3 Punkte auf den Rand der Schachtöffnung (Rahmen innen)');
    toast('Tiefe schätzen: zuerst 3 Punkte auf den oberen Rand tippen.', 'info', 4500);
  }
  async function measureTap(t) {
    if (!measure) return;
    measure[measure.stage].push(t);
    const anns = [];
    const circ = (pts) => (pts.length === 3 ? circleFrom3(...pts) : null);
    for (const k of ['top', 'bottom']) {
      measure[k].forEach((p) => anns.push({ type: 'point', ...p, color: k === 'top' ? '#f59e0b' : '#22d3ee' }));
      const c = circ(measure[k]);
      if (c) anns.push({ type: 'circle', ...c, color: k === 'top' ? '#f59e0b' : '#22d3ee' });
    }
    if (measure.stage === 'top' && measure.top.length === 3) measure.stage = 'bottom';
    pv.setAnnotations(anns, measure.stage === 'top' ? `Oberer Rand: ${measure.top.length}/3` : `Jetzt 3 Punkte unten an der Schachtwand (Höhe Auftritt): ${measure.bottom.length}/3`);
    if (measure.bottom.length === 3) {
      const photo = await getPhoto(insp.overview.photoId);
      const top = circ(measure.top), bot = circ(measure.bottom);
      measure = null;
      if (!top || !bot || bot.r >= top.r * 1.5) { toast('Kreise nicht plausibel – bitte erneut versuchen.', 'error'); pvMode = 'view'; pv.setMode('view'); pv.setAnnotations([]); return; }
      depthDialog({ top, bot, photo });
    }
  }
  function depthDialog({ top, bot, photo }) {
    const d = { dTop: Math.round((manhole.deckel?.dn || 0.625) * 1000), dBottom: Math.round((manhole.schacht?.unterteilDn || manhole.schacht?.dn || 1) * 1000) || 1000 };
    const out = h('div');
    const calc = () => {
      const r = estimateDepth({ top, bottom: bot, dTop: d.dTop, dBottom: d.dBottom, width: photo.width, height: photo.height, f35: photo.exif?.f35 });
      const ref = insp.connections.find((c) => c.isReference) || insp.connections.find((c) => c.dir === 'out');
      const dnOut = ref?.dn ? Number(ref.dn) / 1000 : 0;
      d.result = r; d.total = Math.round((r.depth + dnOut) * 100) / 100;
      clear(out, h('div', { class: 'card card-pad stack-sm' },
        h('div', { class: 'row between' }, h('span', 'Rand oben → Auftritt'), h('b', `${fmtNum(r.depth)} m ± ${fmtNum(r.tolerance)}`)),
        dnOut ? h('div', { class: 'row between' }, h('span', `+ Auslauf DN ${ref.dn} (Auftritt ≈ Rohrscheitel)`), h('b', `≈ ${fmtNum(d.total)} m bis Sohle`)) : null,
        h('div', { class: 'muted small' }, `Brennweite ${r.focal35} mm${r.focalGuessed ? ' (geschätzt – keine EXIF-Daten)' : ' (aus EXIF)'} · Kamera ${fmtNum(r.camToTop)} m über dem Rand.`),
        h('div', { class: 'issue warn' }, icon('alert', 18), h('span', 'Schätzung aus dem Foto – nur zur Plausibilitätskontrolle. Für ISYBAU bitte mit Messlatte oder Laser aufmessen.'))));
    };
    const s = sheet({
      title: 'Tiefe aus dem Foto (experimentell)',
      body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' },
          field('Ø oben (lichte Weite)', h('div', { class: 'input-unit' }, numInput(d.dTop, (v) => { d.dTop = num(v) || 625; calc(); }), h('span', { class: 'unit' }, 'mm'))),
          field('Ø unten (Schacht-DN)', h('div', { class: 'input-unit' }, numInput(d.dBottom, (v) => { d.dBottom = num(v) || 1000; calc(); }), h('span', { class: 'unit' }, 'mm')))),
        out),
      actions: [
        btn('Verwerfen', { variant: 'ghost', onClick: () => s.close() }),
        btn('Als Schachttiefe übernehmen', { variant: 'primary', onClick: async () => {
          if (insp.tiefe && !(await confirmDialog(`Vorhandene Schachttiefe ${fmtM(insp.tiefe)} durch den Schätzwert ${fmtM(d.total)} ersetzen?`))) return;
          insp.tiefe = d.total; insp.tiefeQuelle = 'foto'; s.close(); changed();
        } }),
      ],
      onClose: () => { pvMode = 'view'; if (pv) { pv.setMode('view'); pv.setAnnotations([]); } },
    });
    calc();
  }

  async function aiFlow() {
    await photoUrl(insp.overview.photoId); // ggf. vom Server nachladen
    const photo = await getPhoto(insp.overview.photoId);
    const res = await runAiAnalysis({ insp, manhole, project, photo });
    if (!res) return;
    let added = 0;
    for (const f of res.findings) { insp.findings.push(f); added++; }
    for (const c of res.connections) {
      const match = insp.connections.find((x) => !x.clockSet && x.dir === c.dir);
      if (match) { match.clock = c.clock; match.aiClock = true; } else insp.connections.push(c);
    }
    changed();
    if (added || res.connections.length) toast(`${added} Befund-Vorschläge übernommen – bitte prüfen.`, 'ok', 5000);
  }

  // ------------------------------------------------------------------ Anschlüsse
  function renderConnections() {
    const list = insp.connections;
    const fromStamm = (manhole.pipes || []).length && !list.some((c) => c.fromStamm);
    clear(main, h('div', { class: 'stack' },
      list.length ? h('div', { class: 'list' }, list.map((c) => {
        const d = bothDepths(insp, c.lageMode, c.lageValue);
        return h('button', { class: ['item', 'conn', c.dir], onclick: () => openConnectionEditor({
          insp, conn: c,
          onSave: (nc) => { Object.assign(c, nc); if (nc.isReference) list.forEach((x) => { if (x !== c) x.isReference = false; }); changed(); },
          onDelete: () => { insp.connections = list.filter((x) => x !== c); changed(); },
        }) },
        h('div', { class: 'item-icon' }, icon(c.dir === 'out' ? 'outflow' : c.dir === 'closed' ? 'closed' : 'inflow')),
        h('div', { class: 'grow' },
          h('div', { class: 'row between' },
            h('b', `${c.dir === 'out' ? 'Ablauf' : c.dir === 'closed' ? 'Verschlossen' : 'Zulauf'}${c.pipeName ? ' ' + c.pipeName : ''}`),
            h('span', { class: 'mono', style: { fontWeight: 800, fontSize: '1.05rem' } }, c.clock ? `${c.clock} Uhr` : '– Uhr')),
          h('div', { class: 'meta' },
            h('span', c.dn ? `DN ${c.dn}${c.dnB ? '/' + c.dnB : ''}` : 'DN fehlt'),
            h('span', c.lageValue !== '' && c.lageValue != null ? `${fmtNum(d.oben)} m ab Deckel · ${fmtNum(d.unten)} m ü. Sohle` : 'Höhe fehlt'),
            c.isReference ? badge('Bezug 12 Uhr', 'ok') : null,
            c.fromStamm ? badge(c.clockSet ? 'Stammdaten ✓' : 'aus Stammdaten', 'info') : null,
            c.aiClock ? badge('KI', 'ai') : null)),
        icon('chevron', 18));
      })) : h('div', { class: 'card' }, empty('target', 'Keine Anschlüsse', 'Im Foto-Reiter auf die Rohröffnungen tippen oder hier manuell anlegen.')),
      h('div', { class: 'row wrap' },
        btn('Anschluss hinzufügen', { icon: 'plus', variant: 'soft', onClick: () => openConnectionEditor({ insp, onSave: (c) => { insp.connections.push(c); changed(); } }) }),
        fromStamm ? btn('Aus Stammdaten übernehmen', { icon: 'download', onClick: () => { insp.connections.push(...connectionsFromStamm(manhole, uid)); changed(); } }) : null),
      h('p', { class: 'muted small' }, 'Pro Anschluss werden beim Export automatisch die Kodes DCA (Anschluss) und DCG (Anschlussleitung) erzeugt. Lage am Umfang: Draufsicht, tiefster Auslauf = 12 Uhr.')));
  }

  // ------------------------------------------------------------------ Befunde
  function findingItems() {
    return insp.findings.map((f) => {
      const d = bothDepths(insp, f.lageMode, f.lageValue);
      return { f, code: f.code, depthFromTop: d.oben, label: fullCode(f) };
    });
  }

  function editFinding(f) {
    openFindingEditor({
      insp, project, finding: f,
      onSave: (nf) => { Object.assign(f, nf); changed(); },
      onDelete: () => { insp.findings = insp.findings.filter((x) => x.id !== f.id); changed(); },
    });
  }
  function addFinding(code) {
    openFindingEditor({ insp, project, presetCode: code, onSave: (nf) => { insp.findings.push(nf); changed(); } });
  }

  async function renderFindings(v) {
    const items = findingItems().sort((a, b) => (a.depthFromTop ?? 99) - (b.depthFromTop ?? 99));
    const listEl = h('div', { class: 'list' });
    for (const it of items) {
      const f = it.f;
      const def = CODES[f.code] || {};
      const iss = v.byFinding[f.id] || [];
      const errs = iss.filter((x) => x.level === 'error').length;
      const thumb = f.photoId ? h('img', { class: 'thumb', alt: '' }) : null;
      if (thumb) photoUrl(f.photoId).then((u) => { if (u) thumb.src = u; });
      const q = [[f.q1, quantDef(f.code, f.c1, 1)], [f.q2, quantDef(f.code, f.c1, 2)]]
        .filter(([x, d]) => x !== '' && x != null && d).map(([x, d]) => `${String(x).replace('.', ',')} ${d.unit}`).join(' / ');
      listEl.append(h('button', { class: ['item', 'finding', `g-${def.group}`], onclick: () => editFinding(f) },
        h('div', { class: 'grow' },
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
            h('span', { class: 'code-chip' }, fullCode(f)),
            f.source === 'ai' ? badge('KI-Vorschlag', 'ai') : null,
            errs ? badge(`${errs} Fehler`, 'err') : iss.length ? badge('Hinweis', 'warn') : null),
          h('div', { style: { fontWeight: 600, marginTop: '4px' } }, codeLabel(f)),
          h('div', { class: 'meta' },
            h('span', it.depthFromTop != null ? `${fmtNum(it.depthFromTop)} m ab Deckel` : 'Lage fehlt'),
            f.clockFrom ? h('span', clockLabel(f.clockFrom, f.clockTo)) : null,
            f.bereich ? h('span', `Bereich ${f.bereich}`) : null,
            q ? h('span', q) : null,
            f.strecke ? h('span', 'Strecke') : null),
          f.kommentar ? h('div', { class: 'muted small ellipsis', style: { marginTop: '2px' } }, f.kommentar) : null),
        thumb));
    }
    const favs = h('div', { class: 'chips' }, FAVORITES.slice(0, 10).map((k) => h('button', { class: 'chip', onclick: () => addFinding(k), title: CODES[k].name },
      h('span', { class: 'mono', style: { color: GROUPS[CODES[k].group].color } }, k), CODES[k].name)));

    clear(main, h('div', { class: 'layout-2' },
      h('div', { class: 'card card-pad sticky stack-sm', style: { order: window.innerWidth >= 980 ? 0 : 2 } },
        h('div', { class: 'row between' }, h('h3', 'Schachtschnitt'), h('span', { class: 'muted small' }, `${items.length} Befunde`)),
        shaftOverview(items, { tiefe: insp.tiefe, onSelect: (it) => editFinding(it.f) })),
      h('div', { class: 'stack' },
        h('div', null, h('div', { class: 'section-title', style: { marginTop: 0 } }, 'Schnell erfassen'), favs),
        items.length ? listEl : h('div', { class: 'card' }, empty('list', 'Noch keine Befunde', 'Mängelfreier Schacht? Dann einfach abschließen – Anfang/Ende (DDB) und Anschlüsse werden automatisch exportiert.')))));
    clear(fab, h('button', { class: 'fab', onclick: () => addFinding(), 'aria-label': 'Befund hinzufügen', style: { bottom: 'calc(86px + env(safe-area-inset-bottom))' } }, icon('plus', 24), h('span', 'Befund')));
  }

  // ------------------------------------------------------------------ Daten
  function renderData() {
    const set = (k) => (val) => { insp[k] = val; changed(false); };
    const stamm = manhole.source === 'isybau' || manhole.source === 'm150';
    clear(main, h('div', { class: 'layout-2' },
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Inspektion'),
        h('div', { class: 'grid2' },
          field('Datum', input(insp.datum, set('datum'), { type: 'date' })),
          field('Uhrzeit', input(insp.uhrzeit, set('uhrzeit'), { type: 'time' }))),
        field('Inspekteur', input(insp.inspekteur, set('inspekteur'), { autocomplete: 'name' })),
        h('div', { class: 'grid2' },
          field('Wetter', select(insp.wetter, REF.U106, set('wetter'))),
          field('Temperatur', h('div', { class: 'input-unit' }, numInput(insp.temperatur, set('temperatur')), h('span', { class: 'unit' }, '°C')))),
        field('Wasserhaltung', select(insp.wasserhaltung, REF.U107, set('wasserhaltung'))),
        toggle(!!insp.reinigung, set('reinigung'), 'Reinigung vor der Inspektion'),
        field('Inspektionsverfahren', select(insp.verfahren, REF.U108, set('verfahren'))),
        field('Bemerkung zur Inspektion', h('textarea', { class: 'input', rows: 2, oninput: (e) => set('bemerkung')(e.target.value) }, insp.bemerkung || '')),
        field('Abschlussbemerkung (DDB B)', h('textarea', { class: 'input', rows: 2, placeholder: 'z. B. „Schacht ist mängelfrei“', oninput: (e) => set('schlussbemerkung')(e.target.value) }, insp.schlussbemerkung || ''))),
      h('div', { class: 'stack' },
        h('div', { class: 'card card-pad stack' },
          h('h3', 'Tiefe & Bezug'),
          field('Schachttiefe (OK Deckel bis Sohle tiefster Auslauf)', h('div', { class: 'input-unit' },
            numInput(insp.tiefe, (val) => { insp.tiefe = val === '' ? null : Number(val); insp.tiefeQuelle = 'gemessen'; changed(false); }, { unit: 'm' }), h('span', { class: 'unit' }, 'm')),
          insp.tiefeQuelle === 'stamm' ? `aus Stammdaten${manhole.tiefe != null ? ' (' + fmtM(manhole.tiefe) + ')' : ''} – bei Abweichung gemessenen Wert eintragen`
            : insp.tiefeQuelle === 'foto' ? 'aus Foto geschätzt – bitte nachmessen' : insp.tiefeQuelle === 'gemessen' ? 'gemessen' : null),
          field('Höhenangaben im Export', segmented(insp.bezugVertikal || '1', [['1', 'von unten ↑'], ['2', 'von oben ↓']], (val) => { insp.bezugVertikal = val; changed(); }),
            (() => {
              const t = insp.tiefe != null && insp.tiefe !== '' ? `${fmtNum(insp.tiefe)} m` : 'Schachttiefe';
              return insp.bezugVertikal === '2'
                ? `Anfang am Deckel = 0,00 m, Ende an der Sohle = ${t}. Eingaben „ab Deckel“ oder „über Sohle“ werden umgerechnet.`
                : `Anfang an der Sohle (tiefster Auslauf) = 0,00 m, Ende am Deckel = ${t}. Eingaben „ab Deckel“ oder „über Sohle“ werden umgerechnet.`;
            })()),
          h('p', { class: 'muted small row' }, icon('info', 16), h('span', 'Laser mit Bluetooth-Tastaturmodus: Feld antippen, am Gerät messen – der Wert wird eingetragen (auch „2345 mm“ oder „2,345 m“), Enter springt weiter.')),
          h('div', { class: 'grid2' },
            field('Innenschutz', select(insp.innenschutz, [['', '–'], ...REF.G103], set('innenschutz'))),
            field('Auskleidung', select(insp.artAuskleidung, [['', '–'], ...REF.U114], set('artAuskleidung'))))),
        h('div', { class: 'card card-pad stack-sm' },
          h('div', { class: 'row between' }, h('h3', 'Stammdaten'), manhole.wgs ? h('a', { class: 'btn btn-sm btn-soft', href: navUrl(manhole.wgs), target: '_blank', rel: 'noopener' }, icon('nav', 16), 'Navigation') : null),
          stamm ? h('dl', { class: 'kv' },
            h('dt', 'Straße'), h('dd', manhole.strasse || '–'),
            h('dt', 'Deckelhöhe'), h('dd', manhole.deckelhoehe != null ? `${fmtNum(manhole.deckelhoehe, 3)} m` : '–'),
            h('dt', 'Sohlhöhe'), h('dd', manhole.sohlhoehe != null ? `${fmtNum(manhole.sohlhoehe, 3)} m` : '–'),
            h('dt', 'Tiefe (Stamm)'), h('dd', fmtM(manhole.tiefe)),
            h('dt', 'Schacht'), h('dd', [manhole.schacht?.dn ? `DN ${Math.round(manhole.schacht.dn * 1000)}` : null, manhole.schacht?.material ? refLabel('G102', manhole.schacht.material) : null].filter(Boolean).join(', ') || '–'),
            h('dt', 'Abwasser'), h('dd', refLabel('G101', manhole.entwaesserungsart) || '–'),
            h('dt', 'Baujahr'), h('dd', manhole.baujahr || '–'),
            h('dt', 'Koordinaten'), h('dd', { class: 'mono small' }, manhole.x ? `${fmtNum(manhole.x, 2)} / ${fmtNum(manhole.y, 2)}` : '–'))
            : h('p', { class: 'muted small' }, 'Manuell angelegter Schacht (keine Stammdaten).'),
          !stamm ? field('Straße', input(manhole.strasse, async (val) => { manhole.strasse = val; await saveManhole(manhole); })) : null))));
  }

  // ------------------------------------------------------------------ Menü
  function moreMenu() {
    menu([
      { label: 'Schachtprotokoll (Drucken/PDF)', icon: 'printer', onClick: () => { persist.flush(); navigate(`#/r/${insp.id}`); } },
      aiAvailable() && insp.overview?.photoId ? { label: 'KI-Analyse des Fotos', icon: 'sparkles', onClick: aiFlow } : null,
      manhole.wgs ? { label: 'Navigation zum Schacht', icon: 'nav', onClick: () => window.open(navUrl(manhole.wgs), '_blank', 'noopener') } : null,
      { label: 'Inspektion verwerfen', icon: 'trash', danger: true, onClick: async () => {
        if (await confirmDialog('Alle Daten und Fotos dieser Inspektion löschen?', { ok: 'Verwerfen', danger: true })) {
          await deleteInspection(insp);
          navigate(`#/p/${project.id}`);
        }
      } },
    ]);
  }

  renderAll();
  return () => persist.flush();
}
