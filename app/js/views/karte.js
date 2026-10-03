// Kartenansicht der Schächte eines Projekts: Status bzw. Zustandsklasse farbig, Leitungen,
// eigene Position, Sprung in die Inspektion und Navigation. Karte: Leaflet (lokal mitgeliefert),
// Hintergrund basemap.de (BKG, Datenlizenz Deutschland – Namensnennung 2.0) oder OpenStreetMap.

import { h, clear, btn, icon, toast, segmented, empty } from '../core/ui.js';
import { navigate, topbar } from '../core/shell.js';
import { getProject, listManholes, getSettings, saveSettings } from '../core/store.js';
import { navUrl } from '../lib/geo.js';
import { bewerteInspektion, OBJEKTKLASSEN } from '../isybau/bewertung.js';

let leafletPromise = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletPromise ||= new Promise((resolve, reject) => {
    const css = h('link', { rel: 'stylesheet', href: './vendor/leaflet/leaflet.css' });
    const js = h('script', { src: './vendor/leaflet/leaflet.js' });
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletPromise = null; reject(new Error('Kartenbibliothek konnte nicht geladen werden.')); };
    document.head.append(css, js);
  });
  return leafletPromise;
}

const STATUS_FARBE = { offen: '#8a94a6', inArbeit: '#f59f00', fertig: '#2b8a3e' };
const STATUS_TEXT = { offen: 'offen', inArbeit: 'in Arbeit', fertig: 'fertig' };
const KLASSE_FARBE = ['#2b8a3e', '#74b816', '#f2c200', '#f08c00', '#e03131', '#862e2e'];

const BKG = '© <a href="https://basemap.de" target="_blank" rel="noopener">basemap.de / BKG</a> (dl-de/by-2-0)';
const LAYERS = {
  farbe: ['https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png', BKG, 19],
  grau: ['https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_grau/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png', BKG, 19],
  osm: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende', 19],
};

