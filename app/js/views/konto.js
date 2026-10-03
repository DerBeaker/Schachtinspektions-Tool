// Tarife und Verträge: Basis/Pro (#/pro), Firmenkonto anlegen (#/registrieren), Bestätigungslink aus der
// E-Mail (#/registrierung/<token>), Abo & Verträge für Firmen-Administratoren (#/konto) und die
// Vertragstexte (#/agb, #/avv). Basis braucht kein Konto: Daten bleiben auf dem Gerät.

import { h, clear, btn, icon, toast, field, input, sheet, badge, empty, confirmDialog, segmented } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getSettings, saveSettings } from '../core/store.js';
import { sync } from '../sync.js';
import { fmtDate } from '../core/util.js';
import { APP_NAME, VENDOR, VENDOR_EMAIL, SPENDEN_URL } from '../brand.js';
import { VERTRAEGE, VERTRAG_VERSION } from '../data/vertraege.js';
import { rechtsLinks } from './rechtliches.js';

const heute = () => new Date().toISOString().slice(0, 10);
const tageBis = (iso) => Math.round((Date.parse(iso) - Date.parse(heute())) / 86400e3);
export const euro = (v) => Number(v).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number(v) % 1 ? 2 : 0 });
const anfrageLink = () => `mailto:${VENDOR_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} Pro`)}`;
const zeit = (ts) => new Date(ts * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Kurzer Text zum Tarif der Firma (Einstellungen, Startseite). */
export function planText(l) {
  if (!l) return '';
  if (l.plan === 'betreiber') return 'Betreiber – alle Funktionen';
  const ende = l.validUntil ? fmtDate(l.validUntil) : null;
  if (l.expired || (l.validUntil && l.validUntil < heute())) return `${l.plan === 'test' ? 'Testzeitraum' : 'Lizenz'} abgelaufen am ${ende} – Daten nur lesbar`;
  if (l.plan === 'test') { const n = tageBis(l.validUntil); return `Pro-Test bis ${ende} (noch ${n} ${n === 1 ? 'Tag' : 'Tage'})`; }
  if (l.abo) return `Pro · ${l.abo.intervall === 'jahr' ? 'jährlich' : 'monatlich'} · ${l.abo.benutzer} Benutzer${l.abo.endet ? ` · gekündigt zum ${fmtDate(l.abo.endet)}` : ''}`;
  return ende ? `Pro bis ${ende}` : 'Pro';
}

/** Freiwillige Unterstützung (PayPal) – öffnet sich in einem neuen Fenster. */
export function spendenLink(text = `${APP_NAME} unterstützen`) {
  return h('a', { class: 'spenden small', href: SPENDEN_URL, target: '_blank', rel: 'noopener' }, icon('heart', 16), h('span', text));
}

/** Kontrollkästchen mit Text; Links im Text bleiben klickbar. */
function haken(onChange, ...kids) {
  const cb = h('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) });
  return h('div', { class: 'check-row' }, cb,
    h('span', { onclick: (e) => { if (e.target.closest('a')) return; cb.checked = !cb.checked; onChange(cb.checked); } }, ...kids));
}

const vertragLink = (art, text) => h('a', { href: `#/${art}`, onclick: (e) => { e.preventDefault(); vertragSheet(art); } }, text);

/** Vertragstext als Artikel (Anzeige in der App). */
export function vertragArtikel(v, { kunde } = {}) {
  return h('article', { class: 'rechtstext stack-sm' },
    h('h1', v.titel),
    h('p', { class: 'muted small' }, `Fassung ${v.version} · Stand ${v.stand} · Entwurf zur rechtlichen Prüfung`),
    v.parteien ? h('div', { class: 'parteien small' },
      h('div', null, 'zwischen ', h('b', kunde?.name ? `${kunde.name}${kunde.anschrift ? ', ' + kunde.anschrift.replace(/\s*\n\s*/g, ', ') : ''}` : v.parteien.auftraggeber)),
      h('div', null, 'und ', h('b', v.parteien.auftragnehmer))) : null,
    v.abschnitte.map((a) => [h('h2', a.titel), a.absaetze.map((p) => (Array.isArray(p) ? h('ul', null, p.map((x) => h('li', null, x))) : h('p', null, p)))]));
}

