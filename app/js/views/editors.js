// Editoren für Befunde (Kodierung) und Anschlüsse.

import { h, clear, btn, icon, sheet, toast, field, numInput, select, toggle, segmented, pills, confirmDialog } from '../core/ui.js';
import { CODES, GROUPS, FAVORITES, c1Options, c2Options, quantDef, fullCode } from '../data/codes.js';
import { REF } from '../data/reflists.js';
import { clockPicker } from '../components/clockpicker.js';
import { shaftPicker, suggestBereich } from '../components/shaft.js';
import { validateFinding } from '../isybau/validate.js';
import { bothDepths } from '../isybau/model.js';
import { uid, fmtNum } from '../core/util.js';
import { addPhoto, photoUrl, deletePhoto } from '../core/store.js';
import { pickPhoto, processPhoto } from '../lib/image.js';

// ---- Vertikale Lage --------------------------------------------------------
export function lageInput(insp, mode, value, onChange, { label = 'Vertikale Lage' } = {}) {
  let m = mode || 'oben';
  let v = value ?? '';
  const out = h('div', { class: 'field-hint' });
  const upd = () => {
    const d = bothDepths(insp, m, v);
    out.textContent = v === '' ? 'Abstand in Metern, z. B. 1,25'
      : `= ${fmtNum(d.oben)} m unter OK Deckel · ${fmtNum(d.unten)} m über Sohle (Auslauf)`;
  };
  const inp = numInput(v, (val) => { v = val; upd(); onChange(m, v); }, { placeholder: '0,00', unit: 'm' });
  upd();
  return h('div', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    segmented(m, [['oben', 'ab OK Deckel ↓'], ['unten', 'über Sohle ↑']], (nm) => { m = nm; upd(); onChange(m, v); }, { small: true }),
    h('div', { class: 'input-unit' }, inp, h('span', { class: 'unit' }, 'm')),
    out);
}

function issuesBox(list) {
  if (!list.length) return h('div', { class: 'issue', style: { background: 'var(--ok-soft)', color: 'var(--ok)' } }, icon('check', 18), h('span', 'Plausibel – keine Hinweise.'));
  return h('div', { class: 'issues' }, list.map((x) => h('div', { class: ['issue', x.level] }, icon(x.level === 'error' ? 'alert' : 'info', 18), h('span', x.msg))));
}

// ---- Kode-Auswahl ----------------------------------------------------------
export function codePicker(onPick, { exclude = ['DCA', 'DCG'] } = {}) {
  let q = '';
  let group = '';
  const list = h('div', { class: 'code-list' });
  const groupsEl = h('div', { class: 'chips' });
  const entries = Object.entries(CODES).filter(([k]) => !exclude.includes(k));
  const row = ([k, d]) => h('button', { class: 'code-row', type: 'button', onclick: () => onPick(k) },
    h('span', { class: 'bar', style: { background: GROUPS[d.group].color } }),
    h('span', { class: 'code-chip' }, k),
    h('span', { class: 'grow' }, h('div', { style: { fontWeight: 650 } }, d.name), d.desc ? h('div', { class: 'muted small ellipsis' }, d.desc) : null));
  const render = () => {
    clear(groupsEl, [['', 'Alle'], ...Object.entries(GROUPS).map(([k, g]) => [k, g.short])].map(([k, t]) =>
      h('button', { class: ['chip', group === k && 'active'], onclick: () => { group = k; render(); } }, t)));
    const ql = q.trim().toLowerCase();
    let items = entries.filter(([k, d]) => (!group || d.group === group)
      && (!ql || k.toLowerCase().startsWith(ql) || d.name.toLowerCase().includes(ql) || (d.desc || '').toLowerCase().includes(ql)
        || (d.c1 || []).some((c) => c.t.toLowerCase().includes(ql))));
    if (!ql && !group) {
      const fav = FAVORITES.filter((k) => !exclude.includes(k)).map((k) => [k, CODES[k]]);
      clear(list, h('div', { class: 'section-title', style: { marginTop: '4px' } }, 'Häufig'), fav.map(row),
        h('div', { class: 'section-title' }, 'Alle Kodes'), items.map(row));
    } else clear(list, items.length ? items.map(row) : h('p', { class: 'muted' }, 'Kein Kode gefunden.'));
  };
  const search = h('div', { class: 'search' }, icon('search', 20), h('input', {
    class: 'input', type: 'search', placeholder: 'Kode oder Begriff, z. B. „DAB“ oder „Riss“',
    oninput: (e) => { q = e.target.value; render(); },
  }));
  render();
  return h('div', { class: 'stack' }, search, groupsEl, list);
}

