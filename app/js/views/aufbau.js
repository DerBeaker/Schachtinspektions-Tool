// Reiter „Aufbau“ der Inspektion: Bauteilbeschreibung des Schachts (ISYBAU-Stammdaten
// Knoten/Schacht) mit Höhenbilanz und drehbarem 3D-Modell.

import { h, clear, btn, icon, field, numInput, select, toggle, segmented, confirmDialog, toast, sheet } from '../core/ui.js';
import { REF } from '../data/reflists.js';
import { normBauteile, hatBauteile, regelschacht, hoehenbilanz } from '../isybau/bauteile.js';
import { debounce, fmtNum } from '../core/util.js';
import { FARBEN } from '../components/modell3d.js';

const opt = (list) => [['', '–'], ...list];
// kurze Beschriftungen für die Formwahl (Werte = ISYBAU G305/G308)
const FORM_KURZ = [['R', 'rund'], ['E', 'eckig'], ['Z', 'andere']];
const UNTERTEIL_KURZ = [['R', 'rund'], ['E', 'eckig'], ['O', 'ohne'], ['Z', 'andere']];
const zahl = (v) => (v === '' || v == null ? null : Number(v));
const LEGENDE = [
  ['Abdeckung/Rahmen', FARBEN.rahmen], ['Auflageringe', FARBEN.auflage], ['Aufbau/Konus', FARBEN.aufbau],
  ['Unterteil', FARBEN.unterteil], ['Berme/Gerinne', FARBEN.berme], ['Steigeisen', FARBEN.steig],
  ['Auslauf', FARBEN.aus], ['Zulauf', FARBEN.zu],
];

/**
 * @param {HTMLElement} main
 * @param {{insp:object, manhole:object, changed:(rerender?:boolean)=>void}} ctx
 * @returns {() => void} Aufräumen (3D-Ansicht freigeben)
 */
