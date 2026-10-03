// Export & Berichte: ISYBAU-Zustandsdaten (2006–2024) oder DWA-M 150 (XML + Fotos als ZIP),
// Schachtprotokolle als PDF (eine Datei oder je Schacht) und Aufmaß (PDF/Excel). Der XML-Export
// gehört zu Schachtblick Pro, Berichte und Aufmaß gibt es auch in Basis. Datei- und Fotonamen folgen
// einem Muster je Projekt (isybau/dateinamen.js); doppelte Schachtnamen verhindern den XML-Export.

import { h, clear, btn, icon, toast, field, input, select, toggle, badge, sheet, segmented } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getProject, saveProject, listManholes, getSettings, saveSettings, getPhoto, getInspection, saveInspection } from '../core/store.js';
import { exportZustandsdaten, exportFileName, EXPORT_FORMATS } from '../isybau/export.js';
import { exportM150, m150FileName, M150_VARIANTEN } from '../isybau/m150.js';
import { validateInspection } from '../isybau/validate.js';
import { zipParts } from '../lib/zip.js';
import { download, debounce } from '../core/util.js';
import { protokollErzeugen, aufmassErzeugen } from './berichte.js';
import { hatBauteile } from '../isybau/bauteile.js';
import { sync } from '../sync.js';
import { APP_NAME } from '../brand.js';
import {
  FOTO_MUSTER, FOTO_STANDARD, BERICHT_MUSTER, BERICHT_STANDARD, PLATZHALTER,
  fotoBenenner, berichtNamen, doppelteSchaechte, berichtNummernVergeben,
} from '../isybau/dateinamen.js';

