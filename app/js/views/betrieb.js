// Betreiber-Bereich (nur für den Betreiber der Installation, z. B. MMSE Software Engineering):
// Firmen (Mandanten) anlegen, Lizenz (Tarif, Benutzerzahl, Laufzeit) pflegen, sperren, Administrator
// einladen, Daten einer Firma exportieren oder löschen; Plattform-Einstellungen (Freigabe von
// Registrierung und Online-Verträgen, Testzeitraum, Preise) und Aufträge für die Rechnungsstellung.

import { h, clear, btn, icon, toast, field, input, select, toggle, sheet, menu, badge, empty, promptDialog } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { sync } from '../sync.js';
import { fmtDate, fmtRelative, download } from '../core/util.js';
import { VENDOR } from '../brand.js';
import { linkSheet, mailTestDialog } from './settings.js';
import { euro } from './konto.js';
import { VERTRAG_VERSION } from '../data/vertraege.js';

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
  const summary = h('div', { class: 'grid4' });
  const listEl = h('div', { class: 'list' });
  const freigabeEl = h('div');
  const auftragKnopf = h('button', { type: 'button', class: 'btn btn-soft', onclick: () => auftraegeSheet() }, icon('list', 20), h('span', 'Aufträge'));
  main.append(
    h('div', { class: 'row between wrap', style: { margin: '4px 0 12px', gap: '10px' } },
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Jede Firma sieht nur ihre eigenen Daten. Neue Firmen erhalten eine Einladung für ihren Administrator.'),
      h('div', { class: 'row wrap' },
        btn('E-Mail-Versand testen', { icon: 'upload', variant: 'ghost', onClick: mailTestDialog }),
        btn('Plattform & Preise', { icon: 'settings', variant: 'soft', onClick: plattformSheet }),
        auftragKnopf,
        btn('Firma anlegen', { icon: 'plus', variant: 'primary', onClick: () => bearbeiten(null) }))),
    freigabeEl, summary, h('div', { class: 'section-title' }, 'Firmen'), listEl);

  let tenants = [];
  let plattform = null;
  async function load() {
    try {
      ({ tenants, plattform } = await sync.opTenants());
    } catch (e) { clear(listEl, h('p', { class: 'muted' }, e.message)); return; }
    clear(freigabeEl, plattform && !plattform.freigegeben ? h('div', { class: 'issue warn', style: { marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' } }, icon('lock', 18),
      h('span', { class: 'grow' }, 'Registrierung, Online-Verträge (AGB/AVV) und Buchung sind noch nicht freigegeben. Erst einschalten, wenn die Texte rechtlich geprüft sind.'),
      btn('Plattform & Preise', { small: true, variant: 'soft', onClick: plattformSheet })) : null);
    const aktiv = tenants.filter((t) => t.active && !t.expired);
    const offen = tenants.reduce((s, t) => s + (t.offeneAuftraege || 0), 0);
    clear(auftragKnopf, icon('list', 20), h('span', offen ? `Aufträge (${offen} offen)` : 'Aufträge'));
    const kachel = (zahl, text) => h('div', { class: 'card card-pad' }, h('div', { style: { fontSize: '1.5rem', fontWeight: 800 } }, zahl), h('div', { class: 'muted small' }, text));
    const zahlend = tenants.filter((t) => t.plan === 'pro' && t.abo && !t.expired);
    const umsatz = zahlend.reduce((s, t) => s + (t.abo.intervall === 'jahr' ? t.abo.preis / 12 : t.abo.preis), 0);
    clear(summary,
      kachel(`${aktiv.length} / ${tenants.length}`, `Firmen aktiv (${tenants.filter((t) => t.plan === 'test' && !t.expired).length} im Test)`),
      kachel(String(tenants.reduce((s, t) => s + t.activeUsers, 0)), 'aktive Benutzer'),
      kachel(`${mb(tenants.reduce((s, t) => s + t.photoBytes, 0))} MB`, `Fotos (${tenants.reduce((s, t) => s + t.photos, 0)})`),
      kachel(euro(umsatz), `je Monat aus ${zahlend.length} Abo(s), netto`));
    clear(listEl, tenants.map((t) => {
      const status = !t.active ? badge('gesperrt', 'err') : t.expired ? badge(t.plan === 'test' ? 'Test abgelaufen' : 'Lizenz abgelaufen', 'err')
        : t.validUntil && t.validUntil < inTagen(31) ? badge(`${t.plan === 'test' ? 'Test bis' : 'läuft ab'} ${fmtDate(t.validUntil)}`, 'warn') : badge(t.own ? 'Betreiber' : 'aktiv', 'ok');
      const avv = t.own ? null : t.vertraege?.avv?.version === VERTRAG_VERSION.avv ? h('span', `AVV ${t.vertraege.avv.version} ✓ ${fmtDate(new Date(t.vertraege.avv.am * 1000).toISOString())}`) : h('span', { style: { color: 'var(--warn)' } }, 'AVV fehlt');
      const tarif = t.own ? null : t.abo ? h('span', `Pro ${t.abo.intervall === 'jahr' ? 'jährlich' : 'monatlich'} · ${euro(t.abo.preis)}${t.abo.endet ? ` · gekündigt zum ${fmtDate(t.abo.endet)}` : ''}`)
        : h('span', t.plan === 'test' ? 'Testzeitraum' : 'Pro (vom Betreiber)');
      return h('div', { class: 'item', style: { cursor: 'default', alignItems: 'flex-start' } },
        h('div', { class: 'item-icon' }, icon('folder')),
        h('div', { class: 'grow stack-sm' },
          h('div', { class: 'row between wrap' }, h('b', t.name), h('span', { class: 'row wrap', style: { gap: '6px' } },
            t.loeschfaellig ? badge('30 Tage abgelaufen – löschen?', 'err') : null, status)),
          h('div', { class: 'meta' }, tarif, avv,
            t.offeneAuftraege ? h('span', { style: { color: 'var(--warn)' } }, t.offeneAuftraege === 1 ? '1 offener Auftrag' : `${t.offeneAuftraege} offene Aufträge`) : null),
          h('div', { class: 'meta' },
            h('span', `${t.activeUsers}${t.maxUsers ? ' von ' + t.maxUsers : ''} Benutzer`),
            h('span', `${t.projects} Projekte`), h('span', `${t.inspections} Inspektionen`),
            h('span', `${t.photos} Fotos (${mb(t.photoBytes)} MB)`),
            t.validUntil ? h('span', `gültig bis ${fmtDate(t.validUntil)}`) : h('span', t.abo ? 'Abo läuft' : 'unbefristet'),
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
    const d = t ? { ...t, plan: t.plan === 'test' ? 'test' : 'pro', maxUsers: t.maxUsers ?? '', validUntil: t.validUntil || '' } : { name: '', contact: '', note: '', plan: 'test', maxUsers: '', validUntil: inTagen(30), active: true, adminEmail: '', adminName: '' };
    const gueltig = input(d.validUntil, (v) => { d.validUntil = v; }, { type: 'date' });
    const planSel = select(d.plan, [['test', 'Testzeitraum'], ['pro', 'Pro']], (v) => { d.plan = v; });
    const s = sheet({
      title: neu ? 'Neue Firma' : t.name,
      body: h('div', { class: 'stack' },
        field('Firmenname', input(d.name, (v) => { d.name = v; })),
        field('Ansprechpartner / Kontakt', input(d.contact, (v) => { d.contact = v; }, { placeholder: 'Name, Telefon, E-Mail' })),
        t?.own ? null : field('Tarif', planSel, t?.abo ? `Abo vom ${fmtDate(t.abo.gebucht)}: ${t.abo.benutzer} Benutzer, ${euro(t.abo.preis)} je ${t.abo.intervall === 'jahr' ? 'Jahr' : 'Monat'} – Rechnung an ${t.abo.rechnung?.email || '–'}` : null),
        h('div', { class: 'grid2' },
          field('Benutzer (max.)', input(d.maxUsers, (v) => { d.maxUsers = v; }, { type: 'number', min: 1, placeholder: 'unbegrenzt' })),
          field('Lizenz gültig bis', gueltig, 'leer = unbefristet (bzw. Abo bis zur Kündigung)')),
        h('div', { class: 'row wrap' },
          btn('Test 30 Tage', { small: true, variant: 'ghost', onClick: () => { d.validUntil = gueltig.value = inTagen(30); d.plan = planSel.value = 'test'; } }),
          btn('Pro 1 Jahr', { small: true, variant: 'ghost', onClick: () => { d.validUntil = gueltig.value = inTagen(365); d.plan = planSel.value = 'pro'; } }),
          btn('Pro unbefristet', { small: true, variant: 'ghost', onClick: () => { d.validUntil = gueltig.value = ''; d.plan = planSel.value = 'pro'; } })),
        neu ? h('div', { class: 'stack' },
          h('h3', 'Erster Administrator der Firma'),
          field('E-Mail-Adresse', input('', (v) => { d.adminEmail = v; }, { type: 'email', autocapitalize: 'off', inputmode: 'email' }), 'Bekommt eine Einladung und richtet sein Passwort selbst ein.'),
          field('Name', input('', (v) => { d.adminName = v; }))) : null,
        t && !t.own ? toggle(d.active, (v) => { d.active = v; }, 'Zugang aktiv (aus = Firma gesperrt)') : null,
        field('Notiz (nur für den Betreiber)', h('textarea', { class: 'input', rows: 2, oninput: (e) => { d.note = e.target.value; } }, d.note || ''))),
      actions: [btn(neu ? 'Firma anlegen' : 'Speichern', { variant: 'primary', onClick: async () => {
        try {
          const r = await sync.opSaveTenant({ id: t?.id, name: d.name, contact: d.contact, note: d.note, plan: d.plan, maxUsers: d.maxUsers, validUntil: d.validUntil, active: d.active, adminEmail: d.adminEmail, adminName: d.adminName });
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

  function plattformSheet() {
    const p = JSON.parse(JSON.stringify(plattform || {}));
    if (!p.preise) { toast('Plattform-Angaben noch nicht geladen.', 'info'); return; }
    const zahl = (k) => input(String(p.preise[k]).replace('.', ','), (v) => { p.preise[k] = Number(String(v).replace(',', '.')); }, { inputmode: 'decimal' });
    const s = sheet({
      title: 'Plattform & Preise', wide: true,
      body: h('div', { class: 'stack' },
        toggle(!!p.freigegeben, (v) => { p.freigegeben = v; }, 'Registrierung, Online-Verträge und Buchung freigeben'),
        h('p', { class: 'muted small' }, 'Eingeschaltet können sich Firmen selbst registrieren (mit Testzeitraum), Nutzungsbedingungen und AVV online annehmen und Pro buchen. Bitte erst einschalten, wenn die Texte rechtlich geprüft sind: ',
          h('a', { href: '#/agb' }, 'Nutzungsbedingungen'), ' · ', h('a', { href: '#/avv' }, 'AVV'), ' · ', h('a', { href: '#/datenschutz' }, 'Datenschutzhinweise'), '.'),
        field('Testzeitraum (Tage)', input(String(p.testTage), (v) => { p.testTage = parseInt(v, 10) || 30; }, { type: 'number', min: 1, max: 365 })),
        h('div', { class: 'grid2' },
          field('Preis je Monat (€, netto)', zahl('monat')),
          field('Preis je Jahr (€, netto)', zahl('jahr'))),
        h('div', { class: 'grid3' },
          field('Benutzer inklusive', zahl('inklusive')),
          field('je weiterer Benutzer / Monat', zahl('zusatzMonat')),
          field('je weiterer Benutzer / Jahr', zahl('zusatzJahr'))),
        field('Hinweis zur Umsatzsteuer', input(p.steuer, (v) => { p.steuer = v; }), 'z. B. „zzgl. gesetzlicher Umsatzsteuer“ oder als Kleinunternehmer „keine Umsatzsteuer nach § 19 UStG“.'),
        h('p', { class: 'muted small' }, 'Preisänderungen gelten für neue Buchungen. Laufende Abos behalten ihren Preis, bis Sie den Kunden informieren (Nutzungsbedingungen § 4: sechs Wochen vorher).')),
      actions: [btn('Speichern', { variant: 'primary', onClick: async () => {
        try { const r = await sync.opPlattform(p); plattform = r.plattform; s.close(); toast('Gespeichert.', 'ok'); load(); } catch (e) { toast(e.message, 'error', 5000); }
      } })],
    });
  }

  const ART = { registrierung: 'Registrierung', buchung: 'Buchung', aenderung: 'Änderung', kuendigung: 'Kündigung' };
  async function auftraegeSheet() {
    const listEl2 = h('div', { class: 'list' });
    const laden = async () => {
      let auftraege;
      try { ({ auftraege } = await sync.opAuftraege()); } catch (e) { clear(listEl2, h('p', { class: 'muted' }, e.message)); return; }
      if (!auftraege.length) { clear(listEl2, h('p', { class: 'muted' }, 'Noch keine Aufträge.')); return; }
      clear(listEl2, auftraege.map((a) => {
        const d = a.daten || {};
        const zeilen = [
          d.intervall ? `${d.benutzer} Benutzer · ${euro(d.preis)} je ${d.intervall === 'jahr' ? 'Jahr' : 'Monat'} · Abrechnung ab ${fmtDate(d.seit)}` : null,
          d.rechnung ? `Rechnung: ${d.rechnung.firma}, ${String(d.rechnung.anschrift || '').replace(/\s*\n\s*/g, ', ')} · ${d.rechnung.email}${d.rechnung.ustid ? ` · USt-IdNr. ${d.rechnung.ustid}` : ''}${d.rechnung.bestellnummer ? ` · Bestell-Nr. ${d.rechnung.bestellnummer}` : ''}` : null,
          d.endet ? `endet mit Ablauf des ${fmtDate(d.endet)}` : null,
          d.testBis ? `Test bis ${fmtDate(d.testBis)}` : null,
          d.von || null,
        ].filter(Boolean);
        const relevant = a.art !== 'registrierung';
        return h('div', { class: 'item', style: { cursor: 'default', alignItems: 'flex-start' } },
          h('div', { class: 'grow stack-sm' },
            h('div', { class: 'row between wrap' }, h('b', `${ART[a.art] || a.art} – ${a.firma}${a.geloescht ? ' (gelöscht)' : ''}`),
              relevant ? (a.erledigt ? badge('erledigt', 'ok') : badge('offen', 'warn')) : null),
            h('div', { class: 'muted small' }, new Date(a.am * 1000).toLocaleString('de-DE')),
            zeilen.map((z) => h('div', { class: 'small' }, z))),
          relevant ? btn(a.erledigt ? 'wieder öffnen' : 'erledigt', { small: true, variant: 'ghost', onClick: async () => {
            try { await sync.opAuftragErledigt(a.id, !a.erledigt); laden(); load(); } catch (e) { toast(e.message, 'error'); }
          } }) : null);
      }));
    };
    sheet({ title: 'Aufträge', wide: true, body: h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Buchungen, Änderungen und Kündigungen aus der App. „Erledigt“ markieren, sobald die Rechnung gestellt bzw. die Kündigung verbucht ist. Jede Buchung kommt zusätzlich per E-Mail.'),
      listEl2) });
    laden();
  }

  load();
}