export function renderAufbau(main, { insp, manhole, changed }) {
  insp.bauteile = normBauteile(insp.bauteile);
  const b = insp.bauteile;
  let view3d = null;
  let closed = false;
  const modelBox = h('div', { class: 'modell3d' }, h('div', { class: 'modell3d-hint muted small' }, '3D-Modell wird geladen …'));
  const schaetzEl = h('p', { class: 'muted small' });
  const bilanzEl = h('div', { class: 'stack-sm' });
  const formEl = h('div', { class: 'stack' });

  const daten = () => ({ bauteile: b, inspection: insp });
  const zeigeSchaetzung = (m) => {
    if (!m) return;
    const t = [m.geschaetzt?.length
      ? `Ergänzt mit üblichen Maßen (nicht erfasst): ${[...new Set(m.geschaetzt)].join(', ')}.`
      : 'Alle Maße aus der Erfassung.'];
    if (m.uebergangOffen) t.push('Oberer Abschluss (Konus oder Abdeckplatte) nicht erfasst – nur angedeutet.');
    if (m.abweichung != null && Math.abs(m.abweichung) > 0.03) {
      t.push(`Die Bauteile ergeben ${fmtNum(m.T)} m, die Schachttiefe ist ${fmtNum(m.Tsoll)} m (rote Linie) – bitte Höhen prüfen.`);
    }
    schaetzEl.textContent = t.join(' ');
    schaetzEl.classList.toggle('warn-text', m.abweichung != null && Math.abs(m.abweichung) > 0.03);
  };
  const upd = debounce(() => {
    if (view3d) zeigeSchaetzung(view3d.update(daten()));
    renderBilanz();
  }, 250);
  const geaendert = () => {
    if (b.quelle === 'stamm' || b.quelle === 'vorlage') b.quelle += '+erfasst';
    else if (!b.quelle) b.quelle = 'erfasst';
    changed(false);
    upd();
  };
  const set = (grp, k, { neu = false, conv = (v) => v } = {}) => (v) => {
    if (grp) b[grp][k] = conv(v); else b[k] = conv(v);
    geaendert();
    if (neu) renderForm();
  };
  const m = (grp, k, unit = 'm') => h('div', { class: 'input-unit' },
    numInput(b[grp][k], set(grp, k, { conv: zahl }), { unit, placeholder: unit === 'cm' ? '0' : '0,00' }), h('span', { class: 'unit' }, unit));
  const ja = (grp, k, label) => toggle(!!b[grp][k], set(grp, k), label);

  function renderBilanz() {
    const hb = hoehenbilanz(b, insp.tiefe);
    const T = insp.tiefe != null && insp.tiefe !== '' ? Number(insp.tiefe) : null;
    const status = T == null
      ? h('div', { class: 'issue warn' }, icon('info', 18), h('span', 'Schachttiefe fehlt (Reiter „Daten“).'))
      : !hb.vollstaendig
        ? h('p', { class: 'muted small' }, 'Noch nicht alle Bauteilhöhen erfasst.')
        : hb.ok
          ? h('div', { class: 'issue ok' }, icon('check', 18), h('span', `Passt: ${fmtNum(hb.rest)} m bleiben für Abdeckung und Rahmen.`))
          : h('div', { class: 'issue warn' }, icon('alert', 18), h('span', `Summe der Bauteile ${fmtNum(hb.summe)} m – Rest bis zur Schachttiefe ${fmtNum(hb.rest)} m. Bitte Höhen prüfen.`));
    clear(bilanzEl,
      h('dl', { class: 'kv' },
        ...hb.teile.flatMap(([n, v]) => (n === 'Untere Schachtzone' && !b.unten.aktiv ? [] : [h('dt', n), h('dd', v == null ? '–' : `${fmtNum(v)} m`)])),
        h('dt', 'Summe'), h('dd', `${fmtNum(hb.summe)} m`),
        h('dt', 'Schachttiefe'), h('dd', T == null ? '–' : `${fmtNum(T)} m`)),
      status);
  }

  async function vorlage() {
    if (hatBauteile(b) && !(await confirmDialog('Erfasste Bauteile durch die Vorlage „Regelschacht DN 1000“ ersetzen? Höhen werden geleert.', { ok: 'Ersetzen' }))) return;
    Object.assign(b, regelschacht());
    geaendert();
    renderForm();
    toast('Vorlage eingesetzt – bitte Höhen messen und Werte prüfen.', 'info', 4500);
  }
  async function ausStamm() {
    if (!(await confirmDialog('Bauteile aus den Stammdaten übernehmen? Erfasste Werte werden überschrieben.', { ok: 'Übernehmen' }))) return;
    Object.assign(b, normBauteile(manhole.bauteile));
    geaendert();
    renderForm();
  }

  function vollbild() {
    const box = h('div', { class: 'modell3d modell3d-gross' });
    let v = null;
    sheet({
      title: `3D-Modell Schacht ${manhole.name}`, wide: true,
      body: h('div', { class: 'stack-sm' }, box, h('p', { class: 'muted small' }, 'Drehen mit einem Finger, zoomen mit zwei Fingern bzw. Mausrad.')),
      onClose: () => v?.dispose(),
    });
    import('../components/modell3d.js').then((mod) => mod.schachtModell3d(box, daten())).then((x) => { v = x; }).catch(() => { box.textContent = '3D-Ansicht auf diesem Gerät nicht verfügbar.'; });
  }

  // „ja“ (Anzahl/Höhe > 0), „nein“ (ausdrücklich 0) oder '' (nicht erfasst)
  function auflageWert() {
    const { anzahl, hoehe } = b.auflage;
    if (anzahl > 0 || hoehe > 0) return 'ja';
    return anzahl === 0 || hoehe === 0 ? 'nein' : '';
  }
  function abschlussWert() {
    if (b.aufbau.abdeckplatte === true) return 'platte';
    if (b.aufbau.konus === true) return 'konus';
    return b.aufbau.konus === false && b.aufbau.abdeckplatte === false ? 'ohne' : '';
  }

  function karte(titel, ...inhalt) {
    return h('div', { class: 'card card-pad stack' }, h('h3', titel), ...inhalt);
  }

  function renderForm() {
    const eckig = (f) => f === 'E' || f === 'EV';
    const keineSteig = b.steig.vorhanden === false || b.steig.art === '5';
    clear(formEl,
      karte('Abdeckung',
        h('div', { class: 'grid2' },
          field('Form', select(b.deckel.form, opt(REF.G302), set('deckel', 'form', { neu: true }))),
          field('Klasse', select(b.deckel.klasse, opt(REF.G304), set('deckel', 'klasse')))),
        h('div', { class: 'grid2' },
          field(eckig(b.deckel.form) ? 'Länge' : 'Durchmesser (lichte Weite)', m('deckel', 'laenge')),
          eckig(b.deckel.form) ? field('Breite', m('deckel', 'breite')) : field('Material', select(b.deckel.material, opt(REF.G102), set('deckel', 'material')))),
        eckig(b.deckel.form) ? field('Material', select(b.deckel.material, opt(REF.G102), set('deckel', 'material'))) : null,
        field('Lüftung', select(b.deckel.typ, opt(REF.G303), set('deckel', 'typ'))),
        ja('deckel', 'schmutzfaenger', 'Schmutzfänger vorhanden')),
      karte('Auflageringe (Ausgleichsringe)',
        field('Vorhanden?', segmented(auflageWert(), [['ja', 'ja'], ['nein', 'keine']], (v) => {
          if (v === 'nein') b.auflage = { anzahl: 0, hoehe: 0 };
          else if (!(b.auflage.anzahl > 0) && !(b.auflage.hoehe > 0)) b.auflage = { anzahl: 1, hoehe: null };
          geaendert();
          renderForm();
        }, { small: true })),
        auflageWert() === 'ja' ? h('div', { class: 'grid2' },
          field('Anzahl', numInput(b.auflage.anzahl, set('auflage', 'anzahl', { conv: (v) => (v === '' ? null : Math.round(Number(v))) }), { placeholder: '0' })),
          field('Gesamthöhe', m('auflage', 'hoehe', 'cm'))) : null),
      karte('Schachtaufbau (Ringe, Konus)',
        field('Form', segmented(b.aufbau.form, FORM_KURZ, set('aufbau', 'form', { neu: true }), { small: true })),
        h('div', { class: 'grid2' },
          field(eckig(b.aufbau.form) ? 'Länge' : 'Nennweite (DN)', m('aufbau', 'laenge')),
          eckig(b.aufbau.form) ? field('Breite', m('aufbau', 'breite')) : field('Höhe inkl. Konus', m('aufbau', 'hoehe'))),
        eckig(b.aufbau.form) ? field('Höhe inkl. Konus', m('aufbau', 'hoehe')) : null,
        field('Material', select(b.aufbau.material, opt(REF.G102), set('aufbau', 'material'))),
        field('Oberer Abschluss', segmented(abschlussWert(), [['konus', 'Konus'], ['platte', 'Abdeckplatte'], ['ohne', 'ohne']], (v) => {
          b.aufbau.konus = v === 'konus';
          b.aufbau.abdeckplatte = v === 'platte';
          geaendert();
        }, { small: true }), 'Konus: verjüngt sich zur Abdeckung (Höhe im Modell 0,60 m). Abdeckplatte: flache Platte mit Öffnung.')),
      karte('Untere Schachtzone',
        toggle(!!b.unten.aktiv, (v) => {
          b.unten.aktiv = v;
          if (!v) Object.assign(b.unten, normBauteile(null).unten);
          geaendert();
          renderForm();
        }, 'Sonderschacht mit unterer Schachtzone'),
        b.unten.aktiv ? h('div', { class: 'stack' },
          field('Form', segmented(b.unten.form, FORM_KURZ, set('unten', 'form', { neu: true }), { small: true })),
          h('div', { class: 'grid2' },
            field(eckig(b.unten.form) ? 'Länge' : 'Nennweite (DN)', m('unten', 'laenge')),
            eckig(b.unten.form) ? field('Breite', m('unten', 'breite')) : field('Höhe', m('unten', 'hoehe'))),
          eckig(b.unten.form) ? field('Höhe', m('unten', 'hoehe')) : null,
          field('Material', select(b.unten.material, opt(REF.G102), set('unten', 'material'))),
          ja('unten', 'uebergangsplatte', 'Übergangsplatte'),
          ja('unten', 'konus', 'weiterer Konus'),
          ja('unten', 'podest', 'Podest')) : h('p', { class: 'muted small' }, 'Nur bei Sonderschächten nötig (z. B. größerer Durchmesser unten, Übergangsplatte, Podest).')),
      karte('Unterteil und Gerinne',
        field('Form', segmented(b.unterteil.form, UNTERTEIL_KURZ, set('unterteil', 'form', { neu: true }), { small: true }), b.unterteil.form === 'O' ? 'ohne Schachtunterteil' : null),
        b.unterteil.form !== 'O' ? h('div', { class: 'stack' },
          h('div', { class: 'grid2' },
            field(eckig(b.unterteil.form) ? 'Länge' : 'Nennweite (DN)', m('unterteil', 'laenge')),
            eckig(b.unterteil.form) ? field('Breite', m('unterteil', 'breite')) : field('Höhe', m('unterteil', 'hoehe'))),
          eckig(b.unterteil.form) ? field('Höhe', m('unterteil', 'hoehe')) : null,
          field('Material', select(b.unterteil.material, opt(REF.G102), set('unterteil', 'material')))) : null,
        h('div', { class: 'grid2' },
          field('Gerinneform', select(b.unterteil.gerinneform, opt(REF.G309), set('unterteil', 'gerinneform'))),
          field('Material Gerinne', select(b.unterteil.gerinneMaterial, opt(REF.G102), set('unterteil', 'gerinneMaterial'))))),
      karte('Steighilfen und Funktion',
        field('Steighilfen', select(keineSteig ? '5' : b.steig.art, opt(REF.G306), (v) => {
          b.steig.art = v;
          b.steig.vorhanden = v ? v !== '5' : null;
          if (v === '5') { b.steig.material = ''; b.steig.anzahl = null; }
          geaendert();
          renderForm();
        })),
        keineSteig ? null : h('div', { class: 'grid2' },
          field('Material', select(b.steig.material, opt(REF.G307), set('steig', 'material'))),
          field('Anzahl Steigeisen', numInput(b.steig.anzahl, set('steig', 'anzahl', { conv: (v) => (v === '' ? null : Math.round(Number(v))) }), { placeholder: '0' }))),
        field('Schachtfunktion', select(b.funktion, opt(REF.G301), set(null, 'funktion')), 'Werte ab „Drainageschacht“ gibt es erst in ISYBAU 2024; ältere Formate lassen sie weg.')),
    );
  }

  clear(main, h('div', { class: 'layout-2' },
    h('div', { class: 'stack' },
      h('div', { class: 'card card-pad stack-sm' },
        h('div', { class: 'row between' }, h('h3', '3D-Modell'), btn('Vollbild', { icon: 'move', variant: 'ghost', small: true, onClick: vollbild })),
        modelBox,
        h('div', { class: 'legend3d' }, LEGENDE.map(([t, c]) => h('span', { class: 'lg' }, h('i', { style: { background: c } }), t))),
        schaetzEl),
      h('div', { class: 'card card-pad stack-sm' },
        h('h3', 'Höhenbilanz'),
        bilanzEl),
      h('div', { class: 'card card-pad stack-sm' },
        h('h3', 'Schnell erfassen'),
        h('div', { class: 'row wrap' },
          btn('Vorlage Regelschacht DN 1000', { icon: 'manhole', variant: 'soft', onClick: vorlage }),
          manhole.bauteile ? btn('Aus Stammdaten', { icon: 'refresh', variant: 'ghost', onClick: ausStamm }) : null),
        h('p', { class: 'muted small' }, 'Die Bauteile gehen als ISYBAU-Stammdaten (Knoten/Schacht) bzw. DWA-M-150-Felder in den Export und ins Schachtprotokoll. Maße wie im Austauschformat in m, Auflageringe in cm – Laser-Eingabe funktioniert in jedem Maßfeld.'))),
    formEl));
  renderForm();
  renderBilanz();

  import('../components/modell3d.js')
    .then((mod) => (closed ? null : mod.schachtModell3d(modelBox, daten())))
    .then((v) => {
      if (!v) return;
      if (closed) { v.dispose(); return; }
      view3d = v;
      modelBox.querySelector('.modell3d-hint')?.remove();
      zeigeSchaetzung(v.masse);
    })
    .catch((e) => {
      console.warn(e);
      clear(modelBox, h('div', { class: 'modell3d-hint muted small' }, '3D-Ansicht auf diesem Gerät nicht verfügbar (WebGL).'));
    });

  return () => { closed = true; view3d?.dispose(); view3d = null; };
}
