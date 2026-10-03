// Service Worker: macht die App offline-fähig (App-Dateien im Cache, API nie cachen).
const VERSION = 'schachtblick-v7';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/mmse-logo.png',
  './demo/demo-stammdaten.xml',
  './js/main.js', './js/sync.js', './js/brand.js',
  './js/core/db.js', './js/core/shell.js', './js/core/store.js', './js/core/ui.js', './js/core/util.js',
  './js/data/codes.js', './js/data/reflists.js',
  './js/isybau/xml.js', './js/isybau/import.js', './js/isybau/export.js', './js/isybau/model.js', './js/isybau/validate.js', './js/isybau/m150.js', './js/isybau/bewertung.js', './js/isybau/vorinspektion.js', './js/isybau/bauteile.js', './js/data/bfr-klassen.js', './js/components/klasse.js', './js/components/modell3d.js', './js/views/karte.js', './js/views/aufbau.js', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css', './vendor/leaflet/images/layers.png', './vendor/leaflet/images/layers-2x.png',
  './vendor/three/three.module.min.js', './vendor/three/OrbitControls.js',
  './js/lib/geo.js', './js/lib/zip.js', './js/lib/image.js', './js/lib/depth.js', './js/lib/pdf.js', './js/lib/pdf-fonts.js', './js/lib/xlsx.js',
  './js/report/protokoll.js', './js/report/aufmass.js',
  './js/components/clockpicker.js', './js/components/photoview.js', './js/components/shaft.js',
  './js/views/projects.js', './js/views/project.js', './js/views/inspection.js', './js/views/editors.js',
  './js/views/export.js', './js/views/settings.js', './js/views/report.js', './js/views/ai.js', './js/views/berichte.js', './js/views/betrieb.js', './js/views/zugang.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // Netzwerk zuerst (immer aktuelle Version), bei Offline aus dem Cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