function vertragSheet(art) {
  const v = VERTRAEGE[art];
  sheet({ title: v.kurz, wide: true, body: vertragArtikel(v), actions: [btn('Als PDF speichern', { icon: 'download', variant: 'soft', onClick: () => vertragPdfSpeichern(art) })] });
}

async function vertragPdfSpeichern(art, { kunde, annahme } = {}) {
  try {
    const [{ vertragPdf }, { offerFile }] = await Promise.all([import('../report/vertrag.js'), import('./berichte.js')]);
    const v = VERTRAEGE[art];
    const name = `${art === 'avv' ? 'AVV' : 'Nutzungsbedingungen'}_${APP_NAME}_${(kunde?.name || 'Entwurf').replace(/[^\wäöüÄÖÜß-]+/g, '_')}_Fassung_${v.version}.pdf`;
    await offerFile(vertragPdf(v, { kunde, annahme }), name, 'application/pdf');
  } catch (e) { toast('PDF konnte nicht erstellt werden: ' + e.message, 'error'); }
}

// ---------------------------------------------------------------- Vertragstexte (#/agb, #/avv)

export function renderVertrag(view, art) {
  const v = VERTRAEGE[art];
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: true, title: v.kurz, sub: APP_NAME }), main);
  main.append(h('div', { class: 'card card-pad' }, vertragArtikel(v)),
    h('div', { class: 'row center wrap', style: { margin: '14px 0' } },
      btn('Als PDF speichern', { icon: 'download', variant: 'soft', onClick: () => vertragPdfSpeichern(art) }),
      btn(art === 'avv' ? 'Nutzungsbedingungen' : 'Auftragsverarbeitungsvertrag', { variant: 'ghost', onClick: () => navigate(`#/${art === 'avv' ? 'agb' : 'avv'}`) })),
    h('p', { class: 'muted small', style: { textAlign: 'center' } }, `${APP_NAME} · ${VENDOR} · `, rechtsLinks()));
}

// ---------------------------------------------------------------- Basis und Pro (#/pro)

function planListe(punkte) {
  return h('ul', null, punkte.map(([ja, text]) => h('li', { class: ja ? null : 'nein' }, icon(ja ? 'check' : 'x', 16), h('span', text))));
}

