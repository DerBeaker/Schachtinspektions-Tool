// KI-Assistent (optional): Das Übersichtsfoto wird über den eigenen Server an ein
// Bildanalyse-Modell geschickt. Ergebnis sind VORSCHLÄGE, die der Inspekteur prüft.

import { h, clear, btn, icon, sheet, toast, badge } from '../core/ui.js';
import { sync } from '../sync.js';
import { CODES, codeLabel, fullCode } from '../data/codes.js';
import { downscale, blobToBase64 } from '../lib/image.js';
import { uid } from '../core/util.js';

export function aiAvailable() {
  return !!(sync.auth && sync.auth.features && sync.auth.features.ai);
}

/** Kompakter Kodekatalog für den Prompt. */
export function catalogForPrompt() {
  return Object.entries(CODES).filter(([k]) => !['DCA', 'DCG', 'CED', 'DDB', 'DDA', 'DDC'].includes(k)).map(([k, d]) => ({
    code: k, name: d.name,
    c1: (d.c1 || []).map((c) => `${c.k}=${c.t}`),
    c2: [...new Set([...(d.c2 || []), ...(d.c1 || []).flatMap((c) => c.c2 || [])].map((c) => `${c.k}=${c.t}`))],
  }));
}

export async function runAiAnalysis({ insp, manhole, photo }) {
  if (!photo?.blob) { toast('Kein Foto vorhanden.', 'error'); return null; }
  return new Promise((resolve) => {
    let result = null;
    const s = sheet({
      title: 'KI-Analyse', wide: true,
      body: h('div', { class: 'stack', style: { alignItems: 'center', padding: '30px 0' } },
        h('div', { class: 'empty-icon' }, icon('sparkles', 40)),
        h('h3', 'Foto wird analysiert …'),
        h('p', { class: 'muted small', style: { textAlign: 'center', maxWidth: '420px' } }, 'Erkennung von Anschlüssen (Lage am Umfang) und sichtbaren Schäden. Das dauert meist 10–40 Sekunden.')),
      onClose: () => resolve(result),
    });
    (async () => {
      try {
        const small = await downscale(photo.blob, 1568);
        const res = await sync.ai({
          image: await blobToBase64(small),
          mediaType: 'image/jpeg',
          context: {
            schacht: manhole.name,
            tiefe: insp.tiefe,
            dn: manhole.schacht?.dn ? Math.round(manhole.schacht.dn * 1000) : null,
            material: manhole.schacht?.material || null,
            uhr: insp.overview.clock,
            anschluesse: insp.connections.map((c) => ({ richtung: c.dir, uhr: c.clock, dn: c.dn })),
          },
          catalog: catalogForPrompt(),
        });
        review(res);
      } catch (e) {
        s.setBody(h('div', { class: 'stack' }, h('div', { class: 'issue error' }, icon('alert', 18), h('span', 'KI-Analyse fehlgeschlagen: ' + e.message)),
          btn('Schließen', { onClick: () => s.close() })));
      }
    })();

    function review(res) {
      const findings = (res.findings || []).filter((f) => CODES[f.code]).map((f) => ({
        id: uid(), code: f.code, c1: f.c1 || '', c2: f.c2 || '', q1: f.q1 ?? '', q2: '',
        clockFrom: f.clockFrom || null, clockTo: f.clockTo || null, bereich: f.bereich || '',
        lageMode: 'oben', lageValue: f.depthFromTop ?? '', strecke: false, lageEndValue: '', verbindung: false,
        kommentar: f.comment || '', photoId: null, source: 'ai',
        aiConfidence: f.confidence, aiReason: f.reason, _accept: (f.confidence ?? 0) >= 0.5,
      }));
      const connections = (res.connections || []).filter((c) => c.clock >= 1 && c.clock <= 12).map((c) => ({
        id: uid(), dir: c.direction === 'out' ? 'out' : 'in', clock: c.clock, clockSet: false, aiClock: true, dn: c.dnEstimate || '', dnB: '',
        form: 'A', dca: 'B', dcaC2: '', bereich: 'J', lageMode: 'oben', lageValue: '', kommentar: 'Vorschlag KI-Assistent', _accept: false,
      }));
      const row = (item, label, sub) => {
        const cb = h('input', { type: 'checkbox', checked: item._accept, onchange: (e) => { item._accept = e.target.checked; } });
        return h('label', { class: 'item', style: { cursor: 'pointer' } }, cb, h('div', { class: 'grow' }, label, sub));
      };
      s.setBody(h('div', { class: 'stack' },
        res.summary ? h('div', { class: 'card card-pad' }, h('b', 'Einschätzung: '), res.summary) : null,
        res.quality ? h('div', { class: 'muted small' }, 'Bildqualität: ', res.quality) : null,
        h('div', { class: 'section-title' }, `Befund-Vorschläge (${findings.length})`),
        findings.length ? h('div', { class: 'list' }, findings.map((f) => row(f,
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, h('span', { class: 'code-chip' }, fullCode(f)), badge(`${Math.round((f.aiConfidence || 0) * 100)} %`, 'ai'), h('b', codeLabel(f))),
          h('div', { class: 'muted small' }, [f.clockFrom ? `${f.clockFrom} Uhr` : null, f.bereich ? `Bereich ${f.bereich}` : null, f.aiReason].filter(Boolean).join(' · '))))) : h('p', { class: 'muted' }, 'Keine Schäden erkannt.'),
        connections.length ? h('div', { class: 'section-title' }, `Erkannte Anschlüsse (${connections.length})`) : null,
        connections.map((c) => row(c, h('b', `${c.dir === 'out' ? 'Ablauf' : 'Zulauf'} bei ${c.clock} Uhr${c.dn ? ` · ca. DN ${c.dn}` : ''}`),
          h('div', { class: 'muted small' }, 'Nur übernehmen, wenn noch nicht erfasst. Ersetzt die Lage eines noch unbestätigten Stammdaten-Anschlusses gleicher Richtung.'))),
        h('div', { class: 'issue warn' }, icon('info', 18), h('span', 'Vorschläge sind eine Hilfe, keine Prüfung. Höhenlage und Quantifizierung bitte immer selbst ergänzen bzw. prüfen. Übernommene Befunde werden als „Assistenzsystem“ gekennzeichnet.'))));
      s.setActions([
        btn('Verwerfen', { variant: 'ghost', onClick: () => s.close() }),
        btn('Ausgewählte übernehmen', { variant: 'primary', icon: 'check', onClick: () => {
          result = {
            findings: findings.filter((f) => f._accept).map(({ _accept, ...f }) => f),
            connections: connections.filter((c) => c._accept).map(({ _accept, ...c }) => c),
          };
          s.close();
        } }),
      ]);
    }
  });
}
