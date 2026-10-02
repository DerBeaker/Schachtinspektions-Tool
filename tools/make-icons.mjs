// Rendert die PNG-App-Icons aus app/icons/icon.svg (benötigt Playwright).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] }));
const svg = readFileSync(new URL('../app/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, file, pad] of [[192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [180, 'icon-180.png', 0], [512, 'icon-maskable-512.png', 0.1]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - 2 * pad));
  const bg = pad ? '#0a5bd3' : 'transparent';
  await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../app/icons/${file}`, import.meta.url).pathname, omitBackground: !pad });
}
await browser.close();
console.log('Icons erstellt.');