export async function renderPro(view) {
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: true, title: `${APP_NAME} Pro`, sub: 'Tarife' }), main);
  const p = await sync.plattform();
  const pr = p.preise;
  const l = sync.auth?.lizenz;
  const aktion = () => {
    if (sync.auth) {
      if (l?.plan === 'betreiber') return h('p', { class: 'muted small' }, 'Sie sind als Betreiber angemeldet – alle Funktionen sind frei.');
      return sync.isAdmin()
        ? btn('Abo & Verträge', { icon: 'star', variant: 'primary', block: true, onClick: () => navigate('#/konto') })
        : h('p', { class: 'muted small' }, 'Das Abo Ihrer Firma verwaltet der Administrator.');
    }
    if (p.freigegeben) {
      return h('div', { class: 'stack-sm' },
        btn(`${p.testTage} Tage kostenlos testen`, { icon: 'star', variant: 'primary', block: true, onClick: () => navigate('#/registrieren') }),
        btn('Ich habe schon ein Firmenkonto', { variant: 'ghost', block: true, onClick: () => navigate('#/settings') }));
    }
    return h('div', { class: 'stack-sm' },
      h('a', { class: 'btn btn-primary btn-block', href: anfrageLink() }, icon('upload', 20), h('span', 'Pro anfragen (E-Mail)')),
      btn('Ich habe schon ein Firmenkonto', { variant: 'ghost', block: true, onClick: () => navigate('#/settings') }));
  };
  main.append(
    h('p', { class: 'muted', style: { margin: '4px 0 14px' } }, `${APP_NAME} Basis ist kostenlos und braucht keine Anmeldung. Für die Abgabe beim Auftraggeber (XML) und die Arbeit im Team gibt es ${APP_NAME} Pro.`),
    h('div', { class: 'plan-grid' },
      h('div', { class: 'card card-pad plan' },
        h('h3', `${APP_NAME} Basis`),
        h('div', null, h('span', { class: 'preis' }, 'kostenlos'), h('div', { class: 'muted small' }, 'ohne Anmeldung, ohne Konto')),
        planListe([
          [true, 'Stammdaten importieren (ISYBAU 2006–2024, DWA-M 150)'],
          [true, 'Schächte fotografieren, Anschlüsse und Schäden kodieren'],
          [true, 'Zustandsklassen nach BFR Abwasser, Bauteile, 3D-Modell, Karte'],
          [true, 'Schachtprotokolle (PDF) und Aufmaß (PDF/Excel)'],
          [true, 'Daten nur auf diesem Gerät – niemand sonst sieht sie'],
          [false, 'XML-Export für den Auftraggeber'],
          [false, 'Abgleich zwischen Handy, PC und Kollegen'],
        ]),
        h('div', { class: 'grow' }),
        sync.auth ? null : btn('Einfach loslegen', { variant: 'soft', block: true, onClick: () => navigate('#/') })),
      h('div', { class: 'card card-pad plan pro' },
        h('div', { class: 'row between' }, h('h3', `${APP_NAME} Pro`), badge('Firmenkonto', 'info')),
        h('div', null,
          h('span', { class: 'preis' }, euro(pr.monat)), h('span', { class: 'muted' }, ' / Monat'),
          h('div', { class: 'muted small' }, `${p.steuer} · inkl. ${pr.inklusive} Benutzer, jeder weitere ${euro(pr.zusatzMonat)} / Monat`),
          h('div', { class: 'muted small' }, `oder ${euro(pr.jahr)} / Jahr${pr.jahr < pr.monat * 12 ? ` (${Math.round(12 - pr.jahr / pr.monat)} Monate geschenkt)` : ''}`)),
        planListe([
          [true, 'alles aus Basis'],
          [true, 'XML-Export: ISYBAU 2006, 2013, 2017, 2024 und DWA-M 150 – mit Fotos als ZIP'],
          [true, 'Firmenkonto: Handy, Tablet und PC gleichen sich automatisch ab'],
          [true, 'Benutzer einladen, Firmendaten und Logo zentral'],
          [true, 'Daten zusätzlich auf dem Server (Hosting in Deutschland)'],
          [true, `${p.testTage} Tage kostenlos testen – endet automatisch`],
          [true, 'monatlich kündbar, Zahlung per Rechnung'],
        ]),
        h('div', { class: 'grow' }),
        aktion())),
    h('div', { class: 'card card-pad stack-sm', style: { marginTop: '14px' } },
      h('h3', 'Häufige Fragen'),
      h('p', { class: 'small' }, h('b', 'Warum ist Basis ohne Anmeldung? '), 'Ohne Konto bleiben alle Daten im Browser auf Ihrem Gerät. Es gibt keinen gemeinsamen Zugang, über den andere Firmen Ihre Daten sehen könnten.'),
      h('p', { class: 'small' }, h('b', 'Und mit Pro? '), 'Jede Firma bekommt ein eigenes Firmenkonto. Der Server trennt die Daten streng nach Firma – Ihre Benutzer sehen nur Ihre Projekte.'),
      h('p', { class: 'small' }, h('b', 'Was passiert nach dem Test? '), 'Ohne Buchung bleibt das Firmenkonto 30 Tage lesbar, danach wird es gelöscht. Es entstehen keine Kosten.'),
      h('p', { class: 'small' }, h('b', 'Datenschutz: '), 'Mit dem Firmenkonto schließen Sie online einen Auftragsverarbeitungsvertrag (AVV) nach Art. 28 DSGVO ab. ',
        vertragLink('avv', 'AVV lesen'), ' · ', vertragLink('agb', 'Nutzungsbedingungen'), ' · ', h('a', { href: '#/datenschutz' }, 'Datenschutzhinweise'))),
    h('p', { class: 'row center', style: { margin: '18px 0 4px' } }, spendenLink(`Gefällt Ihnen ${APP_NAME}? Freiwillig unterstützen`)),
    h('p', { class: 'muted small', style: { textAlign: 'center' } }, `${APP_NAME} · ${VENDOR} · `, rechtsLinks()));
}

// ---------------------------------------------------------------- Registrierung (#/registrieren)

