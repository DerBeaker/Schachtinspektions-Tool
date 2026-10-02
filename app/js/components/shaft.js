// Schematischer Schachtschnitt: Auswahl des Schachtbereichs (A–J) und Übersicht der Befunde.

import { h } from '../core/ui.js';
import { SCHACHTBEREICHE, GROUPS, CODES } from '../data/codes.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const k of kids) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};

// y-Bereiche der Zonen im Schema (0 = OK Deckel, 380 = Sohle)
const TOP = 10, BOTTOM = 386;
const ZONES = {
  A: { y: [10, 22], shape: () => s('rect', { x: 42, y: 10, width: 76, height: 12, rx: 2 }) },
  B: { y: [22, 40], shape: () => s('rect', { x: 46, y: 22, width: 68, height: 18 }) },
  D: { y: [40, 96], shape: () => s('polygon', { points: '46,40 114,40 142,96 18,96' }) },
  C: { y: [96, 250], shape: () => s('rect', { x: 18, y: 96, width: 124, height: 154 }) },
  E: { y: [250, 262], shape: () => s('rect', { x: 8, y: 250, width: 144, height: 12 }) },
  F: { y: [262, 330], shape: () => s('rect', { x: 18, y: 262, width: 124, height: 68 }) },
  G: { y: [292, 302], shape: () => s('rect', { x: 18, y: 292, width: 40, height: 10 }) },
  H: { y: [330, 360], shape: () => s('path', { d: 'M18 330 H64 L64 346 Q64 360 52 360 H18 Z M142 330 H96 L96 346 Q96 360 108 360 H142 Z' }) },
  I: { y: [330, 368], shape: () => s('path', { d: 'M64 330 H96 V346 Q96 368 80 368 Q64 368 64 346 Z' }) },
  J: { y: [360, 386], shape: () => s('rect', { x: 8, y: 368, width: 144, height: 18 }) },
};
const ORDER = ['J', 'I', 'H', 'G', 'F', 'E', 'C', 'D', 'B', 'A'];

/** Typischer Schachtbereich für eine Tiefe (Anteil 0 = oben, 1 = unten). */
export function suggestBereich(frac) {
  if (frac == null || !Number.isFinite(frac)) return '';
  const y = TOP + frac * (BOTTOM - TOP);
  if (y < 22) return 'A';
  if (y < 40) return 'B';
  if (y < 96) return 'D';
  if (y < 330) return 'C';
  if (y < 362) return 'H';
  return 'I';
}

function baseSvg(width, active, onPick) {
  const svg = s('svg', { viewBox: `0 0 ${width} 400`, role: 'img', 'aria-label': 'Schachtschnitt' });
  svg.appendChild(s('rect', { x: 0, y: 0, width, height: 400, fill: 'transparent' }));
  // Boden
  svg.appendChild(s('rect', { x: 0, y: 12, width: 160, height: 388, fill: 'color-mix(in srgb, #a16207 10%, transparent)' }));
  for (const k of ORDER) {
    const z = ZONES[k];
    const g = s('g', { class: ['zone', k === active ? 'active' : ''].join(' '), 'data-zone': k });
    const shape = z.shape();
    shape.setAttribute('fill', k === active ? 'color-mix(in srgb, var(--primary) 30%, var(--surface))' : k === 'I' ? 'color-mix(in srgb, #38bdf8 25%, var(--surface))' : 'var(--surface)');
    shape.setAttribute('stroke', 'var(--muted)');
    shape.setAttribute('stroke-width', '1.5');
    g.appendChild(shape);
    const cy = (z.y[0] + z.y[1]) / 2;
    if (!['G', 'E', 'A'].includes(k)) {
      g.appendChild(s('text', { x: k === 'H' ? 40 : 80, y: cy + 5, 'text-anchor': 'middle', style: 'font: 700 13px var(--font); fill: var(--muted); pointer-events:none' }, k));
    }
    if (onPick) {
      g.addEventListener('click', (e) => { e.stopPropagation(); onPick(k); });
    }
    svg.appendChild(g);
  }
  // Steigeisen
  for (let y = 110; y < 320; y += 30) svg.appendChild(s('path', { d: `M128 ${y} h10`, stroke: 'var(--muted)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  // Seitenbeschriftung kleiner Zonen
  if (onPick) {
    for (const [k, y] of [['A', 18], ['E', 259], ['G', 300]]) {
      svg.appendChild(s('text', { x: k === 'G' ? 38 : 80, y: y + 1, 'text-anchor': 'middle', style: 'font: 700 9px var(--font); fill: var(--muted); pointer-events:none' }, k));
    }
  }
  return svg;
}

/** Auswahl des Schachtbereichs (Grafik + Liste). */
export function shaftPicker(value, onChange) {
  let v = value || '';
  const wrap = h('div', { class: 'shaft' });
  const render = () => {
    const svg = baseSvg(160, v, (k) => { v = k; onChange(k); render(); });
    const list = h('div', { class: 'pills grow' }, SCHACHTBEREICHE.map((b) => h('button', {
      type: 'button', class: ['pill', b.k === v && 'active'],
      onclick: () => { v = b.k; onChange(b.k); render(); },
    }, h('b', b.k), h('span', b.t))));
    wrap.replaceChildren(svg, list);
  };
  render();
  return wrap;
}

/** Übersicht: Befunde als Markierungen entlang der Tiefe. */
export function shaftOverview(items, { tiefe, onSelect } = {}) {
  const svg = baseSvg(300, null, null);
  const T = Number(tiefe) || null;
  svg.appendChild(s('text', { x: 4, y: 8, style: 'font: 600 9px var(--font); fill: var(--muted)' }, 'OK Deckel'));
  svg.appendChild(s('text', { x: 4, y: 398, style: 'font: 600 9px var(--font); fill: var(--muted)' }, T ? `Sohle (${T.toFixed(2).replace('.', ',')} m)` : 'Sohle'));
  const placed = [];
  for (const it of items) {
    if (it.depthFromTop == null || !T) continue;
    const frac = Math.min(1, Math.max(0, it.depthFromTop / T));
    const y = TOP + frac * (BOTTOM - TOP);
    let ly = y;
    while (placed.some((p) => Math.abs(p - ly) < 16)) ly += 16;
    placed.push(ly);
    const color = GROUPS[CODES[it.code]?.group || 'D']?.color || 'var(--c-gen)';
    const g = s('g', { style: 'cursor:pointer' });
    g.appendChild(s('line', { x1: 148, y1: y, x2: 176, y2: ly, stroke: color, 'stroke-width': 1.5 }));
    g.appendChild(s('circle', { cx: 148, cy: y, r: 5, fill: color, stroke: 'var(--surface)', 'stroke-width': 1.5 }));
    g.appendChild(s('text', { x: 180, y: ly + 4, style: `font: 700 12px var(--mono); fill: ${color}` }, it.label));
    if (onSelect) g.addEventListener('click', () => onSelect(it));
    svg.appendChild(g);
  }
  return h('div', { class: 'shaft-overview' }, svg);
}