export async function renderKarte(view, projectId) {
  const project = await getProject(projectId);
  if (!project) { navigate('#/', { replace: true }); return; }
  const manholes = await listManholes(projectId);
  const state = { farbe: 'status', layer: 'farbe', watch: null, me: null };
  const mapEl = h('div', { class: 'map-view' });
  const legend = h('div', { class: 'map-legend' });
  const tools = h('div', { class: 'map-tools' });

  clear(view, topbar({ back: `#/p/${projectId}`, title: 'Karte', sub: project.name }), h('main', { class: 'map-main' }, mapEl, tools, legend));

  const mitKoord = manholes.filter((m) => m.wgs);
  if (!mitKoord.length) {
    clear(mapEl, h('div', { class: 'card', style: { margin: '16px' } }, empty('pin', 'Keine Koordinaten', 'Die Schächte dieses Projekts haben keine Lagekoordinaten. Mit Stammdaten (ISYBAU/DWA-M 150) inklusive Geometrie erscheinen sie hier auf der Karte.')));
    return;
  }

  let L;
  try { L = await loadLeaflet(); } catch (e) { toast(e.message, 'error'); return; }
  const map = L.map(mapEl, { zoomControl: true, preferCanvas: true });
  let tiles = null;
  // Hinweis, wenn der Kartenhintergrund nicht geladen werden kann (offline, Firewall oder
  // eine Umgebung, die fremde Bilder sperrt – z. B. die Demo-Vorschau)
  const hint = h('div', { class: 'map-hint', hidden: true },
    icon('wifiOff', 18),
    h('span', 'Kartenhintergrund kann nicht geladen werden – keine Internetverbindung oder in dieser Umgebung gesperrt (z. B. Demo-Vorschau). Die Schächte werden trotzdem angezeigt.'));
  mapEl.parentElement.append(hint);
  // Kartenkacheln kommen von fremden Servern (BKG bzw. OpenStreetMap) – erst nach Zustimmung laden
  const settings = await getSettings();
  let freigabe = settings.kartenErlaubt === true;
  const zustimmung = h('div', { class: 'map-consent card card-pad stack-sm' },
    h('b', 'Kartenhintergrund laden?'),
    h('p', { class: 'small', style: { margin: 0 } }, 'Dafür werden Kartenkacheln von basemap.de (Bundesamt für Kartographie und Geodäsie) bzw. OpenStreetMap geladen. Dabei wird Ihre IP-Adresse an diesen Dienst übertragen. Die Schächte sehen Sie auch ohne Hintergrund.'),
    h('div', { class: 'row wrap' },
      btn('Einmal laden', { small: true, variant: 'soft', onClick: () => erlauben(false) }),
      btn('Immer laden', { small: true, variant: 'primary', onClick: () => erlauben(true) }),
      h('a', { class: 'small', href: '#/datenschutz' }, 'Datenschutz')));
  mapEl.parentElement.append(zustimmung);
  zustimmung.hidden = freigabe;
  async function erlauben(merken) {
    freigabe = true;
    zustimmung.hidden = true;
    if (merken) { const s = await getSettings(); s.kartenErlaubt = true; await saveSettings(s); }
    setLayer(state.layer);
  }
  const setLayer = (k) => {
    if (tiles) map.removeLayer(tiles);
    tiles = null;
    if (!freigabe) { zustimmung.hidden = false; return; }
    const [url, attribution, maxZoom] = LAYERS[k];
    const n = { ok: 0, err: 0 };
    hint.hidden = true;
    // OpenStreetMap verlangt einen Referer; die Seite selbst sendet wegen „same-origin“ sonst keinen
    tiles = L.tileLayer(url, { attribution, maxZoom, maxNativeZoom: 18, referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(map);
    tiles.on('tileload', () => { n.ok++; hint.hidden = true; });
    tiles.on('tileerror', () => { n.err++; if (!n.ok && n.err >= 3) hint.hidden = false; });
  };
  setLayer(state.layer);

  const byName = new Map(manholes.map((m) => [m.name, m]));
  const status = (m) => (m.inspection ? (m.inspection.status === 'fertig' ? 'fertig' : 'inArbeit') : 'offen');
  const klasse = (m) => (m.inspection ? bewerteInspektion(m.inspection, m, project).OK : null);

  // Leitungen (je Ablauf eine Linie zum Nachbarschacht)
  const lines = L.layerGroup().addTo(map);
  for (const m of mitKoord) {
    for (const p of m.pipes || []) {
      const n = p.dir === 'out' ? byName.get(p.nachbar) : null;
      if (n?.wgs) L.polyline([[m.wgs.lat, m.wgs.lon], [n.wgs.lat, n.wgs.lon]], { color: '#4c6ef5', weight: 2, opacity: 0.6, interactive: false }).addTo(lines);
    }
  }

  const markers = L.layerGroup().addTo(map);
  function drawMarkers() {
    markers.clearLayers();
    for (const m of mitKoord) {
      const st = status(m);
      const k = state.farbe === 'klasse' ? klasse(m) : null;
      const color = state.farbe === 'klasse' ? (k == null ? '#adb5bd' : KLASSE_FARBE[k]) : STATUS_FARBE[st];
      const mk = L.circleMarker([m.wgs.lat, m.wgs.lon], { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 });
      mk.bindTooltip(m.name, { permanent: true, direction: 'right', offset: [8, 0], className: 'mh-label' });
      const pop = h('div', { class: 'map-pop' },
        h('b', m.name),
        h('div', { class: 'muted small' }, [m.strasse, STATUS_TEXT[st], k != null ? `Objektklasse ${k}` : null].filter(Boolean).join(' · ')),
        k != null ? h('div', { class: 'small' }, OBJEKTKLASSEN[k]) : null,
        h('div', { class: 'row', style: { gap: '6px', marginTop: '8px' } },
          btn('Öffnen', { small: true, variant: 'primary', onClick: () => navigate(`#/s/${m.id}`) }),
          h('a', { class: 'btn btn-sm btn-soft', href: navUrl(m.wgs), target: '_blank', rel: 'noopener' }, icon('nav', 16), 'Navigation')));
      mk.bindPopup(pop);
      mk.addTo(markers);
    }
    clear(legend, state.farbe === 'klasse'
      ? [0, 1, 2, 3, 4, 5].map((k) => h('span', { class: 'lg' }, h('i', { style: { background: KLASSE_FARBE[k] } }), String(k)))
      : Object.entries(STATUS_FARBE).map(([k, c]) => h('span', { class: 'lg' }, h('i', { style: { background: c } }), STATUS_TEXT[k])));
  }
  drawMarkers();

  // Beschriftung erst ab Straßen-Zoom
  const labels = () => mapEl.classList.toggle('labels-on', map.getZoom() >= 17);
  map.on('zoomend', labels);
  map.fitBounds(L.latLngBounds(mitKoord.map((m) => [m.wgs.lat, m.wgs.lon])).pad(0.15), { maxZoom: 18 });
  labels();

  let meMarker = null;
  const locate = () => {
    if (!navigator.geolocation) return toast('Standort wird vom Gerät nicht unterstützt.', 'error');
    if (state.watch != null) { map.setView(state.me || map.getCenter(), Math.max(map.getZoom(), 17)); return; }
    state.watch = navigator.geolocation.watchPosition((p) => {
      const first = !state.me;
      state.me = [p.coords.latitude, p.coords.longitude];
      if (!meMarker) meMarker = L.circleMarker(state.me, { radius: 7, color: '#fff', weight: 3, fillColor: '#1c7ed6', fillOpacity: 1 }).addTo(map);
      else meMarker.setLatLng(state.me);
      if (first) map.setView(state.me, Math.max(map.getZoom(), 17));
    }, () => toast('Standort nicht verfügbar – GPS und Berechtigung prüfen.', 'error'), { enableHighAccuracy: true, maximumAge: 5000 });
  };

  clear(tools,
    segmented(state.farbe, [['status', 'Status'], ['klasse', 'Zustandsklasse']], (v) => { state.farbe = v; drawMarkers(); }, { small: true }),
    segmented(state.layer, [['farbe', 'Karte'], ['grau', 'grau'], ['osm', 'OSM']], (v) => { state.layer = v; setLayer(v); }, { small: true }),
    btn('', { icon: 'nav', aria: 'Mein Standort', onClick: locate }));

  setTimeout(() => map.invalidateSize(), 50);
  return () => {
    if (state.watch != null) navigator.geolocation.clearWatch(state.watch);
    map.remove();
  };
}