export async function renderRegistrieren(view) {
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: '#/pro', title: 'Firmenkonto anlegen', sub: `${APP_NAME} Pro testen` }), main);
  const box = h('div', { class: 'card card-pad stack', style: { maxWidth: '620px', margin: '0 auto' } });
  main.append(box);
  if (sync.auth) {
    clear(box, empty('user', 'Sie sind bereits angemeldet', `Angemeldet bei ${sync.auth.user?.tenant || 'Ihrer Firma'}. Weitere Kollegen lädt der Administrator unter Einstellungen → Benutzer verwalten ein.`,
      btn('Abo & Verträge', { variant: 'soft', onClick: () => navigate('#/konto') })));
    return;
  }
  const p = await sync.plattform();
  if (!p.freigegeben) {
    clear(box, empty('lock', 'Registrierung noch nicht geöffnet', p.server
      ? `Firmenkonten richtet ${VENDOR} derzeit auf Anfrage ein.`
      : 'Die Registrierung ist in dieser Version nicht verfügbar.',
    h('a', { class: 'btn btn-soft', href: anfrageLink() }, 'Anfrage per E-Mail')));
    return;
  }
  const settings = await getSettings();
  const d = { firma: settings.company || '', anschrift: settings.companyAddress || '', name: settings.inspector || '', funktion: '', email: '', pw: '', pw2: '', website: '', unternehmer: false, agb: false, avv: false };
  const knopf = btn('Firmenkonto anlegen', { icon: 'check', variant: 'primary', block: true, onClick: absenden });
  clear(box,
    h('h2', `${p.testTage} Tage ${APP_NAME} Pro kostenlos`),
    h('p', { class: 'muted small' }, 'Keine Zahlungsdaten nötig. Der Test endet automatisch; Kosten entstehen nur, wenn Sie Pro später ausdrücklich buchen. Sie bekommen eine E-Mail mit einem Bestätigungslink.'),
    field('Firma', input(d.firma, (v) => { d.firma = v; }, { autocomplete: 'organization' })),
    field('Anschrift der Firma', h('textarea', { class: 'input', rows: 2, placeholder: 'Straße Nr.\nPLZ Ort', oninput: (e) => { d.anschrift = e.target.value; } }, d.anschrift), 'Vertragspartner im AVV und Kopf Ihrer Berichte.'),
    h('div', { class: 'grid2' },
      field('Ihr Name', input(d.name, (v) => { d.name = v; }, { autocomplete: 'name' })),
      field('Ihre Funktion', input('', (v) => { d.funktion = v; }, { placeholder: 'z. B. Geschäftsführer' }))),
    field('E-Mail-Adresse (Anmeldung)', input('', (v) => { d.email = v; }, { type: 'email', autocomplete: 'email', autocapitalize: 'off', inputmode: 'email' })),
    h('div', { class: 'grid2' },
      field('Passwort (mind. 8 Zeichen)', input('', (v) => { d.pw = v; }, { type: 'password', autocomplete: 'new-password' })),
      field('Passwort wiederholen', input('', (v) => { d.pw2 = v; }, { type: 'password', autocomplete: 'new-password' }))),
    h('div', { class: 'hp-feld', 'aria-hidden': 'true' }, h('label', null, 'Webseite (bitte leer lassen)', input('', (v) => { d.website = v; }, { tabindex: -1, autocomplete: 'off' }))),
    h('div', { class: 'stack-sm' },
      haken((v) => { d.unternehmer = v; }, 'Ich handle für ein Unternehmen bzw. einen öffentlichen Auftraggeber und darf die Firma vertreten.'),
      haken((v) => { d.agb = v; }, 'Ich akzeptiere die ', vertragLink('agb', `Nutzungsbedingungen (Fassung ${VERTRAG_VERSION.agb})`), '.'),
      haken((v) => { d.avv = v; }, 'Ich schließe für die Firma den ', vertragLink('avv', `Auftragsverarbeitungsvertrag nach Art. 28 DSGVO (Fassung ${VERTRAG_VERSION.avv})`), ' mit ', VENDOR, ' ab.')),
    knopf,
    h('p', { class: 'muted small' }, 'Wie wir Ihre Angaben verarbeiten, steht in den ', h('a', { href: '#/datenschutz' }, 'Datenschutzhinweisen'), '. Name, Funktion und Zeitpunkt der Vertragsannahme werden als Nachweis gespeichert.'));

  async function absenden() {
    if (!d.firma.trim() || d.anschrift.trim().length < 8) return toast('Bitte Firma und vollständige Anschrift angeben.', 'error');
    if (!d.name.trim() || !d.funktion.trim()) return toast('Bitte Ihren Namen und Ihre Funktion angeben.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return toast('Bitte eine gültige E-Mail-Adresse angeben.', 'error');
    if (d.pw.length < 8) return toast('Das Passwort muss mindestens 8 Zeichen haben.', 'error');
    if (d.pw !== d.pw2) return toast('Die Passwörter stimmen nicht überein.', 'error');
    if (!d.unternehmer || !d.agb || !d.avv) return toast('Bitte die drei Kästchen bestätigen.', 'error');
    knopf.disabled = true;
    try {
      await sync.open('register', {
        firma: d.firma.trim(), anschrift: d.anschrift.trim(), name: d.name.trim(), funktion: d.funktion.trim(), email: d.email.trim(),
        password: d.pw, unternehmer: true, agb: VERTRAG_VERSION.agb, avv: VERTRAG_VERSION.avv, website: d.website,
      }, settings.serverUrl || '');
      clear(box, empty('upload', 'Fast geschafft!', `Wir haben eine E-Mail an ${d.email.trim()} geschickt. Bitte öffnen Sie den Link darin (48 Stunden gültig) – dann ist Ihr Firmenkonto eingerichtet. Keine E-Mail? Bitte auch im Spam-Ordner nachsehen.`,
        btn('Zur Startseite', { variant: 'soft', onClick: () => navigate('#/') })));
    } catch (e) {
      knopf.disabled = false;
      toast(e.message, 'error', 6000);
    }
  }
}

