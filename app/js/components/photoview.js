// Foto von oben mit Zifferblatt-Overlay. Modi:
//  'view'    – nur anzeigen
//  'align'   – Mittelpunkt, Radius und 12-Uhr-Richtung (Auslauf) per Ziehen ausrichten
//  'connect' – Tippen auf einen Rohranschluss liefert die Uhrzeit
//  'measure' – Tippen liefert Bildkoordinaten (für die Tiefenschätzung)

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const k of kids) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};

export function hourFromPoint(clock, W, H, x, y) {
  const cx = clock.cx * W, cy = clock.cy * H;
  const ang = (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI;
  const rel = (((ang - clock.rot) % 360) + 360) % 360;
  const hr = Math.round(rel / 30) % 12;
  return hr === 0 ? 12 : hr;
}

export function pointForHour(clock, W, H, hour, rScale = 1) {
  const R = clock.r * Math.min(W, H) * rScale;
  const a = ((hour % 12) * 30 + clock.rot) * (Math.PI / 180);
  return [clock.cx * W + R * Math.sin(a), clock.cy * H - R * Math.cos(a)];
}

export function photoView({ url, width: W, height: H, clock, connections = [], mode = 'view', onClockChange, onTap, annotations = [] }) {
  let cl = { ...clock };
  let md = mode;
  let conns = connections;
  let notes = annotations;
  let noteHint = '';
  const k = Math.max(W, H) / 400; // Skalierung für Strichstärken
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Schachtfoto mit Uhr' });
  svg.appendChild(s('image', { href: url, x: 0, y: 0, width: W, height: H }));
  const overlay = s('g');
  svg.appendChild(overlay);
  const hint = document.createElement('div');
  hint.className = 'photo-hint';
  const el = document.createElement('div');
  el.className = 'photo-stage';
  el.append(svg, hint);

  function render() {
    overlay.replaceChildren();
    const cx = cl.cx * W, cy = cl.cy * H, R = cl.r * Math.min(W, H);
    const shadow = { stroke: 'rgba(0,0,0,.55)', 'stroke-width': 4.5 * k, fill: 'none' };
    overlay.appendChild(s('circle', { cx, cy, r: R, ...shadow }));
    overlay.appendChild(s('circle', { cx, cy, r: R, stroke: '#fff', 'stroke-width': 2 * k, fill: 'none', 'stroke-dasharray': `${6 * k} ${4 * k}` }));
    for (let hr = 1; hr <= 12; hr++) {
      const [x1, y1] = pointForHour(cl, W, H, hr, 0.92);
      const [x2, y2] = pointForHour(cl, W, H, hr, 1.0);
      const [tx, ty] = pointForHour(cl, W, H, hr, 1.13);
      const main = hr === 12;
      overlay.appendChild(s('line', { x1, y1, x2, y2, stroke: 'rgba(0,0,0,.6)', 'stroke-width': 5 * k }));
      overlay.appendChild(s('line', { x1, y1, x2, y2, stroke: main ? '#22c55e' : '#fff', 'stroke-width': (main ? 3.4 : 2) * k }));
      const t = s('text', {
        x: tx, y: ty + 5 * k, 'text-anchor': 'middle',
        style: `font: 800 ${14 * k}px system-ui, sans-serif; fill: ${main ? '#22c55e' : '#fff'}; paint-order: stroke; stroke: rgba(0,0,0,.75); stroke-width: ${3.5 * k}px`,
      }, String(hr));
      overlay.appendChild(t);
    }
    // Auslauf-Kennzeichnung
    let [ax, ay] = pointForHour(cl, W, H, 12, 1.32);
    ax = Math.min(W - 40 * k, Math.max(40 * k, ax));
    ay = Math.min(H - 8 * k, Math.max(14 * k, ay));
    overlay.appendChild(s('text', { x: ax, y: ay, 'text-anchor': 'middle', style: `font: 700 ${10 * k}px system-ui; fill: #22c55e; paint-order: stroke; stroke: rgba(0,0,0,.8); stroke-width: ${3 * k}px` }, 'AUSLAUF'));
    overlay.appendChild(s('path', { d: `M${cx - 8 * k} ${cy}h${16 * k}M${cx} ${cy - 8 * k}v${16 * k}`, stroke: '#fff', 'stroke-width': 2 * k }));

    // Anschlüsse
    for (const c of conns) {
      if (!c.clock) continue;
      const [x, y] = pointForHour(cl, W, H, c.clock, 0.8);
      const col = c.dir === 'out' ? '#22c55e' : c.dir === 'closed' ? '#94a3b8' : '#3b82f6';
      const rr = Math.max(9, Math.min(20, (c.dn || 200) / 22)) * k;
      overlay.appendChild(s('circle', { cx: x, cy: y, r: rr, fill: col, 'fill-opacity': c.confirmed === false ? 0.35 : 0.9, stroke: '#fff', 'stroke-width': 2 * k, 'stroke-dasharray': c.clockFromStamm && !c.clockSet ? `${3 * k} ${2 * k}` : null }));
      overlay.appendChild(s('text', { x, y: y + 4.5 * k, 'text-anchor': 'middle', style: `font: 800 ${12 * k}px system-ui; fill: #fff; pointer-events:none` }, c.dir === 'out' ? 'A' : c.dir === 'closed' ? '×' : 'Z'));
      if (c.dn) {
        overlay.appendChild(s('text', { x, y: y + rr + 13 * k, 'text-anchor': 'middle', style: `font: 700 ${10 * k}px system-ui; fill: #fff; paint-order: stroke; stroke: rgba(0,0,0,.8); stroke-width: ${3 * k}px; pointer-events:none` }, `DN ${c.dn}`));
      }
    }

    // Anmerkungen (z. B. Messpunkte)
    for (const n of notes) {
      if (n.type === 'circle') overlay.appendChild(s('circle', { cx: n.x, cy: n.y, r: n.r, fill: 'none', stroke: n.color || '#f59e0b', 'stroke-width': 2.5 * k }));
      if (n.type === 'point') overlay.appendChild(s('circle', { cx: n.x, cy: n.y, r: 6 * k, fill: n.color || '#f59e0b', stroke: '#fff', 'stroke-width': 2 * k }));
    }

    // Griffe zum Ausrichten
    if (md === 'align') {
      const [rx, ry] = pointForHour(cl, W, H, 12, 1.0);
      const [sx, sy] = pointForHour(cl, W, H, 3, 1.0);
      overlay.appendChild(handle(cx, cy, 'center', '#0a5bd3', '✥'));
      overlay.appendChild(handle(rx, ry, 'rotate', '#22c55e', '12'));
      overlay.appendChild(handle(sx, sy, 'radius', '#f59e0b', '↔'));
    }
    hint.textContent = md === 'align' ? 'Kreis auf die Schachtwand legen · grünen Griff (12) auf den tiefsten Auslauf ziehen'
      : md === 'connect' ? 'Auf die Rohröffnung tippen, um einen Anschluss zu setzen'
        : md === 'measure' ? (noteHint || 'Punkte setzen') : '';
    hint.style.display = hint.textContent ? '' : 'none';
  }

  function handle(x, y, kind, color, label) {
    const g = s('g', { 'data-handle': kind, style: 'cursor: grab' });
    g.appendChild(s('circle', { cx: x, cy: y, r: 16 * k, fill: color, stroke: '#fff', 'stroke-width': 3 * k }));
    g.appendChild(s('text', { x, y: y + 5 * k, 'text-anchor': 'middle', style: `font: 800 ${13 * k}px system-ui; fill:#fff; pointer-events:none` }, label));
    return g;
  }

  function toSvg(e) {
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const hd = e.target.closest?.('[data-handle]');
    const p = toSvg(e);
    drag = { kind: hd ? hd.dataset.handle : null, x0: p.x, y0: p.y, moved: false, start: { ...cl } };
    if (drag.kind) { svg.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || !drag.kind) return;
    const p = toSvg(e);
    drag.moved = true;
    if (drag.kind === 'center') {
      cl.cx = Math.min(1, Math.max(0, drag.start.cx + (p.x - drag.x0) / W));
      cl.cy = Math.min(1, Math.max(0, drag.start.cy + (p.y - drag.y0) / H));
    } else if (drag.kind === 'radius') {
      const d = Math.hypot(p.x - cl.cx * W, p.y - cl.cy * H);
      cl.r = Math.min(0.75, Math.max(0.05, d / Math.min(W, H)));
    } else if (drag.kind === 'rotate') {
      cl.rot = ((Math.atan2(p.x - cl.cx * W, -(p.y - cl.cy * H)) * 180) / Math.PI + 360) % 360;
    }
    render();
  });
  svg.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.kind) { if (d.moved) onClockChange && onClockChange({ ...cl }); return; }
    const p = toSvg(e);
    if (Math.hypot(p.x - d.x0, p.y - d.y0) > 12 * k) return; // war eine Wischgeste
    if (md === 'connect') onTap && onTap({ hour: hourFromPoint(cl, W, H, p.x, p.y), x: p.x, y: p.y });
    if (md === 'measure') onTap && onTap({ x: p.x, y: p.y });
  });

  render();
  return {
    el,
    svg,
    setMode(m) { md = m; render(); },
    setClock(c) { cl = { ...c }; render(); },
    setConnections(c) { conns = c; render(); },
    setAnnotations(a, hintText = '') { notes = a; noteHint = hintText; render(); },
    get clock() { return { ...cl }; },
  };
}
