// Schachtprotokoll zum Drucken bzw. Speichern als PDF (Browser-Druckfunktion).

import { h, clear, btn } from '../core/ui.js';
import { topbar } from '../core/shell.js';
import { getInspection, getManhole, getProject, getSettings, photoUrl, getPhoto } from '../core/store.js';
import { buildRecords } from '../isybau/model.js';
import { codeLabel, CODES } from '../data/codes.js';
import { refLabel } from '../data/reflists.js';
import { fmtDate, fmtM, fmtNum } from '../core/util.js';
import { photoView } from '../components/photoview.js';

export async function renderReport(view, inspectionId) {
  const insp = await getInspection(inspectionId);
  const manhole = await getManhole(insp.manholeId);
  const project = await getProject(insp.projectId);
  const settings = await getSettings();
  const names = new Map();
  const recs = buildRecords(insp, { photoName: (id) => { if (!names.has(id)) names.set(id, `Foto ${names.size + 1}`); return names.get(id); } });

  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: `#/s/${manhole.id}`, title: 'Schachtprotokoll', sub: manhole.name, actions: [btn('Drucken / PDF', { icon: 'printer', variant: 'primary', small: true, onClick: () => window.print() })] }), main);

  const ovUrl = insp.overview?.photoId ? await photoUrl(insp.overview.photoId) : null;
  const overview = ovUrl ? await getPhoto(insp.overview.photoId) : null;
  const ov = overview && ovUrl ? photoView({ url: ovUrl, width: overview.width, height: overview.height, clock: insp.overview.clock, connections: insp.connections }) : null;
  if (ov) ov.el.querySelector('.photo-hint')?.remove();

  const photoFigs = [];
  for (const [id, label] of names) {
    if (id === insp.overview?.photoId) continue;
    const u = await photoUrl(id);
    const f = insp.findings.find((x) => x.photoId === id);
    if (u) photoFigs.push(h('figure', null, h('img', { src: u, alt: label }), h('figcaption', `${label}: ${f ? codeLabel(f) : ''}`)));
  }

  main.append(h('article', { class: 'report' },
    h('div', { class: 'head' },
      h('div', null, h('h1', `Schachtprotokoll ${manhole.name}`), h('div', null, [manhole.strasse, manhole.ortsteil].filter(Boolean).join(', '))),
      h('div', { style: { textAlign: 'right' } }, h('b', settings.company || ''), h('div', project.name), h('div', `Auftrag: ${project.auftragBezeichnung || '–'}`))),
    h('section', null, h('table', null, h('tbody', null,
      h('tr', null, h('th', 'Datum'), h('td', `${fmtDate(insp.datum)} ${insp.uhrzeit || ''}`), h('th', 'Inspekteur'), h('td', insp.inspekteur || '–')),
      h('tr', null, h('th', 'Schachttiefe'), h('td', `${fmtM(insp.tiefe)}${insp.tiefeQuelle === 'foto' ? ' (geschätzt)' : ''}`), h('th', 'Bezugspunkt'), h('td', refLabel('U115', insp.bezugVertikal))),
      h('tr', null, h('th', 'Wetter'), h('td', refLabel('U106', insp.wetter)), h('th', 'Wasserhaltung'), h('td', refLabel('U107', insp.wasserhaltung))),
      h('tr', null, h('th', 'Kodiersystem'), h('td', project.kodiersystem === '9' ? 'DIN EN 13508-2 / DWA-M 149-2' : 'DIN EN 13508-2 / ISYBAU'), h('th', 'Status'), h('td', insp.status === 'fertig' ? 'abgeschlossen' : 'in Bearbeitung'))))),
    ov ? h('section', { style: { margin: '14px 0', maxWidth: '520px' } }, h('h3', 'Draufsicht (tiefster Auslauf = 12 Uhr)'), ov.el) : null,
    h('section', null, h('h3', { style: { margin: '14px 0 6px' } }, 'Anschlüsse'),
      h('table', null, h('thead', null, h('tr', null, h('th', 'Richtung'), h('th', 'Uhr'), h('th', 'DN'), h('th', 'Höhe ü. Sohle'), h('th', 'Leitung'))),
        h('tbody', null, insp.connections.map((c) => {
          const dep = c.lageMode === 'unten' ? c.lageValue : insp.tiefe != null && c.lageValue !== '' ? Number(insp.tiefe) - Number(c.lageValue) : null;
          return h('tr', null, h('td', c.dir === 'out' ? 'Ablauf' : c.dir === 'closed' ? 'verschlossen' : 'Zulauf'), h('td', c.clock || '–'), h('td', c.dn || '–'),
            h('td', dep != null && dep !== '' ? `${fmtNum(dep)} m` : '–'), h('td', c.pipeName || c.kommentar || ''));
        })))),
    h('section', null, h('h3', { style: { margin: '14px 0 6px' } }, 'Zustandsdaten (ISYBAU-Datensätze)'),
      h('table', null, h('thead', null, h('tr', null, h('th', 'Nr.'), h('th', 'Lage [m]'), h('th', 'Kode'), h('th', 'Beschreibung'), h('th', 'Quant.'), h('th', 'Uhr'), h('th', 'Ber.'), h('th', 'Anmerkung / Foto'))),
        h('tbody', null, recs.map((r) => h('tr', null,
          h('td', r.Index), h('td', r.VertikaleLage.replace('.', ',')),
          h('td', { class: 'mono' }, `${r.InspektionsKode}${r.Charakterisierung1 || ''}${r.Charakterisierung2 || ''}${r.Streckenschaden ? ' ' + r.Streckenschaden + (r.StreckenschadenLfdNr || '') : ''}`),
          h('td', CODES[r.InspektionsKode] ? codeLabel({ code: r.InspektionsKode, c1: r.Charakterisierung1, c2: r.Charakterisierung2 }) : ''),
          h('td', [r.Quantifizierung1Numerisch, r.Quantifizierung2Numerisch].filter(Boolean).map((x) => x.replace('.', ',')).join(' / ')),
          h('td', r.PositionVon ? (r.PositionBis && r.PositionBis !== '00' ? `${+r.PositionVon}–${+r.PositionBis}` : +r.PositionVon) : ''),
          h('td', r.Schachtbereich || ''),
          h('td', [r.Kommentar, r.Fotodatei].filter(Boolean).join(' · '))))))),
    photoFigs.length ? h('section', null, h('h3', { style: { margin: '14px 0 6px' } }, 'Fotos'), h('div', { class: 'photos' }, photoFigs)) : null,
    insp.bemerkung ? h('p', { style: { marginTop: '12px' } }, h('b', 'Bemerkung: '), insp.bemerkung) : null,
    h('p', { class: 'small', style: { marginTop: '18px', color: '#667' } }, `Erstellt mit Schachtblick am ${new Date().toLocaleDateString('de-DE')}. Vertikale Lage bezogen auf: ${refLabel('U115', insp.bezugVertikal)}.`)));
}