// ---------------------------------------------------------------- Bestätigungslink (#/registrierung/<token>)

export async function renderRegistrierung(view, token) {
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: '#/', title: 'Firmenkonto' }), main);
  const box = h('div', { class: 'card card-pad stack', style: { maxWidth: '560px', margin: '0 auto' } }, h('p', { class: 'muted' }, 'Firmenkonto wird eingerichtet …'));
  main.append(box);
  const settings = await getSettings();
  const willkommen = () => {
    const l = sync.auth?.lizenz;
    clear(box,
      h('h2', `Willkommen bei ${APP_NAME} Pro!`),
      h('p', null, `Das Firmenkonto für „${sync.auth?.user?.tenant || 'Ihre Firma'}“ ist eingerichtet. Sie sind Administrator.`),
      l?.validUntil ? h('p', { class: 'muted small' }, `Pro ist bis einschließlich ${fmtDate(l.validUntil)} kostenlos freigeschaltet. Eine Bestätigung mit den angenommenen Verträgen ist per E-Mail unterwegs.`) : null,
      h('div', { class: 'stack-sm' },
        btn('Los geht’s – zu den Projekten', { icon: 'folder', variant: 'primary', block: true, onClick: () => navigate('#/', { replace: true }) }),
        btn('Kollegen einladen', { icon: 'user', variant: 'soft', block: true, onClick: () => navigate('#/settings') }),
        btn('AVV als PDF speichern', { icon: 'download', variant: 'ghost', block: true, onClick: () => navigate('#/konto') })),
      h('p', { class: 'muted small' }, 'Tipp: Projekte, die Sie bisher nur auf diesem Gerät hatten, werden jetzt mit dem Firmenkonto abgeglichen.'));
  };
  try {
    const res = await sync.open('register-confirm', { token }, settings.serverUrl || '');
    settings.serverUrl = settings.serverUrl || '';
    if (!settings.inspector) settings.inspector = res.user.name;
    await saveSettings(settings);
    await sync.loginWith(settings.serverUrl, res);
    willkommen();
  } catch (e) {
    if (sync.auth) { willkommen(); return; } // z. B. Link ein zweites Mal geöffnet
    clear(box, empty('alert', 'Das hat nicht geklappt', e.message,
      btn('Anmelden', { variant: 'soft', onClick: () => navigate('#/settings') }),
      btn('Neu registrieren', { variant: 'ghost', onClick: () => navigate('#/registrieren') })));
  }
}

// ---------------------------------------------------------------- Abo & Verträge (#/konto)

const AUFTRAG_TEXT = { registrierung: 'Firmenkonto angelegt (Testzeitraum)', buchung: 'Pro gebucht', aenderung: 'Abo geändert', kuendigung: 'Gekündigt' };