// ---- Befund-Editor ---------------------------------------------------------
export function openFindingEditor({ insp, project, finding, onSave, onDelete, presetCode }) {
  const isNew = !finding;
  let f = finding ? structuredClone(finding) : null;
  const s = sheet({ title: isNew ? 'Neuer Befund' : 'Befund bearbeiten', body: h('div'), wide: true });

  const start = (code) => {
    f = f || {
      id: uid(), code, c1: '', c2: '', q1: '', q2: '', clockFrom: null, clockTo: null,
      bereich: CODES[code].defaultBereich || '', lageMode: 'oben', lageValue: CODES[code].atTop ? 0 : '',
      strecke: false, lageEndValue: '', verbindung: false, kommentar: '', photoId: null, source: 'manual',
    };
    if (f.code !== code) Object.assign(f, { code, c1: '', c2: '', q1: '', q2: '' });
    const only = c1Options(code, REF);
    if (only.length === 1 && !f.c1) f.c1 = only[0].k;
    renderForm();
  };

  function renderForm() {
    const def = CODES[f.code];
    const c2Box = h('div');
    const qBox = h('div');
    const issues = h('div');
    const photoBox = h('div');
    const streckeBox = h('div');

    const refresh = () => clear(issues, issuesBox(validateFinding(f, insp, { kodiersystem: project.kodiersystem })));
    const renderC2 = () => {
      const opts = c2Options(f.code, f.c1);
      if (f.c2 && !opts.some((o) => o.k === f.c2)) f.c2 = '';
      if (opts.length === 1 && def.c2req && !f.c2) f.c2 = opts[0].k;
      clear(c2Box, opts.length ? field(`Charakterisierung 2${def.c2req ? '' : ' (optional)'}`, pills(f.c2, opts, (v) => { f.c2 = v; refresh(); }, { allowNone: !def.c2req })) : null);
    };
    const renderQ = () => {
      const q1 = quantDef(f.code, f.c1, 1), q2 = quantDef(f.code, f.c1, 2);
      if (!q1) f.q1 = '';
      if (!q2) f.q2 = '';
      const qf = (q, key) => field(`${q.label}${q.req ? '' : ' (optional)'}`,
        h('div', { class: 'input-unit' }, numInput(f[key], (v) => { f[key] = v; refresh(); }, { placeholder: q.dec ? '0,0' : '0', unit: q.unit === 'mm' || q.unit === 'm' ? q.unit : undefined }), h('span', { class: 'unit' }, q.unit)));
      clear(qBox, q1 || q2 ? h('div', { class: 'grid2' }, q1 ? qf(q1, 'q1') : null, q2 ? qf(q2, 'q2') : null) : null);
    };
    const renderStrecke = () => clear(streckeBox, f.strecke
      ? lageInput(insp, f.lageMode, f.lageEndValue, (m, v) => { f.lageEndValue = v; refresh(); }, { label: `Ende der Strecke (${f.lageMode === 'oben' ? 'ab OK Deckel' : 'über Sohle'})` })
      : null);
    const renderPhoto = async () => {
      if (!f.photoId) {
        clear(photoBox, h('div', { class: 'row wrap' },
          btn('Foto aufnehmen', { icon: 'camera', onClick: () => takePhoto(true) }),
          btn('Aus Galerie', { icon: 'image', variant: 'ghost', onClick: () => takePhoto(false) })));
        return;
      }
      const url = await photoUrl(f.photoId);
      clear(photoBox, h('div', { class: 'row' }, h('img', { src: url, class: 'thumb', style: { width: '96px', height: '96px' }, alt: 'Foto zum Befund' }),
        btn('Entfernen', { icon: 'trash', variant: 'ghost', small: true, onClick: () => { f.photoId = null; renderPhoto(); refresh(); } })));
    };
    const takePhoto = async (camera) => {
      const file = await pickPhoto({ camera });
      if (!file) return;
      const p = await addPhoto(insp, await processPhoto(file), 'finding');
      f.photoId = p.id;
      renderPhoto();
      refresh();
    };

    const c1s = c1Options(f.code, REF);
    const c1Ctl = def.c1Ref
      ? select(f.c1, [['', '– Werkstoff wählen –'], ...REF[def.c1Ref]], (v) => { f.c1 = v; refresh(); })
      : pills(f.c1, c1s, (v) => { f.c1 = v; renderC2(); renderQ(); refresh(); });

    const body = h('div', { class: 'stack' },
      h('div', { class: 'row' },
        h('span', { class: 'code-chip', style: { borderColor: GROUPS[def.group].color, color: GROUPS[def.group].color } }, f.code),
        h('div', { class: 'grow' }, h('h3', def.name), h('div', { class: 'muted small' }, GROUPS[def.group].name)),
        isNew ? btn('Kode ändern', { small: true, variant: 'ghost', onClick: () => { f = null; pickStep(); } }) : null),
      def.desc || def.hint ? h('div', { class: 'issue', style: { background: 'var(--primary-soft)', color: 'var(--text)' } }, icon('info', 18),
        h('div', null, def.desc ? h('div', def.desc) : null, def.hint ? h('div', { class: 'muted small', style: { marginTop: '4px' } }, def.hint) : null)) : null,
      c1s.length || def.c1Ref ? field('Charakterisierung 1', c1Ctl) : null,
      c2Box, qBox,
      def.lage !== 'none' ? field(`Lage am Umfang${def.lage === 'req' ? '' : ' (optional)'}`, clockPicker({ from: f.clockFrom, to: f.clockTo },
        (v) => { f.clockFrom = v.from; f.clockTo = v.to; refresh(); },
        { markers: (insp.connections || []).filter((c) => c.clock).map((c) => ({ hour: c.clock, color: c.dir === 'out' ? 'var(--ok)' : 'var(--c-inv)' })) })) : null,
      lageInput(insp, f.lageMode, f.lageValue, (m, v) => {
        f.lageMode = m; f.lageValue = v;
        if (!f.bereich && v !== '' && insp.tiefe) {
          const d = bothDepths(insp, m, v);
          if (d.oben != null) { f.bereich = suggestBereich(d.oben / Number(insp.tiefe)); }
        }
        renderStrecke(); refresh();
      }, { label: f.strecke ? 'Beginn (vertikale Lage)' : 'Vertikale Lage' }),
      toggle(!!f.strecke, (v) => { f.strecke = v; renderStrecke(); refresh(); }, 'Streckenfeststellung (Ausdehnung > 0,50 m)'),
      streckeBox,
      field(`Schachtbereich${def.bereich === 'req' ? '' : ' (optional)'}`, shaftPicker(f.bereich, (v) => { f.bereich = v; refresh(); })),
      def.group === 'A' || def.group === 'B' || def.verbindung ? toggle(!!f.verbindung, (v) => { f.verbindung = v; refresh(); }, 'Feststellung an einer Verbindung (Fuge)') : null,
      f.code === 'DCB' ? h('div', { class: 'grid2' },
        field('Sanierungsbezeichnung', h('input', { class: 'input', value: f.sanBez || '', placeholder: 'SAN1', maxlength: 5, oninput: (e) => { f.sanBez = e.target.value; refresh(); } })),
        field('Verfahren', select(f.sanVerfahren || '', [['', '–'], ...REF.U133], (v) => { f.sanVerfahren = v; }))) : null,
      f.code === 'DAK' && f.c1 === 'Z' ? field('Zustand im sanierten Bereich', select(f.sanZustand || '', [['', '–'], ...REF.U131], (v) => { f.sanZustand = v; })) : null,
      def.drainage ? toggle(!!f.drainage, (v) => { f.drainage = v; }, 'Zulauf aus Drainage erkennbar') : null,
      field('Anmerkung', h('textarea', { class: 'input', rows: 2, maxlength: 500, placeholder: 'Kurz und prägnant …', oninput: (e) => { f.kommentar = e.target.value; refresh(); } }, f.kommentar || '')),
      field('Foto zum Befund', photoBox),
      f.source === 'ai' ? h('div', { class: 'issue', style: { background: 'var(--surface-2)' } }, icon('sparkles', 18),
        h('span', `Vorschlag des KI-Assistenten${f.aiConfidence ? ` (Sicherheit ${Math.round(f.aiConfidence * 100)} %)` : ''} – bitte prüfen.${f.aiReason ? ' Begründung: ' + f.aiReason : ''}`)) : null,
      h('div', { class: 'section-title' }, 'Prüfung'),
      issues);

    renderC2(); renderQ(); renderStrecke(); renderPhoto(); refresh();
    s.setBody(body);
    s.setTitle(`${fullCode(f) || f.code} – ${def.name}`);
    s.setActions([
      !isNew ? btn('Löschen', { icon: 'trash', variant: 'ghost', onClick: async () => {
        if (await confirmDialog('Diesen Befund löschen?', { ok: 'Löschen', danger: true })) {
          if (f.photoId) await deletePhoto(f.photoId);
          s.close(); onDelete && onDelete(f);
        }
      } }) : null,
      btn('Speichern', { icon: 'check', variant: 'primary', onClick: () => {
        const errs = validateFinding(f, insp, { kodiersystem: project.kodiersystem }).filter((x) => x.level === 'error');
        if (errs.length) toast(`Gespeichert mit ${errs.length} offenen Punkt(en).`, 'info');
        s.close(); onSave(f);
      } })]);
  }

  function pickStep() {
    s.setTitle('Kode wählen');
    s.setActions([]);
    s.setBody(codePicker((code) => start(code)));
    setTimeout(() => s.el.querySelector('input[type=search]')?.focus(), 250);
  }

  if (f) renderForm();
  else if (presetCode) start(presetCode);
  else pickStep();
  return s;
}

