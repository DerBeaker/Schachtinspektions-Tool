// Upload-Paket für den Webspace (z. B. IONOS): dist/schachtblick-<version>.zip
// Inhalt: Ordner „schachtblick/“ (= Inhalt von app/, ohne config.php, Fotos, vendor/)
// und die Installationsanleitung. Ohne Abhängigkeiten (eigener ZIP-Writer).
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipParts, concat } from '../app/js/lib/zip.js';
import { APP_VERSION } from '../app/js/brand.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const AUSLASSEN = [/^api\/config\.php$/, /^api\/vendor\//, /^api\/data\/(?!\.htaccess$)/, /(^|\/)\.DS_Store$/, /\.log$/];

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const top = `schachtblick-${APP_VERSION}`;
const files = [];
for (const p of walk(app)) {
  const rel = relative(app, p).split(sep).join('/');
  if (AUSLASSEN.some((re) => re.test(rel))) continue;
  files.push({ name: `${top}/schachtblick/${rel}`, data: new Uint8Array(readFileSync(p)) });
}
files.push({ name: `${top}/INSTALLATION.md`, data: new Uint8Array(readFileSync(join(root, 'docs/INSTALLATION-IONOS.md'))) });
mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `${top}.zip`);
writeFileSync(out, concat(zipParts(files)));
const mb = (statSync(out).size / 1048576).toFixed(1);
console.log(`${out} (${files.length} Dateien, ${mb} MB)`);
