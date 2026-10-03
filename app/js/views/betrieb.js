// Betreiber-Bereich (nur für den Betreiber der Installation, z. B. MMSE Software Engineering):
// Firmen (Mandanten) anlegen, Lizenz (Benutzerzahl, Laufzeit) pflegen, sperren, Administrator
// einladen, Daten einer Firma exportieren oder löschen.

import { h, clear, btn, icon, toast, field, input, toggle, sheet, menu, badge, empty, promptDialog } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { sync } from '../sync.js';
import { fmtDate, fmtRelative, download } from '../core/util.js';
import { VENDOR } from '../brand.js';
import { linkSheet } from './settings.js';

const inTagen = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const mb = (b) => (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: b > 1e9 ? 0 : 1 });

export async function renderBetrieb(view) {
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: '#/settings', title: 'Betreiber-Bereich', sub: VENDOR }), main);
  if (!sync.auth || !sync.isOperator()) {
    main.append(h('div', { class: 'card' }, empty('user', 'Kein Zugriff', 'Der Betreiber-Bereich steht nur dem Betreiber der Installation zur Verfügung. Bitte unter Einstellungen mit dem Betreiber-Konto anmelden.',
      btn('Zu den Einstellungen', { variant: 'soft', onClick: () => navigate('#/settings') }))));
    return;
  }
  const summary = h('div', { class: 'grid3' });
  const listEl = h('div', { class: 'list' });
  main.append(
    h('div', { class: 'row between', style: { margin: '4px 0 12px' } },
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Jede Firma sieht nur ihre eigenen Daten. Neue Firmen erhalten eine Einladung für ihren Administrator.'),
      btn('Firma anlegen', { icon: 'plus', variant: 'primary', onClick: () => bearbeiten(null) })),
    summary, h('div', { class: 'section-title' }, 'Firmen'), listEl);

  let tenants = [];
  async function load() {
    try {
      ({ tenants } = await sync.opTenants());
    } catch (e) { clear(listEl, h('p', { class: 'muted' }, e.message)); return; }
    const aktiv = tenants.filter((t) => t.active && !t.expired);
    const kachel = (zahl, text) => h('div', { class: 'card card-pad' }, h('div', { style: { fontSize: '1.5rem', fontWeight: 800 } }, zahl), h('div', { class: 'muted small' }, text));
    clear(summary,
      kachel(`${aktiv.length} / ${tenants.length}`, 'Firmen aktiv'),
      kachel(String(tenants.reduce((s, t) => s + t.activeUsers, 0)), 'aktive Benutzer'),
      kachel(`${mb(tenants.reduce((s, t) => s + t.photoBytes, 0))} MB`, `Fotos (${tenants.reduce((s, t) => s + t.photos, 0)})`));
    clear(listEl, tenants.map((t) => {
      const status = !t.active ? badge('gesperrt', 'err') : t.expired ? badge('Lizenz abgelaufen', 'err')
        : t.validUntil && t.validUntil < inTagen(31) ? badge(`läuft ab ${fmtDate(t.validUntil)}`, 'warn') : badge(t.own ? 'Betreiber' : 'aktiv', 'ok');
      return h('div', { class: 'item', style: { cursor: 'default', alignItems: 'flex-start' } },
        h('div', { class: 'item-icon' }, icon('folder')),
        h('div', { class: 'grow stack-sm' },
          h('div', { class: 'row between wrap' }, h('b', t.name), status),
          h('div', { class: 'meta' },
            h('span', `${t.activeUsers}${t.maxUsers ? ' von ' + t.maxUsers : ''} Benutzer`),
            h('span', `${t.projects} Projekte`), h('span', `${t.inspections} Inspektionen`),
            h('span', `${t.photos} Fotos (${mb(t.photoBytes)} MB)`),
            t.validUntil ? h('span', `gültig bis ${fmtDate(t.validUntil)}`) : h('span', 'unbefristet'),
            t.openInvites ? h('span', `${t.openInvites} offene Einladung(en)`) : null),
          h('div', { class: 'muted small' },
            [t.admins.length ? `Admin: ${t.admins.map((a) => a.email).join(', ')}` : 'noch kein Administrator',
              t.lastActivity ? `zuletzt aktiv ${fmtRelative(t.lastActivity)}` : null,
              t.contact || null].filter(Boolean).join(' · ')),
          t.note ? h('div', { class: 'small' }, t.note) : null),
        btn('', { icon: 'more', variant: 'ghost', aria: 'Aktionen', onClick: () => menu([
          { label: 'Bearbeiten / Lizenz', icon: 'edit', onClick: () => bearbeiten(t) },
          { label: 'Administrator einladen', icon: 'upload', onClick: () => einladen(t) },
          { label: 'Daten exportieren (JSON)', icon: 'download', onClick: () => exportieren(t) },
          t.own ? null : { label: 'Firma löschen', icon: 'trash', danger: true, onClick: () => loeschen(t) },
        ]) }));
    }));
  }

  function bearbeiten(t) {
    const neu = !t;
    const d = t ? { ...t, maxUsers: t.maxUsers ?? '', validUntil: t.validUntil || '' } : { name: '', contact: '', note: '', maxUsers: '', validUntil: inTagen(30), active: true, adminEmail: '', adminName: '' };
    const gueltig = input(d.validUntil, (v) => { d.validUntil = v; }, { type: 'date' });
    const s = sheet({
      title: neu ? 'Neue Firma' : t.name,
      body: h('div', { class: 'stack' },
        field('Firmenname', input(d.name, (v) => { d.name = v; })),
        field('Ansprechpartner / Kontakt', input(d.contact, (v) => { d.contact = v; }, { placeholder: 'Name, Telefon, E-Mail' })),
        h('div', { class: 'grid2' },
          field('Benutzer (max.)', input(d.maxUsers, (v) => { d.maxUsers = v; }, { type: 'number', min: 1, placeholder: 'unbegrenzt' })),
          field('Lizenz gültig bis', gueltig, 'leer = unbefristet')),
        h('div', { class: 'row wrap' },
          btn('Test 30 Tage', { small: true, variant: 'ghost', onClick: () => { d.validUntil = gueltig.value = inTagen(30); } }),
          btn('1 Jahr', { small: true, variant: 'ghost', onClick: () => { d.validUntil = gueltig.value = inTagen(365); } }),
          btn('unbefristet', { small: true, variant: 'ghost', onClick: () => { d.validUntil = gueltig.value = ''; } })),
        neu ? h('div', { class: 'stack' },
          h('h3', 'Erster Administrator der Firma'),
          field('E-Mail-Adresse', input('', (v) => { d.adminEmail = v; }, { type: 'email', autocapitalize: 'off', inputmode: 'email' }), 'Bekommt eine Einladung und richtet sein Passwort selbst ein.'),
          field('Name', input('', (v) => { d.adminName = v; }))) : null,
        t && !t.own ? toggle(d.active, (v) => { d.active = v; }, 'Zugang aktiv (aus = Firma gesperrt)') : null,
        field('Notiz (nur für den Betreiber)', h('textarea', { class: 'input', rows: 2, oninput: (e) => { d.note = e.target.value; } }, d.note || ''))),
      actions: [btn(neu ? 'Firma anlegen' : 'Speichern', { variant: 'primary', onClick: async () => {
        try {
          const r = await sync.opSaveTenant({ id: t?.id, name: d.name, contact: d.contact, note: d.note, maxUsers: d.maxUsers, validUntil: d.validUntil, active: d.active, adminEmail: d.adminEmail, adminName: d.adminName });
          s.close();
          toast(neu ? 'Firma angelegt.' : 'Gespeichert.', 'ok');
          if (r.invite) linkSheet(r.invite);
          load();
        } catch (e) { toast(e.message, 'error', 5000); }
      } })],
    });
  }

  function einladen(t) {
    const d = { email: '', name: '', role: 'admin' };
    const s = sheet({
      title: `Einladung – ${t.name}`,
      body: h('div', { class: 'stack' },
        field('E-Mail-Adresse', input('', (v) => { d.email = v; }, { type: 'email', autocapitalize: 'off', inputmode: 'email' })),
        field('Name', input('', (v) => { d.name = v; }))),
      actions: [btn('Einladung senden', { variant: 'primary', onClick: async () => {
        try { const r = await sync.opInvite({ tenant: t.id, ...d }); s.close(); linkSheet(r); load(); } catch (e) { toast(e.message, 'error', 5000); }
      } })],
    });
  }

  async function exportieren(t) {
    try {
      const data = await sync.opExport(t.id);
      const name = `Schachtblick_${t.name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      download([JSON.stringify(data, null, 1)], name, 'application/json');
      toast(`${data.datensaetze.length} Datensätze exportiert. Fotos liegen im Fotoordner des Servers (Unterordner ${t.id}).`, 'ok', 6000);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function loeschen(t) {
    const name = await promptDialog(`Alle Daten von „${t.name}“ (Projekte, Inspektionen, Fotos, Benutzer) endgültig löschen? Zur Bestätigung den Firmennamen eingeben. Tipp: vorher exportieren.`, { title: 'Firma löschen', ok: 'Endgültig löschen' });
    if (name == null) return;
    try { await sync.opDeleteTenant(t.id, name.trim()); toast('Firma gelöscht.'); load(); } catch (e) { toast(e.message, 'error', 5000); }
  }

  load();
}