// ---- Anschluss-Editor ------------------------------------------------------
export function openConnectionEditor({ insp, conn, onSave, onDelete }) {
  const isNew = !conn;
  const c = conn ? structuredClone(conn) : {
    id: uid(), dir: 'in', clock: null, dn: '', dnB: '', form: 'A', dca: 'B', dcaC2: '', bereich: 'J',
    lageMode: 'unten', lageValue: '', kommentar: '', isReference: false,
  };
  const issues = h('div');
  const dcaC2Box = h('div');
  const refresh = () => {
    const list = [];
    if (!c.clock) list.push({ level: 'error', msg: 'Lage am Umfang (Uhrzeit) fehlt.' });
    if (c.dn === '' || c.dn == null) list.push({ level: 'warn', msg: 'Nennweite fehlt.' });
    if (c.lageValue === '' || c.lageValue == null) list.push({ level: 'error', msg: 'Höhenlage fehlt.' });
    clear(issues, issuesBox(list));
  };
  const renderC2 = () => clear(dcaC2Box, c.dca === 'A' ? field('Gestaltung des Auftritts', pills(c.dcaC2, c2Options('DCA', 'A'), (v) => { c.dcaC2 = v; })) : null);
  const body = h('div', { class: 'stack' },
    field('Richtung', segmented(c.dir, [['in', '↘ Zulauf'], ['out', '↗ Ablauf'], ['closed', '⊘ verschlossen']], (v) => { c.dir = v; })),
    c.pipeName ? h('div', { class: 'muted small' }, `Stammdaten: ${c.pipeName}${c.nachbar ? ' ↔ ' + c.nachbar : ''}${c.material ? ' · ' + c.material : ''}`) : null,
    field('Lage am Umfang', clockPicker({ from: c.clock, to: null }, (v) => { c.clock = v.from; c.clockSet = true; refresh(); }, { allowRange: false })),
    h('div', { class: 'grid2' },
      field('Nennweite / Höhe', h('div', { class: 'input-unit' }, numInput(c.dn, (v) => { c.dn = v; refresh(); }, { placeholder: '300', unit: 'mm' }), h('span', { class: 'unit' }, 'mm'))),
      field('Breite (falls ≠)', h('div', { class: 'input-unit' }, numInput(c.dnB, (v) => { c.dnB = v; }, { unit: 'mm' }), h('span', { class: 'unit' }, 'mm')))),
    field('Querschnitt (DCG)', select(c.form, c1Options('DCG').map((o) => [o.k, `${o.k} – ${o.t}`]), (v) => { c.form = v; })),
    field('Art des Anschlusses (DCA)', select(c.dca, c1Options('DCA').map((o) => [o.k, `${o.k} – ${o.t}`]), (v) => { c.dca = v; renderC2(); })),
    dcaC2Box,
    lageInput(insp, c.lageMode, c.lageValue, (m, v) => { c.lageMode = m; c.lageValue = v; refresh(); }, { label: 'Höhenlage der Rohrsohle' }),
    field('Schachtbereich', select(c.bereich, [['J', 'J – Sohle'], ['I', 'I – Gerinne'], ['H', 'H – Auftritt'], ['F', 'F – untere Schachtzone'], ['C', 'C – Schachtaufbau (Wand)']], (v) => { c.bereich = v; })),
    toggle(!!c.isReference, (v) => { c.isReference = v; }, 'Tiefster Auslauf (Bezug für 12 Uhr und Sohle)'),
    field('Anmerkung', h('textarea', { class: 'input', rows: 2, oninput: (e) => { c.kommentar = e.target.value; } }, c.kommentar || '')),
    issues);
  renderC2();
  refresh();
  const s = sheet({
    title: isNew ? 'Neuer Anschluss' : 'Anschluss bearbeiten', body, wide: true,
    actions: [
      !isNew ? btn('Löschen', { icon: 'trash', variant: 'ghost', onClick: async () => {
        if (await confirmDialog('Diesen Anschluss löschen?', { ok: 'Löschen', danger: true })) { s.close(); onDelete && onDelete(c); }
      } }) : null,
      btn('Speichern', { icon: 'check', variant: 'primary', onClick: () => { s.close(); onSave(c); } }),
    ].filter(Boolean),
  });
  return s;
}
