# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Schachtblick": a mobile-first web app (PWA, no install) for inspecting sewer manholes according to ISYBAU (BFR Abwasser) / DWA-M 149-2 (DIN EN 13508-2). Inspectors import ISYBAU master data (XML), take a top-down photo, code connections and defects, and export ISYBAU condition data (XML + photos as ZIP). The target host is IONOS shared webspace (static files + PHP 8 + MySQL). UI text, docs and comments are in German.

## Commands

```bash
npm run xsd      # download official ISYBAU XSDs to .cache/isybau-xsd (XSD validation tests are skipped without them)
npm test         # node --test tests/*.test.mjs  (unit tests + PHP API tests)
node --test --test-name-pattern="Plausibilität" tests/isybau.test.mjs   # single test
npm run serve    # php -S 0.0.0.0:8080 -t app
npm run demo     # regenerate app/demo/demo-stammdaten.xml (fictional data) from tools/make-demo.mjs
```

- There is **no build step and no npm dependencies**: `app/` is served as-is (native ES modules) and is the deploy root.
- `tests/api.test.mjs` needs PHP with `pdo_sqlite`; it starts `php -S` with a temp SQLite config passed via the `SB_CONFIG` env var. The AI route test additionally needs `composer install` in `app/api/` (`vendor/` is gitignored) and runs against a local mock of the Claude API (`ai_base_url` config key).
- Browser E2E tests use a globally installed Playwright (resolved via `npm root -g`) and need the app running:
  `node tools/make-test-photo.mjs /tmp/s.jpg && node tools/e2e.mjs http://127.0.0.1:8080/ /tmp/s.jpg /tmp/e2e` (full mobile flow incl. export assertions) and `node tools/e2e-sync.mjs /tmp/s.jpg /tmp/e2e-sync` (starts its own PHP+SQLite server, checks phone → PC sync).
- Validate an export manually: `xmllint --noout --schema .cache/isybau-xsd/2017/1707-metadaten.xsd file.xml` (2024: `2024/2406-metadaten.xsd`).
- Official ISYBAU sample data/XSDs are downloaded, not committed.

## Architecture

### Domain pipeline (`app/js/isybau/`, `app/js/data/`)
- `xml.js`: tiny DOM-free XML parser/writer so import/export run in both browser and Node tests. ISYBAU files are ISO-8859-1; `decodeXmlBytes` honours the declaration, `encodeLatin1` writes Latin-1 with `&#x…;` for other chars. `XmlWriter` silently drops empty/null elements.
- `import.js`: parses Stammdaten into manholes with their connected pipes. For each pipe it derives the clock position from line geometry (bearing relative to the lowest outflow = 12 o'clock, top view, clockwise) and heights from invert levels.
- `model.js`: the inspection data model. **`buildRecords()` is the single place that turns an inspection into ordered ISYBAU `KZustand` records** (used by both `export.js` and the printable report). It auto-adds DDB A/B (start/end), the overview photo as DDA, expands each connection into a DCA+DCG pair (DCG must directly follow DCA), splits range findings into Streckenschaden A/B with a running number, and sorts by `VertikaleLage`. Element order must match the XSD sequence (`KZUSTAND_ORDER`).
- Vertical positions are stored as entered (`lageMode: 'oben'|'unten'`, `lageValue`) and only converted to the chosen reference (`bezugVertikal`, default 1 = invert of lowest outflow = 0.00 m) via `verticalPosition()` using the inspection's `tiefe`. Don't store converted values.
- `data/codes.js`: the manhole code catalog (BFR Abwasser A-2.3.8, 01/2025). Characterization 2 lists and quantifications can be overridden per C1 entry; always read them through `c1Options/c2Options/quantDef`. `validate.js` (rules from the coding manual) and the editors are driven entirely by this catalog, so adding/changing a code is a catalog edit.
- `export.js` targets ISYBAU XML-2017 (`2017-07`) and XML-2024 (`2024-06`, adds `Erfassungsart`; AI-sourced findings → 3 "Assistenzsystem"). Photo names follow the BFR convention `<Objekt>-001.jpg`.

### Frontend (`app/js/`)
- No framework: `core/ui.js` provides `h()` (DOM builder), sheets/dialogs, toasts and form controls. `field()` wraps only plain inputs in `<label>`; wrapping button groups in a label makes the browser forward clicks to the first button.
- Hash routing in `main.js`; views `render*(viewEl, …)` may return a cleanup function. Views navigate via `navigate()` from `core/shell.js`, which dispatches an `app:route` event (avoids a circular import with `main.js`).
- `core/store.js` is the only write path to IndexedDB (`core/db.js`). Every save goes through `touch()` (sets `updatedAt`, `dirty: true`); deletions are soft (`deleted: true`) so they can sync. Photos are Blobs in IndexedDB; photos from other devices are placeholders (`blob: null, remote: true`) fetched lazily by `photoUrl()`, so call `photoUrl()` before relying on a photo's `width/height`.
- `sync.js` (optional server): pushes dirty records and pulls changes with `POST ?r=sync {since, changes}`; last-writer-wins by `updatedAt`, server revisions, paged with `more`, small rev overlap on the client. Auth token is sent as `X-Auth-Token` (IONOS/FastCGI may strip `Authorization`).
- `sw.js` caches an explicit `ASSETS` list: add new JS/CSS files there.
- `window.SB_DEMO` (set only by the published artifact preview page) switches export to "show XML" instead of download and hides print.

### Server (`app/api/`, PHP ≥ 8.1)
- `index.php` routes by `?r=<route>` (no mod_rewrite needed). `lib/bootstrap.php` has config/DB/auth helpers; config comes from `config.php` (copy of `config.sample.php`, gitignored) or `SB_CONFIG`.
- Works with MySQL/MariaDB and SQLite; `lib/schema.php` holds both schema variants, and revisions come from an autoincrement table (`sb_next_rev()`) to stay portable. Every query is scoped by `tenant_id` (multi-company).
- `setup.php` creates tables plus the first tenant/admin and then locks itself.
- `lib/ai.php` (optional, needs `anthropic_api_key` + `vendor/`): calls Claude through the official `anthropic-ai/sdk` (beta messages with `fallbacks: 'default'`, `outputConfig` JSON schema). Results are only suggestions; the client marks them `source: 'ai'`.
- `.htaccess` files deny access to `lib/`, `data/` (photo storage), `vendor/` and config files.
