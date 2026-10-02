// Zifferblatt zur Eingabe der Lage am Umfang (Draufsicht, tiefster Auslauf = 12 Uhr).

import { h, clear, segmented } from '../core/ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const k of kids) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};

export const pt = (cx, cy, r, hour) => {
  const a = ((hour % 12) * 30 * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};

export function arcPath(cx, cy, r, from, to) {
  const span = (((to - from) % 12) + 12) % 12 || 12;
  const [x1, y1] = pt(cx, cy, r, from);
  const [x2, y2] = pt(cx, cy, r, to);
  const large = span > 6 ? 1 : 0;
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/**
 * @param {{from:number|null,to:number|null}} value
 * @param {(v:{from,to})=>void} onChange
 * @param {{allowRange?:boolean, markers?:Array<{hour,label,color}>}} opts
 */
export function clockPicker(value, onChange, { allowRange = true, markers = [] } = {}) {
  let v = { from: value.from || null, to: value.to || null };
  let mode = v.to ? 'range' : 'point';
  let next = 'from';
  const svgWrap = h('div', { class: 'clock-picker' });
  const info = h('div', { class: 'muted small', style: { textAlign: 'center' } });

  function render() {
    const C = 130, R = 100;
    const svg = s('svg', { viewBox: '0 0 260 260', role: 'group', 'aria-label': 'Lage am Umfang' });
    svg.appendChild(s('circle', { cx: C, cy: C, r: 122, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    svg.appendChild(s('circle', { cx: C, cy: C, r: 62, fill: 'var(--surface)', stroke: 'var(--border)' }));
    if (v.from && v.to) svg.appendChild(s('path', { d: arcPath(C, C, 118, v.from, v.to), class: 'range' }));
    for (const m of markers) {
      const [x, y] = pt(C, C, 122, m.hour);
      svg.appendChild(s('circle', { cx: x, cy: y, r: 7, fill: m.color || 'var(--ok)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    }
    for (let hr = 1; hr <= 12; hr++) {
      const [x, y] = pt(C, C, R, hr);
      const sel = hr === v.from || hr === v.to;
      const g = s('g', { tabindex: 0, role: 'button', 'aria-label': `${hr} Uhr`, 'aria-pressed': sel ? 'true' : 'false' });
      g.appendChild(s('circle', { cx: x, cy: y, r: 19, class: sel ? 'sel' : 'hit', stroke: sel ? 'none' : 'var(--border)' }));
      const t = s('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'num' }, String(hr));
      if (sel) t.setAttribute('style', 'fill: var(--on-primary)');
      g.appendChild(t);
      const pick = () => {
        if (mode === 'point') v = { from: hr, to: null };
        else if (next === 'from' || !v.from) { v = { from: hr, to: null }; next = 'to'; }
        else { v = { from: v.from, to: hr === v.from ? null : hr }; next = 'from'; }
        onChange({ ...v });
        render();
      };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      svg.appendChild(g);
    }
    svg.appendChild(s('text', { x: C, y: C - 6, 'text-anchor': 'middle', class: 'num', style: 'font-size:12px;fill:var(--muted)' }, 'Auslauf'));
    svg.appendChild(s('text', { x: C, y: C + 12, 'text-anchor': 'middle', class: 'num', style: 'font-size:12px;fill:var(--muted)' }, '= 12 Uhr'));
    clear(svgWrap, svg);
    info.textContent = !v.from ? 'Uhrzeit antippen' : v.to ? `Bereich ${v.from} bis ${v.to} Uhr (im Uhrzeigersinn)` : `${v.from} Uhr`;
  }

  render();
  const modeCtl = allowRange ? segmented(mode, [['point', 'Punkt'], ['range', 'Bereich von–bis']], (m) => {
    mode = m; next = 'from';
    if (m === 'point' && v.to) { v = { from: v.from, to: null }; onChange({ ...v }); }
    render();
  }, { small: true }) : null;
  return h('div', { class: 'stack-sm' }, modeCtl, svgWrap, info);
}
