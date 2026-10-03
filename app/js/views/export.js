// Export: ISYBAU-Zustandsdaten (2006–2024) oder DWA-M 150 (XML + Fotos als ZIP).

import { h, clear, btn, icon, toast, field, select, toggle, badge, sheet } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getProject, saveProject, listManholes, getSettings, saveSettings, getPhoto } from '../core/store.js';
import { exportZustandsdaten, exportFileName, EXPORT_FORMATS } from '../isybau/export.js';
import { exportM150, m150FileName, M150_VARIANTEN } from '../isybau/m150.js';
import { validateInspection } from '../isybau/validate.js';
import { zipParts } from '../lib/zip.js';
import { download } from '../core/util.js';

export async function renderExport(view, projectId) {
  const project = await getProject(projectId);
  if (!project) { navigate('#/', { replace: true }); return; }
  const settings = await getSettings();
  const manholes = await listManholes(projectId);
  const opts = { version: project.exportFormat || settings.exportVersion || '2017-07', scope: 'fertig', photos: true, variante: project.m150Variante || 'isybau' };
  const main = h('main', { class: 'main' });
  const listEl = h('div', { class: 'list' });
  const summary = h('div');

  const candidates = () => manholes.filter((m) => m.inspection && (opts.scope === 'alle' || m.inspection.status === 'fertig'));

  function renderList() {
    const items = candidates();
    let errs = 0;
    clear(listEl, items.map((m) => {
      const v = validateInspection(m.inspection, { kodiersystem: project.kodiersystem });
      if (v.errors) errs++;
      return h('button', { class: 'item', onclick: () => navigate(`#/s/${m.id}`) },
        h('span', { class: ['status-dot', m.inspection.status === 'fertig' ? 'fertig' : 'inArbeit'] }),
        h('div', { class: 'grow' }, h('b', m.name), h('div', { class: 'meta' }, h('span', `${m.inspection.findings.length} Befunde`), h('span', `${m.inspection.connections.length} Anschlüsse`))),
        v.errors ? badge(`${v.errors} Fehler`, 'err') : v.warnings ? badge(`${v.warnings} Hinweise`, 'warn') : badge('ok', 'ok'));
    }));
    clear(summary, h('div', { class: 'card card-pad stack' },
      h('div', { class: 'row' },
        h('div', { class: 'item-icon' }, icon('file')),
        h('div', { class: 'grow' },
          h('h3', `${items.length} von ${manholes.length} Schächten im Export`),
          h('div', { class: 'muted small' }, errs ? `${errs} Inspektion(en) mit Fehlern – bitte vor der Abgabe prüfen.` : 'Alle enthaltenen Inspektionen sind plausibel.'))),
      btn('Exportieren', { icon: 'download', variant: 'primary', block: true, disabled: !items.length, onClick: doExport })));
  }

  async function doExport() {
    const items = candidates().map((m) => ({ inspection: m.inspection, manhole: m }));
    try {
      const m150 = opts.version === 'm150';
      const out = m150 ? exportM150({ project, items, settings, variante: opts.variante }) : exportZustandsdaten({ project, items, settings, version: opts.version });
      const base = m150 ? m150FileName(project) : exportFileName(project, opts.version);
      if (window.SB_DEMO) { showXml(out, base); return; }
      if (!opts.photos) {
        download([out.bytes], `${base}.xml`, 'application/xml');
      } else {
        const files = [{ name: `${base}.xml`, data: out.bytes }];
        let missing = 0;
        for (const p of out.photos) {
          const rec = await getPhoto(p.id);
          let blob = rec?.blob;
          if (!blob && rec?.remote) {
            const { sync } = await import('../sync.js');
            blob = await sync.fetchPhoto(rec).catch(() => null);
          }
          if (!blob) { missing++; continue; }
          files.push({ name: `Fotos/${p.file}`, data: new Uint8Array(await blob.arrayBuffer()) });
        }
        download(zipParts(files), `${base}.zip`, 'application/zip');
        if (missing) toast(`${missing} Foto(s) nicht auf diesem Gerät vorhanden.`, 'info', 5000);
      }
      toast(`Export erstellt: ${items.length} Schächte, ${out.photos.length} Fotos.`, 'ok', 4500);
      settings.exportVersion = opts.version;
      await saveSettings(settings);
      if (project.exportFormat !== opts.version || (m150 && project.m150Variante !== opts.variante)) {
        project.exportFormat = opts.version;
        if (m150) project.m150Variante = opts.variante;
        await saveProject(project);
      }
    } catch (e) {
      console.error(e);
      toast('Export fehlgeschlagen: ' + e.message, 'error', 6000);
    }
  }

  function showXml(out, base) {
    const ta = h('textarea', { class: 'input mono', rows: 16, readonly: true, style: { fontSize: '.78rem', whiteSpace: 'pre' } }, out.xml);
    sheet({
      title: `${base}.xml`, wide: true,
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, `Demo-Version: Dateien können hier nicht heruntergeladen werden. In der installierten App entsteht eine ZIP-Datei mit dieser XML-Datei und ${out.photos.length} Foto(s).`),
        ta,
        btn('XML kopieren', { icon: 'file', variant: 'primary', onClick: async () => {
          try { await navigator.clipboard.writeText(out.xml); toast('XML kopiert.', 'ok'); } catch { ta.select(); toast('Text markiert – bitte manuell kopieren.'); }
        } })),
    });
  }

  const hint = h('p', { class: 'muted small' });
  const varField = field('Schlüssel (DWA-M 150)', select(opts.variante, M150_VARIANTEN, (v) => { opts.variante = v; }));
  const kod = project.kodiersystem === '9' ? 'DIN EN 13508-2 / DWA-M 149-2' : 'DIN EN 13508-2 / ISYBAU (BFR Abwasser)';
  const renderHint = () => {
    const v = opts.version;
    varField.hidden = v !== 'm150';
    const txt = v === 'm150'
      ? `DWA-M 150, Typ B (Stand 04-2010): je Schacht Stammdaten (KG), Inspektion (KI) und Zustände (KZ); die verwendeten Schlüssel stehen in den Referenztabellen (RT) der Datei. Kodiersystem: ${project.kodiersystem === '9' ? 'DWAM149-2:2013' : 'EN13508'}. Vor dem ersten Projekt bitte mit der Software des Auftraggebers gegenprüfen.`
      : `Kodiersystem: ${kod}. Die XML-Datei entspricht dem offiziellen XSD-Schema ${v.slice(0, 4)} (automatisch geprüft).`
        + (v === '2006-10' ? ' XML-2006 kennt nur DIN EN 13508-2:2003 – gekennzeichnet als „Nationale Festlegung DWA-M 149-2“ (Wert 2).' : '')
        + (v < '2017' ? ` Pflichtangabe Liegenschaft: ${project.liegenschaftNummer || project.auftragNummer || '0'} / ${project.liegenschaftBezeichnung || project.name} (änderbar unter Projekt & Auftrag).` : '');
    clear(hint, txt + ' Fotodateien „Schacht-001.jpg“.');
  };
  clear(view, topbar({ back: `#/p/${projectId}`, title: 'Export', sub: project.name }), main);
  main.append(h('div', { class: 'layout-2' },
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Einstellungen'),
      field('Format', select(opts.version, EXPORT_FORMATS, (v) => { opts.version = v; renderHint(); }), 'Wird pro Projekt gemerkt.'),
      varField,
      field('Umfang', select(opts.scope, [['fertig', 'nur abgeschlossene Schächte'], ['alle', 'alle begonnenen Inspektionen']], (v) => { opts.scope = v; renderList(); })),
      toggle(opts.photos, (v) => { opts.photos = v; }, 'Fotos mitliefern (ZIP mit Ordner „Fotos“)'),
      hint),
    h('div', { class: 'stack' }, summary, listEl)));
  renderHint();
  renderList();
}
