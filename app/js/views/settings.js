// Einstellungen: Inspekteur, Firma (für Berichte), Darstellung, Server-Anmeldung, Speicher, Über.

import { h, clear, btn, icon, toast, field, input, select, toggle, confirmDialog, sheet } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getSettings, saveSettings, storageInfo } from '../core/store.js';
import { sync } from '../sync.js';
import { db } from '../core/db.js';
import { BEZUG_VERTIKAL } from '../data/reflists.js';
import { APP_NAME, APP_VERSION, VENDOR, VENDOR_URL, VENDOR_WEB, VENDOR_TAGLINE } from '../brand.js';
import { pickFile } from '../lib/image.js';
import { debounce, fmtDate } from '../core/util.js';

export function lizenzText(l) {
  const teile = [];
  if (l.maxUsers) teile.push(`${l.activeUsers} von ${l.maxUsers} Benutzern`);
  else if (l.activeUsers != null) teile.push(`${l.activeUsers} aktive Benutzer`);
  if (l.validUntil) teile.push(`Lizenz gültig bis ${fmtDate(l.validUntil)}`);
  return teile.join(' · ');
}

/** Einladungslink anzeigen (falls keine E-Mail ankommt, kann er weitergegeben werden). */
export function linkSheet(r) {
  const ta = h('textarea', { class: 'input mono', rows: 3, readonly: true, style: { fontSize: '.8rem' } }, r.link);
  sheet({
    title: 'Einladung erstellt',
    body: h('div', { class: 'stack' },
      h('p', null, r.mailed ? `Eine E-Mail an ${r.email} ist unterwegs.` : `Der Server konnte keine E-Mail senden – bitte den Link an ${r.email} weitergeben.`),
      !r.mailed && r.mailError ? h('p', { class: 'muted small' }, `Grund: ${r.mailError}`) : null,
      ta,
      h('p', { class: 'muted small' }, 'Der Link ist 14 Tage gültig und funktioniert nur einmal.'),
      btn('Link kopieren', { icon: 'file', variant: 'soft', onClick: async () => {
        try { await navigator.clipboard.writeText(r.link); toast('Link kopiert.', 'ok'); } catch { ta.select(); toast('Text markiert – bitte kopieren.'); }
      } })),
  });
}

