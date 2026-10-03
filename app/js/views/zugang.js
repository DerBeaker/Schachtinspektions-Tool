// Seiten für Links aus E-Mails: Einladung annehmen (#/einladung/<token>) und
// neues Passwort festlegen (#/passwort/<token>). Server = gleicher Webspace wie die App.

import { h, clear, btn, toast, field, input, empty } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getSettings, saveSettings } from '../core/store.js';
import { sync } from '../sync.js';
import { APP_NAME, VENDOR } from '../brand.js';
import { rechtsLinks } from './rechtliches.js';

function passwortFelder(d) {
  return [
    field('Passwort (mind. 8 Zeichen)', input('', (v) => { d.pw = v; }, { type: 'password', autocomplete: 'new-password' })),
    field('Passwort wiederholen', input('', (v) => { d.pw2 = v; }, { type: 'password', autocomplete: 'new-password' })),
  ];
}
const pruefe = (d) => {
  if ((d.pw || '').length < 8) { toast('Das Passwort muss mindestens 8 Zeichen haben.', 'error'); return false; }
  if (d.pw !== d.pw2) { toast('Die Passwörter stimmen nicht überein.', 'error'); return false; }
  return true;
};

export async function renderEinladung(view, token) {
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: '#/', title: 'Einladung' }), main);
  const settings = await getSettings();
  const server = settings.serverUrl || '';
  let info;
  try {
    info = await sync.open('invite-info', { token }, server);
  } catch (e) {
    main.append(h('div', { class: 'card' }, empty('alert', 'Einladung nicht gültig', e.message)));
    return;
  }
  const d = { name: info.name || '', pw: '', pw2: '' };
  main.append(h('div', { class: 'card card-pad stack', style: { maxWidth: '520px', margin: '0 auto' } },
    h('h2', `Willkommen bei ${APP_NAME}`),
    h('p', null, `Sie wurden für „${info.firma}“ eingeladen${info.role === 'admin' ? ' – als Administrator Ihrer Firma' : ''}.`),
    h('p', { class: 'muted small' }, `Anmeldung künftig mit ${info.email}.`),
    field('Ihr Name', input(d.name, (v) => { d.name = v; }, { autocomplete: 'name' })),
    ...passwortFelder(d),
    btn('Zugang einrichten', { icon: 'check', variant: 'primary', block: true, onClick: async () => {
      if (!pruefe(d)) return;
      try {
        const res = await sync.open('invite-accept', { token, name: d.name, password: d.pw }, server);
        settings.serverUrl = server;
        if (!settings.inspector) settings.inspector = res.user.name;
        await saveSettings(settings);
        await sync.loginWith(server, res);
        toast(`Angemeldet – willkommen, ${res.user.name}!`, 'ok', 4000);
        navigate('#/', { replace: true });
      } catch (e) { toast(e.message, 'error', 5000); }
    } }),
    h('p', { class: 'muted small' }, 'Wie Ihre Daten verarbeitet werden, steht in den ', h('a', { href: '#/datenschutz' }, 'Datenschutzhinweisen'), '.'),
    h('p', { class: 'muted small' }, `${APP_NAME} · ${VENDOR} · `, rechtsLinks())));
}

export async function renderPasswort(view, token) {
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: '#/', title: 'Neues Passwort' }), main);
  const settings = await getSettings();
  const d = { pw: '', pw2: '' };
  main.append(h('div', { class: 'card card-pad stack', style: { maxWidth: '520px', margin: '0 auto' } },
    h('h2', 'Neues Passwort festlegen'),
    ...passwortFelder(d),
    btn('Passwort speichern', { icon: 'check', variant: 'primary', block: true, onClick: async () => {
      if (!pruefe(d)) return;
      try {
        await sync.open('reset', { token, password: d.pw }, settings.serverUrl || '');
        toast('Passwort geändert – bitte jetzt anmelden.', 'ok', 5000);
        navigate('#/settings', { replace: true });
      } catch (e) { toast(e.message, 'error', 5000); }
    } })));
}
