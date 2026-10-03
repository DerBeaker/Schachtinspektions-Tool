// Info-Seite und Link-Vorschau: Open-Graph-Tags, strukturierte Daten, Sitemap und robots.txt
// passen zur öffentlichen Adresse (brand.js APP_URL) und zeigen auf vorhandene Dateien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { APP_URL } from '../app/js/brand.js';

const app = new URL('../app/', import.meta.url);
const lies = (p) => readFileSync(new URL(p, app), 'utf8');
const datei = (url) => new URL(url.slice(APP_URL.length) || 'index.html', app);
const meta = (html, prop) => (new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html) || [])[1];

for (const seite of ['index.html', 'schachtinspektion.html']) {
  test(`${seite}: Titel, Beschreibung, Vorschau und strukturierte Daten`, () => {
    const html = lies(seite);
    assert.match(html, /<html lang="de">/);
    assert.match(/<title>([^<]+)<\/title>/.exec(html)[1], /Schachtinspektion/);
    const beschreibung = meta(html, 'description');
    assert.ok(beschreibung.length >= 120 && beschreibung.length <= 300, `Beschreibung ${beschreibung.length} Zeichen`);
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image']) assert.ok(meta(html, p), p);
    const bild = meta(html, 'og:image');
    assert.ok(bild.startsWith(APP_URL), 'og:image absolut auf der App-Adresse');
    assert.ok(existsSync(datei(bild)), `${bild} fehlt`);
    assert.ok(meta(html, 'og:url').startsWith(APP_URL));
    assert.ok(/<link rel="canonical" href="([^"]+)"/.exec(html)[1].startsWith(APP_URL));
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    assert.equal(ld['@type'], 'SoftwareApplication');
    assert.equal(ld.offers[0].price, '0');
  });
}

test('Info-Seite: Bilder vorhanden, Links zur App', () => {
  const html = lies('schachtinspektion.html');
  for (const [, src] of html.matchAll(/<img src="([^"]+)"/g)) assert.ok(existsSync(new URL(src, app)), src);
  assert.match(html, /<h1>[^<]*Schachtinspektion[^<]*kostenlos/);
  assert.match(html, /href="\.\/"/);
});

test('Sitemap und robots.txt', () => {
  const sitemap = lies('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length >= 2);
  for (const u of urls) {
    assert.ok(u.startsWith(APP_URL), u);
    assert.ok(existsSync(datei(u)), `${u} ohne Datei`);
  }
  const robots = lies('robots.txt');
  assert.match(robots, new RegExp(`Sitemap: ${APP_URL}sitemap\\.xml`));
  assert.match(robots, /Disallow: \/api\//);
});