export async function renderKonto(view) {
  const main = h('main', { class: 'main' });
  clear(view, topbar({ back: '#/settings', title: 'Abo & Verträge', sub: sync.auth?.user?.tenant || APP_NAME }), main);
  if (!sync.auth) { navigate('#/pro', { replace: true }); return; }
  if (!sync.isAdmin()) {
    main.append(h('div', { class: 'card card-pad stack-sm' }, h('h3', 'Tarif Ihrer Firma'), h('p', null, planText(sync.auth.lizenz)),
      h('p', { class: 'muted small' }, 'Abo und Verträge verwaltet der Administrator Ihrer Firma.')));
    return;
  }
  const statusEl = h('div', { class: 'card card-pad stack' });
  const vertragEl = h('div', { class: 'card card-pad stack' });
  const verlaufEl = h('div', { class: 'card card-pad stack-sm' });
  main.append(h('div', { class: 'layout-2' }, h('div', { class: 'stack' }, statusEl, verlaufEl), h('div', { class: 'stack' }, vertragEl)));
  let k;
  const laden = async () => {
    try { k = await sync.konto(); } catch (e) { clear(statusEl, h('p', { class: 'muted' }, e.message)); return; }
    zeichnen();
  };

  function zeichnen() {
    const { lizenz: l, abo, plattform: p, firma } = k;
    const betreiber = l.plan === 'betreiber';
    const abgelaufen = l.expired;
    const laeuft = abo && !abo.endet;
    const darfBuchen = !betreiber && !laeuft && (l.plan === 'test' || abgelaufen || !!l.validUntil || !!abo);
    clear(statusEl,
      h('div', { class: 'row between wrap' }, h('h3', 'Tarif'),
        betreiber ? badge('Betreiber', 'ok') : abgelaufen ? badge('nur lesen', 'err') : l.plan === 'test' ? badge('Test', 'warn') : badge('Pro', 'ok')),
      h('p', null, planText(l)),
      abo ? h('div', { class: 'muted small stack-sm' },
        h('div', null, `${euro(abo.preis)} je ${abo.intervall === 'jahr' ? 'Jahr' : 'Monat'} ${p.steuer} · ${abo.benutzer} Benutzer · Abrechnung ab ${fmtDate(abo.seit)}`),
        abo.rechnung ? h('div', null, `Rechnung an ${abo.rechnung.firma}, ${abo.rechnung.email}`) : null,
        abo.endet ? h('div', null, `Gekündigt am ${fmtDate(abo.gekuendigt)} – endet mit Ablauf des ${fmtDate(abo.endet)}.`) : null) : null,
      abgelaufen ? h('div', { class: 'issue warn' }, icon('alert', 18), h('span', 'Ihre Daten sind weiter auf den Geräten und auf dem Server lesbar. Neue Änderungen werden erst wieder übertragen, wenn Pro gebucht ist.')) : null,
      betreiber ? null : h('div', { class: 'row wrap' },
        darfBuchen ? btn('Pro buchen', { icon: 'star', variant: 'primary', onClick: () => buchen(false) }) : null,
        laeuft ? btn('Benutzer / Abrechnung ändern', { icon: 'edit', variant: 'soft', onClick: () => buchen(true) }) : null,
        laeuft ? btn('Kündigen', { variant: 'ghost', onClick: kuendigen }) : null,
        btn('Tarife ansehen', { variant: 'ghost', onClick: () => navigate('#/pro') })),
      !p.freigegeben && !betreiber ? h('p', { class: 'muted small' }, `Online-Buchung ist noch nicht freigeschaltet – bitte an `, h('a', { href: anfrageLink() }, VENDOR_EMAIL), ' schreiben.') : null);
    zeichneVertraege(l, p, firma, betreiber);
    clear(verlaufEl, h('h3', 'Verlauf'),
      k.auftraege.length ? k.auftraege.map((a) => h('div', { class: 'row between small' }, h('span', AUFTRAG_TEXT[a.art] || a.art), h('span', { class: 'muted' }, zeit(a.am))))
        : h('p', { class: 'muted small' }, 'Noch keine Buchungen.'));
  }

  function zeichneVertraege(l, p, firma, betreiber) {
    const kunde = { name: firma.name, anschrift: firma.anschrift };
    const letzte = (art) => k.vertraege.find((v) => v.art === art);
    const zeile = (art) => {
      const v = VERTRAEGE[art];
      const a = letzte(art);
      const aktuell = a && a.version === v.version;
      return h('div', { class: 'stack-sm', style: { paddingBottom: '8px', borderBottom: '1px solid var(--border)' } },
        h('div', { class: 'row between wrap' }, h('b', v.kurz), aktuell ? badge(`Fassung ${a.version} angenommen`, 'ok') : badge(a ? `neue Fassung ${v.version}` : 'nicht angenommen', 'warn')),
        a ? h('div', { class: 'muted small' }, `${zeit(a.am)} · ${a.name}${a.funktion ? ` (${a.funktion})` : ''}`) : null,
        h('div', { class: 'row wrap' },
          btn('Lesen', { small: true, variant: 'ghost', onClick: () => vertragSheet(art) }),
          btn(aktuell ? 'PDF mit Annahme' : 'PDF', { small: true, variant: 'soft', icon: 'download', onClick: () => vertragPdfSpeichern(art, { kunde, annahme: aktuell ? a : null }) })));
    };
    if (betreiber) {
      clear(vertragEl, h('h3', 'Verträge'), h('p', { class: 'muted small' }, 'Für die Firma des Betreibers sind keine Verträge nötig. Die Texte für Ihre Kunden:'),
        h('div', { class: 'row wrap' }, btn('Nutzungsbedingungen', { variant: 'soft', onClick: () => navigate('#/agb') }), btn('AVV', { variant: 'soft', onClick: () => navigate('#/avv') })));
      return;
    }
    const offen = Object.keys(VERTRAEGE).filter((art) => letzte(art)?.version !== VERTRAEGE[art].version);
    const d = { name: sync.auth.user?.name || '', funktion: '', ok: false };
    clear(vertragEl, h('h3', 'Verträge'),
      h('p', { class: 'muted small' }, `Mit dem Firmenkonto verarbeitet ${VENDOR} Daten Ihrer Firma in Ihrem Auftrag. Dafür gibt es den Auftragsverarbeitungsvertrag (AVV) nach Art. 28 DSGVO.`),
      zeile('agb'), zeile('avv'),
      offen.length && p.freigegeben ? h('div', { class: 'stack' },
        h('h3', offen.length === 2 ? 'Verträge jetzt annehmen' : `${VERTRAEGE[offen[0]].kurz} annehmen`),
        h('div', { class: 'grid2' },
          field('Ihr Name', input(d.name, (v) => { d.name = v; }, { autocomplete: 'name' })),
          field('Ihre Funktion', input('', (v) => { d.funktion = v; }, { placeholder: 'z. B. Geschäftsführer' }))),
        haken((v) => { d.ok = v; }, `Ich darf die Firma vertreten und nehme für „${firma.name}“ an: `,
          ...offen.flatMap((art, i) => [i ? ' und ' : '', vertragLink(art, `${VERTRAEGE[art].kurz} (Fassung ${VERTRAEGE[art].version})`)]), '.'),
        btn('Verbindlich annehmen', { icon: 'check', variant: 'primary', onClick: async () => {
          if (!d.name.trim() || !d.funktion.trim()) return toast('Bitte Name und Funktion angeben.', 'error');
          if (!d.ok) return toast('Bitte das Kästchen bestätigen.', 'error');
          try {
            k = await sync.vertragAnnehmen({ arten: offen, versionen: Object.fromEntries(offen.map((a) => [a, VERTRAEGE[a].version])), name: d.name.trim(), funktion: d.funktion.trim() });
            toast('Angenommen – eine Bestätigung ist per E-Mail unterwegs.', 'ok', 5000);
            zeichnen();
          } catch (e) { toast(e.message, 'error', 6000); }
        } })) : null);
  }

  function buchen(aenderung) {
    const { lizenz: l, abo, plattform: p, firma } = k;
    const pr = p.preise;
    const d = {
      intervall: abo?.intervall || 'monat', benutzer: String(Math.max(abo?.benutzer || pr.inklusive, l.activeUsers)),
      firma: abo?.rechnung?.firma || firma.name, anschrift: abo?.rechnung?.anschrift || firma.anschrift || '',
      email: abo?.rechnung?.email || sync.auth.user?.email || '', ustid: abo?.rechnung?.ustid || '', bestellnummer: '', ok: false,
    };
    const preisEl = h('div', { class: 'preis', style: { fontSize: '1.4rem', fontWeight: 800 } });
    const preisInfo = h('div', { class: 'muted small' });
    const rechnen = () => {
      const n = Math.max(1, parseInt(d.benutzer, 10) || 0);
      const extra = Math.max(0, n - pr.inklusive);
      const jahr = d.intervall === 'jahr';
      const preis = jahr ? pr.jahr + extra * pr.zusatzJahr : pr.monat + extra * pr.zusatzMonat;
      preisEl.textContent = `${euro(preis)} je ${jahr ? 'Jahr' : 'Monat'}`;
      preisInfo.textContent = `${p.steuer} · inkl. ${pr.inklusive} Benutzer${extra ? `, ${extra} weitere à ${euro(jahr ? pr.zusatzJahr : pr.zusatzMonat)}` : ''}`;
    };
    const testBis = l.plan === 'test' && !l.expired ? l.validUntil : null;
    const s = sheet({
      title: aenderung ? 'Abo ändern' : `${APP_NAME} Pro buchen`,
      body: h('div', { class: 'stack' },
        segmented(d.intervall, [['monat', 'monatlich'], ['jahr', 'jährlich']], (v) => { d.intervall = v; rechnen(); }),
        field('Benutzer', input(d.benutzer, (v) => { d.benutzer = v; rechnen(); }, { type: 'number', min: Math.max(1, l.activeUsers), inputmode: 'numeric' }), `Derzeit ${l.activeUsers} aktiv.`),
        h('div', null, preisEl, preisInfo),
        testBis && !aenderung ? h('p', { class: 'small' }, `Sie testen noch bis ${fmtDate(testBis)} – die Abrechnung beginnt erst danach.`) : null,
        h('h3', 'Rechnung'),
        field('Firma', input(d.firma, (v) => { d.firma = v; })),
        field('Anschrift', h('textarea', { class: 'input', rows: 2, oninput: (e) => { d.anschrift = e.target.value; } }, d.anschrift)),
        h('div', { class: 'grid2' },
          field('E-Mail für Rechnungen', input(d.email, (v) => { d.email = v; }, { type: 'email', autocapitalize: 'off', inputmode: 'email' })),
          field('USt-IdNr. (optional)', input(d.ustid, (v) => { d.ustid = v; }))),
        field('Ihre Bestellnummer (optional)', input('', (v) => { d.bestellnummer = v; })),
        haken((v) => { d.ok = v; }, `Ich bestelle ${APP_NAME} Pro für die Firma kostenpflichtig zu den angezeigten Preisen. Es gelten die `, vertragLink('agb', 'Nutzungsbedingungen'),
          ' (Kündigung bei monatlicher Abrechnung zum Monatsende, bei jährlicher zum Ende des Vertragsjahres).'),
        h('p', { class: 'muted small' }, 'Zahlung per Rechnung (14 Tage, im Voraus je Abrechnungszeitraum). Die Bestätigung kommt per E-Mail.')),
      actions: [btn(aenderung ? 'Änderung verbindlich bestellen' : 'Zahlungspflichtig bestellen', { variant: 'primary', onClick: async () => {
        if (!d.ok) return toast('Bitte die Bestellung bestätigen.', 'error');
        try {
          k = await sync.buchen({ intervall: d.intervall, benutzer: parseInt(d.benutzer, 10) || 0, bestellt: true,
            rechnung: { firma: d.firma.trim(), anschrift: d.anschrift.trim(), email: d.email.trim(), ustid: d.ustid.trim(), bestellnummer: d.bestellnummer.trim() } });
          s.close();
          toast(aenderung ? 'Änderung gespeichert – Bestätigung per E-Mail.' : `Danke! ${APP_NAME} Pro ist gebucht – Bestätigung per E-Mail.`, 'ok', 6000);
          zeichnen();
          sync.run();
        } catch (e) { toast(e.message, 'error', 6000); }
      } })],
    });
    rechnen();
  }

  async function kuendigen() {
    const abo = k.abo;
    const text = abo.intervall === 'jahr' ? 'zum Ende des laufenden Vertragsjahres' : 'zum Ende des laufenden Abrechnungsmonats';
    if (!(await confirmDialog(`${APP_NAME} Pro ${text} kündigen? Bis dahin bleibt alles nutzbar; danach sind die Daten noch 30 Tage lesbar.`, { title: 'Abo kündigen', ok: 'Kündigen', danger: true }))) return;
    try {
      k = await sync.kuendigen();
      toast(`Gekündigt zum ${fmtDate(k.abo.endet)} – Bestätigung per E-Mail.`, 'ok', 6000);
      zeichnen();
    } catch (e) { toast(e.message, 'error', 6000); }
  }

  laden();
}
