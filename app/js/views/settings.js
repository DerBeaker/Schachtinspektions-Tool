// Einstellungen: Inspekteur, Firma, Darstellung, Server-Anmeldung, Speicher.

import { h, clear, btn, icon, toast, field, input, select, toggle, confirmDialog, sheet } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getSettings, saveSettings, storageInfo } from '../core/store.js';
import { sync } from '../sync.js';
import { db } from '../core/db.js';
import { BEZUG_VERTIKAL } from '../data/reflists.js';
import { APP_NAME, APP_VERSION } from '../isybau/export.js';

export async function renderSettings(view) {
  const s = await getSettings();
  const save = async () => { await saveSettings(s); };
  const set = (k) => (v) => { s[k] = v; save(); };
  const main = h('main', { class: 'main' });
  const serverBox = h('div', { class: 'card card-pad stack' });
  const storageEl = h('div', { class: 'muted small' }, '…');

  function renderServer() {
    if (sync.auth) {
      const u = sync.auth.user || {};
      clear(serverBox,
        h('div', { class: 'row' }, h('div', { class: 'item-icon' }, icon('cloud')),
          h('div', { class: 'grow' }, h('h3', u.name || u.username), h('div', { class: 'muted small' }, `${u.tenant || ''} · ${sync.auth.serverUrl || 'gleicher Server'}`))),
        h('div', { class: 'muted small' }, sync.status.message || ''),
        sync.auth.features?.ai ? h('div', { class: 'badge badge-ai' }, '✦ KI-Assistent verfügbar') : null,
        h('div', { class: 'row wrap' },
          btn('Jetzt synchronisieren', { icon: 'refresh', onClick: async () => { try { await sync.run({ manual: true }); toast('Synchronisiert.', 'ok'); } catch (e) { toast(e.message, 'error'); } renderServer(); } }),
          u.role === 'admin' ? btn('Benutzer verwalten', { icon: 'user', variant: 'soft', onClick: usersSheet }) : null,
          btn('Passwort ändern', { variant: 'ghost', onClick: passwordSheet }),
          btn('Abmelden', { icon: 'logout', variant: 'ghost', onClick: async () => { await sync.logout(); renderServer(); } })));
      return;
    }
    const d = { url: s.serverUrl || '', user: '', pass: '' };
    clear(serverBox,
      h('h3', 'Team-Server (optional)'),
      h('p', { class: 'muted small' }, 'Ohne Server arbeitet die App komplett auf diesem Gerät. Mit Server (PHP + MySQL auf dem eigenen Webspace) werden Projekte, Inspektionen und Fotos zwischen Handy und PC synchronisiert.'),
      field('Server-Adresse', input(d.url, (v) => { d.url = v; }, { placeholder: 'leer = gleicher Webspace (…/api/)', inputmode: 'url', autocapitalize: 'off' })),
      h('div', { class: 'grid2' },
        field('Benutzer', input('', (v) => { d.user = v; }, { autocomplete: 'username', autocapitalize: 'off' })),
        field('Passwort', input('', (v) => { d.pass = v; }, { type: 'password', autocomplete: 'current-password' }))),
      h('div', { class: 'row wrap' },
        btn('Anmelden', { icon: 'user', variant: 'primary', onClick: async () => {
          try {
            s.serverUrl = d.url.trim(); await save();
            await sync.login(s.serverUrl, d.user.trim(), d.pass);
            toast('Angemeldet – Synchronisation läuft.', 'ok');
            renderServer();
          } catch (e) { toast('Anmeldung fehlgeschlagen: ' + e.message, 'error', 6000); }
        } }),
        btn('Verbindung testen', { variant: 'ghost', onClick: async () => {
          try { const r = await sync.ping(d.url.trim()); toast(`Server erreichbar (v${r.version}${r.ai ? ', KI aktiv' : ''}).`, 'ok'); } catch (e) { toast(e.message, 'error'); }
        } })));
  }

  async function usersSheet() {
    const listEl = h('div', { class: 'list' });
    const load = async () => {
      try {
        const { users } = await sync.users();
        clear(listEl, users.map((x) => h('div', { class: 'item', style: { cursor: 'default' } },
          h('div', { class: 'item-icon' }, icon('user')),
          h('div', { class: 'grow' }, h('b', x.name), h('div', { class: 'meta' }, h('span', x.username), h('span', x.role === 'admin' ? 'Administrator' : 'Inspekteur'), x.active ? null : h('span', { style: { color: 'var(--danger)' } }, 'gesperrt'))),
          btn('', { icon: 'edit', variant: 'ghost', aria: 'Bearbeiten', onClick: () => editUser(x) }))));
      } catch (e) { clear(listEl, h('p', { class: 'muted' }, e.message)); }
    };
    const editUser = (x) => {
      const d = x ? { ...x, password: '' } : { username: '', name: '', password: '', role: 'inspector', active: true };
      const s2 = sheet({
        title: x ? `Benutzer ${x.username}` : 'Neuer Benutzer',
        body: h('div', { class: 'stack' },
          x ? null : field('Benutzername', input('', (v) => { d.username = v; }, { autocapitalize: 'off' })),
          field('Name', input(d.name, (v) => { d.name = v; })),
          field(x ? 'Neues Passwort (leer = unverändert)' : 'Passwort (mind. 8 Zeichen)', input('', (v) => { d.password = v; }, { type: 'password', autocomplete: 'new-password' })),
          field('Rolle', select(d.role, [['inspector', 'Inspekteur'], ['admin', 'Administrator']], (v) => { d.role = v; })),
          x ? toggle(d.active, (v) => { d.active = v; }, 'aktiv') : null),
        actions: [btn('Speichern', { variant: 'primary', onClick: async () => {
          try { await sync.saveUser(d); toast('Gespeichert.', 'ok'); s2.close(); load(); } catch (e) { toast(e.message, 'error', 5000); }
        } })],
      });
    };
    sheet({ title: 'Benutzer', wide: true, body: h('div', { class: 'stack' }, listEl, btn('Benutzer anlegen', { icon: 'plus', variant: 'soft', onClick: () => editUser(null) })) });
    load();
  }

  function passwordSheet() {
    const d = { old: '', neu: '' };
    const s2 = sheet({
      title: 'Passwort ändern',
      body: h('div', { class: 'stack' },
        field('Altes Passwort', input('', (v) => { d.old = v; }, { type: 'password', autocomplete: 'current-password' })),
        field('Neues Passwort', input('', (v) => { d.neu = v; }, { type: 'password', autocomplete: 'new-password' }))),
      actions: [btn('Ändern', { variant: 'primary', onClick: async () => {
        try { await sync.changePassword(d.old, d.neu); toast('Passwort geändert.', 'ok'); s2.close(); } catch (e) { toast(e.message, 'error'); }
      } })],
    });
  }

  clear(view, topbar({ back: '#/', title: 'Einstellungen' }), main);
  main.append(h('div', { class: 'layout-2' },
    h('div', { class: 'stack' },
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Inspekteur & Firma'),
        field('Name des Inspekteurs', input(s.inspector, set('inspector'), { autocomplete: 'name', placeholder: 'Vor- und Nachname' }), 'Wird in jede neue Inspektion übernommen (ISYBAU „NameUntersucher“).'),
        field('Firma (Auftragnehmer)', input(s.company, set('company'), { autocomplete: 'organization' })),
        field('Höhenangaben für neue Projekte', select(s.bezugVertikal || '1', BEZUG_VERTIKAL, set('bezugVertikal')), 'Pro Projekt unter „Projekt & Auftrag“ änderbar.')),
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Darstellung'),
        field('Farbschema', select(s.theme || '', [['', 'automatisch (System)'], ['light', 'hell – besser bei Sonne'], ['dark', 'dunkel']], (v) => {
          s.theme = v; save();
          if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
        })),
        toggle(s.ai !== false, set('ai'), 'KI-Assistent anbieten (wenn der Server ihn unterstützt)'))),
    h('div', { class: 'stack' },
      serverBox,
      h('div', { class: 'card card-pad stack-sm' },
        h('h3', 'Speicher auf diesem Gerät'), storageEl,
        h('div', { class: 'row wrap' },
          btn('Alle lokalen Daten löschen', { icon: 'trash', variant: 'ghost', onClick: async () => {
            if (!(await confirmDialog('Wirklich alle Projekte, Inspektionen und Fotos auf diesem Gerät löschen? Nicht synchronisierte Daten gehen verloren.', { ok: 'Alles löschen', danger: true }))) return;
            await db.clear();
            toast('Lokale Daten gelöscht.');
            navigate('#/');
          } }))),
      h('div', { class: 'card card-pad stack-sm' },
        h('h3', `${APP_NAME} ${APP_VERSION}`),
        h('p', { class: 'muted small' }, 'Kodiersystem: DIN EN 13508-2:2011 mit nationaler Festlegung nach BFR Abwasser (ISYBAU, Stand 01/2025) bzw. DWA-M 149-2. Austauschformate: ISYBAU XML-2006, -2013, -2017, -2024 und DWA-M 150.'),
        h('p', { class: 'muted small' }, 'Die Kodierung bleibt fachliche Verantwortung des Inspekteurs. KI-Vorschläge und Foto-Tiefenschätzungen sind Hilfsmittel und ersetzen keine Prüfung bzw. kein Aufmaß.')))));
  renderServer();
  const info = await storageInfo();
  storageEl.textContent = info ? `${(info.used / 1048576).toFixed(1)} MB belegt von ca. ${(info.quota / 1073741824).toFixed(1)} GB verfügbar` : 'Speicherinfo nicht verfügbar.';
}
