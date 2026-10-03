// Export & Berichte: ISYBAU-Zustandsdaten (2006–2024) oder DWA-M 150 (XML + Fotos als ZIP),
// Schachtprotokolle als PDF und Aufmaß (PDF/Excel). Der XML-Export gehört zu Schachtblick Pro,
// Berichte und Aufmaß gibt es auch in Basis.

import { h, clear, btn, icon, toast, field, input, select, toggle, badge, sheet } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getProject, saveProject, listManholes, getSettings, saveSettings, getPhoto } from '../core/store.js';
import { exportZustandsdaten, exportFileName, EXPORT_FORMATS } from '../isybau/export.js';
import { exportM150, m150FileName, M150_VARIANTEN } from '../isybau/m150.js';
import { validateInspection } from '../isybau/validate.js';
import { zipParts } from '../lib/zip.js';
import { download } from '../core/util.js';
import { protokollErzeugen, aufmassErzeugen } from './berichte.js';
import { hatBauteile } from '../isybau/bauteile.js';
import { sync } from '../sync.js';
import { APP_NAME } from '../brand.js';

export async function renderExport(view, projectId) {
  const project = await getProject(projectId);
  if (!project) { navigate('#/', { replace: true }); return; }
  const settings = await getSettings();
  const manholes = await listManholes(projectId);
  const opts = { version: project.exportFormat || settings.exportVersion || '2017-07', scope: 'fertig', photos: true, variante: project.m150Variante || 'isybau', bewertung: project.exportBewertung !== false, stammdaten: project.exportStammdaten !== false };
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
        h('div', { class: 'item-icon' }, icon(sync.xmlErlaubt() ? 'file' : 'lock')),
        h('div', { class: 'grow' },
          h('h3', `${items.length} von ${manholes.length} Schächten im Export`),
          h('div', { class: 'muted small' }, errs ? `${errs} Inspektion(en) mit Fehlern – bitte vor der Abgabe prüfen.` : 'Alle enthaltenen Inspektionen sind plausibel.'))),
      sync.xmlErlaubt()
        ? btn('Exportieren', { icon: 'download', variant: 'primary', block: true, disabled: !items.length, onClick: doExport })
        : proHinweis()));
  }

  // Basis: XML-Export gesperrt – Weg zu Pro je nach Anmeldung
  function proHinweis() {
    const admin = sync.auth && sync.isAdmin();
    return h('div', { class: 'stack-sm' },
      h('div', { class: 'issue warn' }, icon('lock', 18), h('span', sync.auth && sync.abgelaufen()
        ? 'Der Testzeitraum bzw. die Lizenz Ihrer Firma ist abgelaufen. Der XML-Export ist wieder möglich, sobald Pro gebucht ist.'
        : `Der XML-Export (ISYBAU, DWA-M 150) gehört zu ${APP_NAME} Pro. Schachtprotokolle und Aufmaß (Berichte & Aufmaß) gibt es auch in der kostenlosen Basis-Version.`)),
      sync.auth
        ? (admin ? btn('Pro buchen', { icon: 'star', variant: 'primary', block: true, onClick: () => navigate('#/konto') }) : h('p', { class: 'muted small' }, 'Bitte wenden Sie sich an den Administrator Ihrer Firma.'))
        : h('div', { class: 'row wrap' },
          btn('Pro ansehen · kostenlos testen', { icon: 'star', variant: 'primary', onClick: () => navigate('#/pro') }),
          btn('Anmelden', { variant: 'ghost', onClick: () => navigate('#/settings') })));
  }

  async function doExport() {
    if (!sync.xmlErlaubt()) { toast(`Der XML-Export gehört zu ${APP_NAME} Pro.`, 'info'); return; }
    const items = candidates().map((m) => ({ inspection: m.inspection, manhole: m }));
    try {
      const m150 = opts.version === 'm150';
      const out = m150 ? exportM150({ project, items, settings, variante: opts.variante }) : exportZustandsdaten({ project, items, settings, version: opts.version, bewertung: opts.bewertung, stammdaten: opts.stammdaten });
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
          if (!blob && rec?.remote) blob = await sync.fetchPhoto(rec).catch(() => null);
          if (!blob) { missing++; continue; }
          files.push({ name: `Fotos/${p.file}`, data: new Uint8Array(await blob.arrayBuffer()) });
        }
        download(zipParts(files), `${base}.zip`, 'application/zip');
        if (missing) toast(`${missing} Foto(s) nicht auf diesem Gerät vorhanden.`, 'info', 5000);
      }
      toast(`Export erstellt: ${items.length} Schächte, ${out.photos.length} Fotos.`, 'ok', 4500);
      settings.exportVersion = opts.version;
      await saveSettings(settings);
      if (project.exportFormat !== opts.version || (m150 && project.m150Variante !== opts.variante)
        || (!m150 && (project.exportBewertung !== opts.bewertung || (project.exportStammdaten !== false) !== opts.stammdaten))) {
        project.exportFormat = opts.version;
        if (m150) project.m150Variante = opts.variante;
        else { project.exportBewertung = opts.bewertung; project.exportStammdaten = opts.stammdaten; }
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
  const bewToggle = toggle(opts.bewertung, (v) => { opts.bewertung = v; }, 'Zustandsklassen (BFR Abwasser A-3) mitliefern');
  const mitBauteilen = manholes.filter((m) => hatBauteile(m.inspection?.bauteile) || hatBauteile(m.bauteile)).length;
  const stammToggle = toggle(opts.stammdaten, (v) => { opts.stammdaten = v; }, `Bauteilbeschreibung als Stammdaten mitliefern (${mitBauteilen} ${mitBauteilen === 1 ? 'Schacht' : 'Schächte'} mit Bauteilen)`);
  const kod = project.kodiersystem === '9' ? 'DIN EN 13508-2 / DWA-M 149-2' : 'DIN EN 13508-2 / ISYBAU (BFR Abwasser)';
  const renderHint = () => {
    const v = opts.version;
    varField.hidden = v !== 'm150';
    bewToggle.hidden = v === 'm150';
    stammToggle.hidden = v === 'm150';
    const txt = v === 'm150'
      ? `DWA-M 150, Typ B (Stand 04-2010): je Schacht Stammdaten (KG, inkl. Bauteile wie Schachtform/-maße, Deckel, Gerinne, Steighilfen), Inspektion (KI) und Zustände (KZ); die verwendeten Schlüssel stehen in den Referenztabellen (RT) der Datei. Kodiersystem: ${project.kodiersystem === '9' ? 'DWAM149-2:2013' : 'EN13508'}. Vor dem ersten Projekt bitte mit der Software des Auftraggebers gegenprüfen.`
      : `Kodiersystem: ${kod}. Die XML-Datei entspricht dem offiziellen XSD-Schema ${v.slice(0, 4)} (automatisch geprüft).`
        + (v === '2006-10' ? ' XML-2006 kennt nur DIN EN 13508-2:2003 – gekennzeichnet als „Nationale Festlegung DWA-M 149-2“ (Wert 2).' : '')
        + (v < '2017' ? ` Pflichtangabe Liegenschaft: ${project.liegenschaftNummer || project.auftragNummer || '0'} / ${project.liegenschaftBezeichnung || project.name} (änderbar unter Projekt & Auftrag).` : '');
    clear(hint, txt + ' Fotodateien „Schacht-001.jpg“.');
  };
  // ---- Berichte & Aufmaß
  const rep = { fotos: project.berichtFotos !== false };
  const aufmass = { staffel: '2; 3; 5', grenztiefe: '3', ...(project.aufmass || {}) };
  const reportItems = () => candidates().map((m) => ({ manhole: m, inspection: m.inspection }));
  const guard = (fn) => async () => {
    const items = reportItems();
    if (!items.length) { toast('Keine Inspektionen im gewählten Umfang.', 'info'); return; }
    await fn(items);
  };
  const saveAufmass = async () => {
    if (JSON.stringify(project.aufmass || {}) === JSON.stringify(aufmass)) return;
    project.aufmass = { ...aufmass };
    await saveProject(project);
  };
  const berichte = h('div', { class: 'card card-pad stack' },
    h('h3', 'Berichte & Aufmaß'),
    h('p', { class: 'muted small' }, 'PDF mit Firmenlogo, Anschrift und Kontakt aus den ',
      h('a', { href: '#/settings' }, 'Einstellungen'), '. Es gilt der oben gewählte Umfang.',
      settings.logo ? null : ' Noch kein Logo hinterlegt.'),
    toggle(rep.fotos, async (v) => { rep.fotos = v; project.berichtFotos = v; await saveProject(project); }, 'Fotos der Befunde ins Protokoll'),
    btn('Schachtprotokolle (PDF)', { icon: 'printer', block: true, onClick: guard((items) => protokollErzeugen({ project, items, fotos: rep.fotos })) }),
    h('div', { class: 'grid2' },
      field('Tiefenstaffel (m)', input(aufmass.staffel, (v) => { aufmass.staffel = v; }, { placeholder: '2; 3; 5', inputmode: 'decimal' }), 'Grenzen, getrennt durch „;“'),
      field('Mehrtiefe ab (m)', input(aufmass.grenztiefe, (v) => { aufmass.grenztiefe = v; }, { placeholder: '3', inputmode: 'decimal' }), '0 = keine Mehrtiefe')),
    h('div', { class: 'row wrap' },
      btn('Aufmaß (PDF)', { icon: 'file', variant: 'soft', onClick: guard(async (items) => { await saveAufmass(); await aufmassErzeugen({ project, items, format: 'pdf' }); }) }),
      btn('Aufmaß (Excel)', { icon: 'list', variant: 'soft', onClick: guard(async (items) => { await saveAufmass(); await aufmassErzeugen({ project, items, format: 'xlsx' }); }) })));

  clear(view, topbar({ back: `#/p/${projectId}`, title: 'Export & Berichte', sub: project.name }), main);
  main.append(h('div', { class: 'layout-2' },
    h('div', { class: 'stack' },
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Datenexport'),
        field('Format', select(opts.version, EXPORT_FORMATS, (v) => { opts.version = v; renderHint(); }), 'Wird pro Projekt gemerkt.'),
        varField, bewToggle, stammToggle,
        field('Umfang', select(opts.scope, [['fertig', 'nur abgeschlossene Schächte'], ['alle', 'alle begonnenen Inspektionen']], (v) => { opts.scope = v; renderList(); })),
        toggle(opts.photos, (v) => { opts.photos = v; }, 'Fotos mitliefern (ZIP mit Ordner „Fotos“)'),
        hint),
      summary),
    h('div', { class: 'stack' }, berichte, listEl)));
  renderHint();
  renderList();
}