/** Namensmuster wählen (Vorlage oder eigenes) – mit Beispiel und anklickbaren Platzhaltern. */
function musterFeld(label, wert, vorlagen, onChange, beispiel, { platzhalter = PLATZHALTER, hinweis } = {}) {
  const bsp = h('div', { class: 'muted small mono', style: { wordBreak: 'break-all' } });
  const zeigen = (m) => { bsp.textContent = `Beispiel: ${beispiel(m || vorlagen[0][0])}`; };
  const istVorlage = (v) => vorlagen.some(([m]) => m === v);
  let sel;
  const feld = input(wert, (v) => { sel.value = istVorlage(v) ? v : '*'; onChange(v); zeigen(v); },
    { class: 'input mono', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', 'aria-label': `${label} (Muster)` });
  sel = select(istVorlage(wert) ? wert : '*', [...vorlagen, ['*', 'eigenes Muster …']], (v) => {
    if (v === '*') { feld.focus(); return; }
    feld.value = v; onChange(v); zeigen(v);
  }, { 'aria-label': label });
  zeigen(wert);
  return h('div', { class: 'field stack-sm' },
    h('span', { class: 'field-label' }, label),
    sel, feld, bsp,
    h('details', { class: 'small' }, h('summary', 'Platzhalter einfügen'),
      h('div', { class: 'pills', style: { marginTop: '6px' } }, platzhalter.map(([p, t]) => h('button', {
        type: 'button', class: 'pill', title: t,
        onclick: () => { feld.value += p; feld.dispatchEvent(new Event('input')); },
      }, h('b', p), h('span', t))))),
    hinweis ? h('span', { class: 'field-hint' }, hinweis) : null);
}

export async function renderExport(view, projectId) {
  const project = await getProject(projectId);
  if (!project) { navigate('#/', { replace: true }); return; }
  const settings = await getSettings();
  const manholes = await listManholes(projectId);
  const opts = { version: project.exportFormat || settings.exportVersion || '2017-07', scope: 'fertig', photos: true, variante: project.m150Variante || 'isybau', bewertung: project.exportBewertung !== false, stammdaten: project.exportStammdaten !== false, fotoMuster: project.fotoMuster || FOTO_STANDARD };
  const projektSpeichern = debounce(() => saveProject(project), 800);
  // Beispiel für die Namensvorschau: erster Schacht im Umfang (sonst ein erfundener)
  const beispielSchacht = () => {
    const m = manholes.find((x) => x.inspection) || manholes[0] || { name: 'S1005' };
    const insp = m.inspection || { datum: new Date().toISOString().slice(0, 10) };
    return { manhole: m, inspection: { ...insp, berichtNr: insp.berichtNr || '001' } };
  };
  /** Berichtnummern vergeben (fortlaufend im Projekt), wo noch keine steht – vor Export und Protokoll. */
  async function berichtNummernSichern(items) {
    const alle = (await listManholes(projectId)).map((m) => m.inspection).filter(Boolean);
    for (const insp of berichtNummernVergeben(alle, items.map((i) => i.inspection))) {
      const frisch = await getInspection(insp.id); // nur die Nummer setzen, nichts Älteres zurückschreiben
      if (frisch && !String(frisch.berichtNr || '').trim()) { frisch.berichtNr = insp.berichtNr; await saveInspection(frisch); }
    }
  }
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
    const doppelt = doppelteSchaechte(items.map((m) => ({ manhole: m })));
    clear(summary, h('div', { class: 'card card-pad stack' },
      doppelt.length ? h('div', { class: 'issue error' }, icon('alert', 18), h('span', `Doppelte Schachtbezeichnung: ${doppelt.join(', ')}. Jeder Schacht braucht eine eigene Bezeichnung – bitte im Schacht unter „Daten“ umbenennen.`)) : null,
      h('div', { class: 'row' },
        h('div', { class: 'item-icon' }, icon(sync.xmlErlaubt() ? 'file' : 'lock')),
        h('div', { class: 'grow' },
          h('h3', `${items.length} von ${manholes.length} Schächten im Export`),
          h('div', { class: 'muted small' }, errs ? `${errs} Inspektion(en) mit Fehlern – bitte vor der Abgabe prüfen.` : 'Alle enthaltenen Inspektionen sind plausibel.'))),
      sync.xmlErlaubt()
        ? btn('Exportieren', { icon: 'download', variant: 'primary', block: true, disabled: !items.length || doppelt.length > 0, onClick: doExport })
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
    const doppelt = doppelteSchaechte(items);
    if (doppelt.length) { toast(`Doppelte Schachtbezeichnung: ${doppelt.join(', ')} – bitte umbenennen.`, 'error', 6000); return; }
    try {
      await berichtNummernSichern(items);
      const m150 = opts.version === 'm150';
      const fotoMuster = opts.fotoMuster || FOTO_STANDARD;
      const out = m150 ? exportM150({ project, items, settings, variante: opts.variante, fotoMuster }) : exportZustandsdaten({ project, items, settings, version: opts.version, bewertung: opts.bewertung, stammdaten: opts.stammdaten, fotoMuster });
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
        if (missing) toast(`${missing} Foto(s) fehlen auf diesem Gerät und daher im ZIP – die XML verweist trotzdem darauf. Bitte erst synchronisieren bzw. auf dem Gerät mit den Fotos exportieren.`, 'error', 9000);
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
    clear(hint, txt);
  };
  // ---- Berichte & Aufmaß
  const rep = { fotos: project.berichtFotos !== false, einzeln: project.berichtEinzeln === true, muster: project.berichtMuster || BERICHT_STANDARD };
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
  const berichtMusterEl = musterFeld('Dateiname je Schacht', rep.muster, BERICHT_MUSTER, (v) => { rep.muster = v; project.berichtMuster = v; projektSpeichern(); },
    (m) => berichtNamen([beispielSchacht()], { muster: m, project })[0],
    { platzhalter: PLATZHALTER.filter(([p]) => !['{Nr}', '{LfdNr}', '{Kode}'].includes(p)), hinweis: 'Mehrere Schächte kommen als ZIP-Datei mit je einer PDF.' });
  berichtMusterEl.hidden = !rep.einzeln;
  const berichte = h('div', { class: 'card card-pad stack' },
    h('h3', 'Berichte & Aufmaß'),
    h('p', { class: 'muted small' }, 'PDF mit Firmenlogo, Anschrift und Kontakt aus den ',
      h('a', { href: '#/settings' }, 'Einstellungen'), '. Es gilt der oben gewählte Umfang.',
      settings.logo ? null : ' Noch kein Logo hinterlegt.'),
    toggle(rep.fotos, async (v) => { rep.fotos = v; project.berichtFotos = v; await saveProject(project); }, 'Fotos der Befunde ins Protokoll'),
    field('Schachtprotokolle als', segmented(rep.einzeln ? 'einzeln' : 'gesamt', [['gesamt', 'eine PDF für alle'], ['einzeln', 'je Schacht eine PDF']], (v) => {
      rep.einzeln = v === 'einzeln'; project.berichtEinzeln = rep.einzeln; berichtMusterEl.hidden = !rep.einzeln; projektSpeichern();
    })),
    berichtMusterEl,
    btn('Schachtprotokolle (PDF)', { icon: 'printer', block: true, onClick: guard(async (items) => {
      await berichtNummernSichern(items);
      await protokollErzeugen({ project, items, fotos: rep.fotos, einzeln: rep.einzeln, berichtMuster: rep.muster || BERICHT_STANDARD, fotoMuster: opts.fotoMuster || FOTO_STANDARD });
    }) }),
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
        musterFeld('Dateinamen der Fotos', opts.fotoMuster, FOTO_MUSTER, (v) => { opts.fotoMuster = v; project.fotoMuster = v; projektSpeichern(); }, (m) => {
          const { manhole, inspection } = beispielSchacht();
          const n = fotoBenenner({ muster: m, project }).fuer(manhole, inspection);
          return `${n.name('a', 'DDA')} (Foto von oben), ${n.name('b', 'DAB')} …`;
        }, { hinweis: 'Gilt für die XML-Datei, die Fotos im ZIP und die Fotonamen im Schachtprotokoll. Das Foto von oben ist immer Nr. 001 und steht als Übersichtsfoto in der XML (ISYBAU: DDA, DWA-M 150: KI118).' }),
        hint),
      summary),
    h('div', { class: 'stack' }, berichte, listEl)));
  renderHint();
  renderList();
}
