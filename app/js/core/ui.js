// Kleine UI-Bibliothek: DOM-Builder, Icons, Bottom-Sheets, Toasts, Formularfelder.
import { parseMeasure } from './util.js';

export function h(tag, attrs, ...kids) {
  const el = tag === 'frag' ? document.createDocumentFragment() : document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
  return el;
}

// ---- Icons (eigene, schlichte Strichzeichnungen, 24x24) -------------------
const P = {
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 100-.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM16 16l5 5',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  cloud: 'M7 18h10a4 4 0 00.5-8 6 6 0 00-11.5 1.5A3.3 3.3 0 007 18z',
  cloudOff: 'M3 3l18 18M7 18h10M17.5 10A6 6 0 008 6.3M5.7 11.6A3.3 3.3 0 007 18',
  nav: 'M3 11l18-8-8 18-2-8z',
  pin: 'M12 21s-7-6-7-11a7 7 0 1114 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  ruler: 'M4 16L16 4l4 4L8 20zM8 12l2 2M11 9l2 2M14 6l2 2',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  inflow: 'M17 7L7 17M7 9v8h8',
  outflow: 'M7 17L17 7M9 7h8v8',
  closed: 'M12 21a9 9 0 100-18 9 9 0 000 18zM6 6l12 12',
  printer: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  folder: 'M3 6h6l2 2h10v11H3z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  manhole: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 17a5 5 0 100-10 5 5 0 000 10zM7 12h10M12 7v10',
  wifiOff: 'M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 0110-2.5M2 8.8A15 15 0 0110 5M12 20h.01',
  heart: 'M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.6 1-1.1a5.5 5.5 0 000-7.7z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
};

export function icon(name, size = 22, extra = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', extra.stroke || 2);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name] || P.info);
  svg.appendChild(p);
  return svg;
}

export function btn(label, opts = {}) {
  const { icon: ic, variant = '', onClick, title, type = 'button', small, disabled, block } = opts;
  return h('button', {
    type, title: title || (label ? null : opts.aria), 'aria-label': opts.aria || null,
    class: ['btn', variant && `btn-${variant}`, small && 'btn-sm', block && 'btn-block', !label && 'btn-icon'],
    onclick: onClick, disabled,
  }, ic ? icon(ic, small ? 18 : 20) : null, label ? h('span', label) : null);
}

