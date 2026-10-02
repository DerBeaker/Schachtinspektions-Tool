// Export: ISYBAU-Zustandsdaten (XML + Fotos als ZIP) und Projekt-Sicherung.

import { h, clear, btn, icon, toast, field, select, toggle, badge, sheet } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getProject, listManholes, getSettings, saveSettings, getPhoto } from '../core/store.js';
import { exportZustandsdaten, exportFileName } from '../isybau/export.js';
import { validateInspection } from '../isybau/validate.js';
import { zipParts } from '../lib/zip.js';
import { download } from '../core/util.js';

export async function renderExport(view, projectId) {
  const project = await getProject(projectId);
  if (!project) { navigate('#/', { replace: true }); return; }
  const settings = await getSettings();
  const manholes = await listManholes(projectId);
  const opts = { version: settings.exportVersion || '2017-07', scope: 'fertig', photos: true };
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
    clear(summary, h('div', { class: 'card card-pad row' },
      h('div', { class: 'item-icon' }, icon('file')),
      h('div', { class: 'grow' },
        h('h3', `${items.length} von ${manholes.length} Schächten im Export`),
        h('div', { class: 'muted small' }, errs ? `${errs} Inspektion(en) mit Fehlern – bitte vor der Abgabe prüfen.` : 'Alle enthaltenen Inspektionen sind plausibel.')),
      btn('Exportieren', { icon: 'download', variant: 'primary', disabled: !items.length, onClick: doExport })));
  }

  async function doExport() {
    const items = candidates().map((m) => ({ inspection: m.inspection, manhole: m }));
    try {
      const out = exportZustandsdaten({ project, items, settings, version: opts.version });
      const base = exportFileName(project, opts.version);
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

  clear(view, topbar({ back: `#/p/${projectId}`, title: 'ISYBAU-Export', sub: project.name }), main);
  main.append(h('div', { class: 'layout-2' },
    h('div', { class: 'card card-pad stack' },
      h('h3', 'Einstellungen'),
      field('Format', select(opts.version, [['2017-07', 'ISYBAU XML-2017 (weit verbreitet)'], ['2024-06', 'ISYBAU XML-2024 (BFR Abwasser 01/2025)']], (v) => { opts.version = v; })),
      field('Umfang', select(opts.scope, [['fertig', 'nur abgeschlossene Schächte'], ['alle', 'alle begonnenen Inspektionen']], (v) => { opts.scope = v; renderList(); })),
      toggle(opts.photos, (v) => { opts.photos = v; }, 'Fotos mitliefern (ZIP mit Ordner „Fotos“)'),
      h('p', { class: 'muted small' }, `Kodiersystem: ${project.kodiersystem === '9' ? 'DIN EN 13508-2 / DWA-M 149-2' : 'DIN EN 13508-2 / ISYBAU (BFR Abwasser)'} · Fotodateien nach BFR-Konvention „Schacht-001.jpg“. Die XML-Datei ist gegen das offizielle XSD-Schema geprüft.`)),
    h('div', { class: 'stack' }, summary, listEl)));
  renderList();
}