export async function renderSettings(view) {
  const s = await getSettings();
  const save = async () => { await saveSettings(s); };
  const set = (k) => (v) => { s[k] = v; save(); };
  // Firmendaten liegen mit Team-Server zentral beim Mandanten: Admins ändern sie für alle Geräte
  const zentral = !!sync.auth;
  const darfFirma = !zentral || sync.isAdmin();
  const pushFirma = debounce(async () => {
    if (!zentral || !sync.isAdmin()) return;
    try { await sync.saveFirma({ name: s.company, anschrift: s.companyAddress, kontakt: s.companyContact, logo: s.logo }); }
    catch (e) { toast('Firmendaten nicht gespeichert: ' + e.message, 'error', 5000); }
  }, 900);
  const setFirma = (k) => (v) => { s[k] = v; save(); pushFirma(); };
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
        u.role === 'admin' && sync.auth.lizenz ? h('div', { class: 'muted small' }, lizenzText(sync.auth.lizenz)) : null,
        sync.auth.features?.ai ? h('div', { class: 'badge badge-ai' }, '✦ KI-Assistent verfügbar') : null,
        h('div', { class: 'row wrap' },
          btn('Jetzt synchronisieren', { icon: 'refresh', onClick: async () => { try { await sync.run({ manual: true }); toast('Synchronisiert.', 'ok'); } catch (e) { toast(e.message, 'error'); } renderServer(); } }),
          u.role === 'admin' ? btn('Benutzer verwalten', { icon: 'user', variant: 'soft', onClick: usersSheet }) : null,
          u.operator ? btn('Betreiber-Bereich', { icon: 'layers', variant: 'soft', onClick: () => navigate('#/betrieb') }) : null,
          btn('Passwort ändern', { variant: 'ghost', onClick: passwordSheet }),
          btn('Abmelden', { icon: 'logout', variant: 'ghost', onClick: async () => { await sync.logout(); renderServer(); } })));
      return;
    }
    const d = { url: s.serverUrl || '', user: '', pass: '' };
    clear(serverBox,
      h('h3', 'Team-Server (optional)'),
      h('p', { class: 'muted small' }, 'Ohne Server arbeitet die App komplett auf diesem Gerät. Mit Server (PHP + MySQL auf dem eigenen Webspace) werden Projekte, Inspektionen und Fotos zwischen Handy und PC synchronisiert.'),
      window.SB_DEMO
        ? h('div', { class: 'issue warn' }, icon('info', 18), h('span', 'In dieser Demo-Vorschau gibt es keinen Server – Anmeldung und Betreiber-Bereich funktionieren erst in der installierten Version auf dem eigenen Webspace.'))
        : h('p', { class: 'muted small' }, 'Der Betreiber-Bereich (Firmen und Lizenzen verwalten) erscheint hier nach der Anmeldung mit dem Konto, das bei der Einrichtung (…/api/setup.php) angelegt wurde.'),
      field('Server-Adresse', input(d.url, (v) => { d.url = v; }, { placeholder: 'leer = gleicher Webspace (…/api/)', inputmode: 'url', autocapitalize: 'off' })),
      h('div', { class: 'grid2' },
        field('E-Mail oder Benutzer', input('', (v) => { d.user = v; }, { autocomplete: 'username', autocapitalize: 'off', inputmode: 'email' })),
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
          try {
            const r = await sync.ping(d.url.trim());
            if (r.installed === false) toast('Server erreichbar, aber noch nicht eingerichtet – bitte zuerst …/api/setup.php im Browser öffnen.', 'info', 7000);
            else toast(`Server erreichbar und eingerichtet (v${r.version}${r.ai ? ', KI aktiv' : ''}).`, 'ok');
          } catch (e) { toast(`${e.message} – ist der Ordner api/ hochgeladen und api/config.php angelegt?`, 'error', 7000); }
        } }),
        btn('Passwort vergessen?', { variant: 'ghost', onClick: () => passwortVergessen(d.url.trim(), d.user.trim()) })));
  }

  async function usersSheet() {
    const listEl = h('div', { class: 'list' });
    const invEl = h('div', { class: 'stack-sm' });
    const lizEl = h('p', { class: 'muted small' });
    const load = async () => {
      try {
        const [{ users, lizenz }, { invites }] = await Promise.all([sync.users(), sync.invites()]);
        if (lizenz) { sync.auth.lizenz = lizenz; lizEl.textContent = lizenzText(lizenz); }
        clear(listEl, users.map((x) => h('div', { class: 'item', style: { cursor: 'default' } },
          h('div', { class: 'item-icon' }, icon('user')),
          h('div', { class: 'grow' }, h('b', x.name), h('div', { class: 'meta' }, h('span', x.email || x.username), h('span', x.role === 'admin' ? 'Administrator' : 'Inspekteur'), x.active ? null : h('span', { style: { color: 'var(--danger)' } }, 'gesperrt'))),
          btn('', { icon: 'edit', variant: 'ghost', aria: 'Bearbeiten', onClick: () => editUser(x) }))));
        clear(invEl, invites.length ? [h('h3', 'Offene Einladungen'), ...invites.map((x) => h('div', { class: 'row between' },
          h('span', { class: 'small' }, `${x.email} · ${x.role === 'admin' ? 'Administrator' : 'Inspekteur'} · bis ${fmtDate(x.expires)}`),
          btn('Zurückziehen', { variant: 'ghost', small: true, onClick: async () => { await sync.revokeInvite(x.id); load(); } })))] : []);
      } catch (e) { clear(listEl, h('p', { class: 'muted' }, e.message)); }
    };
    const einladen = () => {
      const d = { email: '', name: '', role: 'inspector' };
      const s3 = sheet({
        title: 'Benutzer einladen',
        body: h('div', { class: 'stack' },
          h('p', { class: 'muted small' }, 'Die Person bekommt einen Link per E-Mail, legt ihr Passwort selbst fest und meldet sich danach mit der E-Mail-Adresse an.'),
          field('E-Mail-Adresse', input('', (v) => { d.email = v; }, { type: 'email', autocapitalize: 'off', inputmode: 'email' })),
          field('Name (optional)', input('', (v) => { d.name = v; })),
          field('Rolle', select(d.role, [['inspector', 'Inspekteur'], ['admin', 'Administrator']], (v) => { d.role = v; }))),
        actions: [btn('Einladung senden', { icon: 'upload', variant: 'primary', onClick: async () => {
          try { const r = await sync.invite(d); s3.close(); linkSheet(r); load(); } catch (e) { toast(e.message, 'error', 5000); }
        } })],
      });
    };
    const editUser = (x) => {
      const d = x ? { ...x, password: '' } : { username: '', name: '', password: '', role: 'inspector', active: true };
      const s2 = sheet({
        title: x ? `Benutzer ${x.username}` : 'Neuer Benutzer',
        body: h('div', { class: 'stack' },
          x ? null : field('Benutzername', input('', (v) => { d.username = v; }, { autocapitalize: 'off' })),
          field('Name', input(d.name, (v) => { d.name = v; })),
          field('E-Mail (Anmeldung, Passwort vergessen)', input(d.email || '', (v) => { d.email = v; }, { type: 'email', autocapitalize: 'off', inputmode: 'email' })),
          field(x ? 'Neues Passwort (leer = unverändert)' : 'Passwort (mind. 8 Zeichen)', input('', (v) => { d.password = v; }, { type: 'password', autocomplete: 'new-password' })),
          field('Rolle', select(d.role, [['inspector', 'Inspekteur'], ['admin', 'Administrator']], (v) => { d.role = v; })),
          x ? toggle(d.active, (v) => { d.active = v; }, 'aktiv') : null),
        actions: [btn('Speichern', { variant: 'primary', onClick: async () => {
          try { await sync.saveUser(d); toast('Gespeichert.', 'ok'); s2.close(); load(); } catch (e) { toast(e.message, 'error', 5000); }
        } })],
      });
    };
    sheet({ title: 'Benutzer', wide: true, body: h('div', { class: 'stack' }, lizEl, listEl,
      h('div', { class: 'row wrap' },
        btn('Per E-Mail einladen', { icon: 'upload', variant: 'primary', onClick: einladen }),
        btn('Direkt anlegen (mit Passwort)', { icon: 'plus', variant: 'soft', onClick: () => editUser(null) })),
      invEl) });
    load();
  }

  async function passwortVergessen(url, user) {
    const d = { email: /@/.test(user) ? user : '' };
    const s2 = sheet({
      title: 'Passwort vergessen',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, 'Sie bekommen einen Link per E-Mail, mit dem Sie ein neues Passwort festlegen. Ohne hinterlegte E-Mail-Adresse hilft der Administrator Ihrer Firma.'),
        field('E-Mail-Adresse', input(d.email, (v) => { d.email = v; }, { type: 'email', autocapitalize: 'off', inputmode: 'email' }))),
      actions: [btn('Link anfordern', { variant: 'primary', onClick: async () => {
        try {
          s.serverUrl = url; await save();
          await sync.open('reset-request', { email: d.email.trim() }, url);
          s2.close();
          toast('Wenn die Adresse bekannt ist, ist ein Link unterwegs.', 'ok', 5000);
        } catch (e) { toast(e.message, 'error'); }
      } })],
    });
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

  const logoBox = h('div', { class: 'logo-box' });
  function renderLogo() {
    clear(logoBox,
      s.logo ? h('img', { class: 'logo-preview', src: s.logo, alt: 'Firmenlogo' }) : h('div', { class: 'logo-preview empty muted small' }, 'kein Logo'),
      !darfFirma ? null : h('div', { class: 'row wrap' },
        btn(s.logo ? 'Ändern' : 'Logo wählen', { icon: 'image', variant: 'soft', small: true, onClick: async () => {
          const file = await pickFile('image/png,image/jpeg,image/svg+xml,image/webp');
          if (!file) return;
          try {
            const { logoAusDatei } = await import('./berichte.js');
            s.logo = await logoAusDatei(file);
            await save();
            pushFirma();
            renderLogo();
            toast('Logo gespeichert.', 'ok');
          } catch (e) { toast('Bild konnte nicht gelesen werden: ' + e.message, 'error'); }
        } }),
        s.logo ? btn('Entfernen', { icon: 'trash', variant: 'ghost', small: true, onClick: async () => { s.logo = ''; await save(); pushFirma(); renderLogo(); } }) : null));
  }
  renderLogo();

  clear(view, topbar({ back: '#/', title: 'Einstellungen' }), main);
  main.append(h('div', { class: 'layout-2' },
    h('div', { class: 'stack' },
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Inspekteur'),
        field('Name des Inspekteurs', input(s.inspector, set('inspector'), { autocomplete: 'name', placeholder: 'Vor- und Nachname' }), 'Wird in jede neue Inspektion übernommen (ISYBAU „NameUntersucher“).'),
        field('Höhenangaben für neue Projekte', select(s.bezugVertikal || '1', BEZUG_VERTIKAL, set('bezugVertikal')), 'Pro Projekt unter „Projekt & Auftrag“ änderbar.')),
      h('div', { class: 'card card-pad stack' },
        h('h3', 'Firma (Kopf der Berichte)'),
        zentral ? h('p', { class: 'muted small row' }, icon('cloud', 16), h('span', darfFirma
          ? 'Gilt für alle Geräte und Benutzer Ihrer Firma (Team-Server).'
          : 'Wird vom Administrator Ihrer Firma gepflegt und auf alle Geräte verteilt.')) : null,
        field('Firma (Auftragnehmer)', input(s.company, setFirma('company'), { autocomplete: 'organization', disabled: !darfFirma })),
        field('Anschrift', h('textarea', { class: 'input', rows: 2, placeholder: 'Straße Nr.\nPLZ Ort', disabled: !darfFirma, oninput: (e) => setFirma('companyAddress')(e.target.value) }, s.companyAddress || '')),
        field('Kontakt', input(s.companyContact, setFirma('companyContact'), { placeholder: 'Tel. · E-Mail · Web', disabled: !darfFirma })),
        h('div', { class: 'field', role: 'group', 'aria-label': 'Firmenlogo' },
          h('span', { class: 'field-label' }, 'Firmenlogo'),
          logoBox,
          h('span', { class: 'field-hint' }, zentral
            ? 'PNG oder JPG, erscheint oben rechts in Schachtprotokollen und im Aufmaß.'
            : 'PNG oder JPG, erscheint oben rechts in Schachtprotokollen und im Aufmaß. Ohne Team-Server nur auf diesem Gerät gespeichert.'))),
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
        h('div', { class: 'about-head' },
          h('img', { class: 'about-logo', src: './icons/mmse-logo.png', alt: VENDOR, width: 160, height: 87 }),
          h('div', { class: 'grow' },
            h('h3', `${APP_NAME} ${APP_VERSION}`),
            h('div', { class: 'small' }, `von ${VENDOR}`),
            h('div', { class: 'muted small' }, VENDOR_TAGLINE),
            h('a', { class: 'small', href: VENDOR_URL, target: '_blank', rel: 'noopener' }, VENDOR_WEB))),
        h('p', { class: 'muted small' }, 'Kodiersystem: DIN EN 13508-2:2011 mit nationaler Festlegung nach BFR Abwasser (ISYBAU, Stand 01/2025) bzw. DWA-M 149-2. Austauschformate: ISYBAU XML-2006, -2013, -2017, -2024 und DWA-M 150.'),
        h('p', { class: 'muted small' }, 'Die Kodierung bleibt fachliche Verantwortung des Inspekteurs. KI-Vorschläge und Foto-Tiefenschätzungen sind Hilfsmittel und ersetzen keine Prüfung bzw. kein Aufmaß.'),
        h('p', { class: 'muted small' }, `© ${new Date().getFullYear()} ${VENDOR} · Kartendaten © basemap.de / BKG, © OpenStreetMap-Mitwirkende · Leaflet (BSD-2-Clause)`)))));
  renderServer();
  const info = await storageInfo();
  storageEl.textContent = info ? `${(info.used / 1048576).toFixed(1)} MB belegt von ca. ${(info.quota / 1073741824).toFixed(1)} GB verfügbar` : 'Speicherinfo nicht verfügbar.';
}