// ---- Toasts --------------------------------------------------------------
let toastHost;
export function toast(msg, kind = 'info', ms = 2800) {
  if (!toastHost) toastHost = document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast toast-${kind}`, onclick: () => t.remove() }, icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info', 18), h('span', msg));
  while (toastHost.children.length >= 2) toastHost.firstChild.remove();
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  return t;
}

// ---- Sheets (Bottom-Sheet auf dem Handy, Dialog am PC) --------------------
const sheetStack = [];
export function sheet({ title, body, actions = [], wide = false, onClose, dismissable = true }) {
  const close = (val) => {
    const i = sheetStack.indexOf(api);
    if (i >= 0) sheetStack.splice(i, 1);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 220);
    document.removeEventListener('keydown', onKey);
    onClose && onClose(val);
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable && sheetStack[sheetStack.length - 1] === api) close(); };
  const content = h('div', { class: 'sheet-body' }, body);
  const footer = h('div', { class: 'sheet-actions', hidden: !actions.length }, actions);
  const panel = h('div', { class: ['sheet', wide && 'sheet-wide'], role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    h('div', { class: 'sheet-grip' }),
    title ? h('div', { class: 'sheet-head' }, h('h2', title), dismissable ? btn('', { icon: 'x', variant: 'ghost', aria: 'Schließen', onClick: () => close() }) : null) : null,
    content, footer);
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap && dismissable) close(); } }, panel);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  document.addEventListener('keydown', onKey);
  const api = {
    close, el: panel, body: content,
    setBody: (b) => clear(content, b),
    setActions: (a) => { const list = [a].flat().filter(Boolean); clear(footer, list); footer.hidden = !list.length; },
    setTitle: (t) => { const el = panel.querySelector('.sheet-head h2'); if (el) el.textContent = t; },
  };
  sheetStack.push(api);
  return api;
}

export function confirmDialog(message, { title = 'Bitte bestätigen', ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title, body: h('p', { class: 'muted' }, message),
      onClose: () => { if (!done) resolve(false); },
      actions: [
        btn('Abbrechen', { variant: 'ghost', onClick: () => s.close() }),
        btn(ok, { variant: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); s.close(); } }),
      ],
    });
  });
}

export function promptDialog(message, { title = 'Eingabe', value = '', ok = 'OK', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const inp = h('input', { class: 'input', value, placeholder });
    const s = sheet({
      title, body: h('div', { class: 'stack' }, message ? h('p', { class: 'muted' }, message) : null, inp),
      onClose: () => { if (!done) resolve(null); },
      actions: [
        btn('Abbrechen', { variant: 'ghost', onClick: () => s.close() }),
        btn(ok, { variant: 'primary', onClick: () => { done = true; resolve(inp.value.trim()); s.close(); } }),
      ],
    });
    setTimeout(() => inp.focus(), 250);
  });
}

export function menu(anchorItems, { title } = {}) {
  const s = sheet({
    title: title || 'Aktionen',
    body: h('div', { class: 'menu' }, anchorItems.filter(Boolean).map((it) => h('button', {
      class: ['menu-item', it.danger && 'danger'], type: 'button',
      onclick: () => { s.close(); it.onClick(); },
    }, icon(it.icon || 'chevron', 20), h('span', it.label)))),
  });
  return s;
}

// ---- Formularbausteine --------------------------------------------------
export function field(label, control, hint) {
  // <label> nur um einzelne Eingabefelder – sonst leitet der Browser Klicks auf den ersten Button um
  const simple = control instanceof HTMLElement
    && (['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName) || control.classList.contains('input-unit'));
  return h(simple ? 'label' : 'div', { class: 'field', role: simple ? null : 'group', 'aria-label': simple ? null : label },
    h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function input(value, onInput, attrs = {}) {
  return h('input', { class: 'input', value: value ?? '', oninput: (e) => onInput(e.target.value), ...attrs });
}

/** Fokus auf das nächste Eingabefeld im selben Dialog bzw. in derselben Ansicht. */
function focusNext(el) {
  const scope = el.closest('.sheet, form, .main') || document.body;
  const list = [...scope.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([disabled]), select, textarea')]
    .filter((x) => x.offsetParent !== null);
  const next = list[list.indexOf(el) + 1];
  if (next) next.focus(); else el.blur();
}

/**
 * Zahleneingabe mit Dezimalkomma. `unit: 'm'|'mm'` erlaubt Werte mit Einheit (Laser);
 * Enter übernimmt den Wert und springt ins nächste Feld.
 */
export function numInput(value, onInput, { unit, ...attrs } = {}) {
  const show = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  return h('input', {
    class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
    value: show(value),
    oninput: (e) => {
      const v = parseMeasure(e.target.value, unit);
      if (v !== null) onInput(v);
    },
    onchange: (e) => {
      const v = parseMeasure(e.target.value, unit);
      e.target.classList.toggle('invalid', v === null);
      if (v !== null && v !== '') e.target.value = show(v);
    },
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.target.dispatchEvent(new Event('change'));
      focusNext(e.target);
    },
    ...attrs,
  });
}

export function select(value, options, onChange, attrs = {}) {
  return h('select', { class: 'input', onchange: (e) => onChange(e.target.value), ...attrs },
    options.map(([k, t]) => h('option', { value: k, selected: String(k) === String(value ?? '') }, t)));
}

export function toggle(checked, onChange, label) {
  return h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }),
    h('span', { class: 'toggle-track' }, h('span', { class: 'toggle-thumb' })),
    label ? h('span', label) : null);
}

export function segmented(value, options, onChange, { small } = {}) {
  const wrap = h('div', { class: ['segmented', small && 'segmented-sm'], role: 'radiogroup' });
  const render = (val) => clear(wrap, options.map(([k, t]) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(k) === String(val) ? 'true' : 'false',
    class: ['seg', String(k) === String(val) && 'active'],
    onclick: () => { render(k); onChange(k); },
  }, t)));
  render(value);
  return wrap;
}

/** Auswahl-Pillen (z. B. Charakterisierungen). */
export function pills(value, options, onChange, { allowNone = false } = {}) {
  const wrap = h('div', { class: 'pills' });
  const render = (val) => clear(wrap, options.map((o) => h('button', {
    type: 'button', class: ['pill', o.k === val && 'active'], 'aria-pressed': o.k === val ? 'true' : 'false',
    onclick: () => { const nv = allowNone && o.k === val ? '' : o.k; render(nv); onChange(nv); },
  }, h('b', o.k), h('span', o.t))));
  render(value);
  return wrap;
}

export function badge(text, kind = '') {
  return h('span', { class: ['badge', kind && `badge-${kind}`] }, text);
}

export function empty(iconName, title, text, ...actions) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, icon(iconName, 40, { stroke: 1.5 })), h('h3', title), text ? h('p', { class: 'muted' }, text) : null, h('div', { class: 'row center wrap' }, actions));
}
