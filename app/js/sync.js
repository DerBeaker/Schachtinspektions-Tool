// Synchronisation mit dem (optionalen) Server auf dem eigenen Webspace.
// Prinzip: offline-first. Lokale Änderungen werden als "dirty" markiert und
// beim nächsten Sync hochgeladen; der Server vergibt fortlaufende Revisionen.
// Konflikte: der zuletzt geänderte Datensatz gewinnt (pro Inspektion/Schacht).

import { db } from './core/db.js';
import { onChange } from './core/store.js';
import { debounce } from './core/util.js';

const TYPES = ['projects', 'manholes', 'inspections'];
const subs = new Set();

export const sync = {
  status: { enabled: false, state: 'idle', message: '', lastSync: null },
  auth: null,
  running: null,

  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  set(patch) {
    Object.assign(this.status, patch);
    for (const fn of subs) fn(this.status);
  },

  apiBase(serverUrl) {
    const base = (serverUrl || '').trim() || new URL('./api/', location.href).href;
    return base.endsWith('/') ? base : base + '/';
  },

  async request(route, { method = 'GET', body, raw, auth = this.auth, query = {} } = {}) {
    if (!auth) throw new Error('Nicht angemeldet.');
    const url = new URL(this.apiBase(auth.serverUrl));
    url.searchParams.set('r', route);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const headers = {};
    if (auth.token) headers['X-Auth-Token'] = auth.token;
    let payload = body;
    if (body && !raw) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(url, { method, headers, body: payload });
    if (res.status === 401) { this.logoutLocal(); throw new Error('Sitzung abgelaufen – bitte neu anmelden.'); }
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      const msg = ct.includes('json') ? (await res.json()).error : await res.text();
      throw new Error(msg || `Serverfehler ${res.status}`);
    }
    return ct.includes('json') ? res.json() : res.blob();
  },

  async ping(serverUrl) {
    const url = new URL(this.apiBase(serverUrl));
    url.searchParams.set('r', 'ping');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Server nicht erreichbar (${res.status}).`);
    return res.json();
  },

  async login(serverUrl, username, password) {
    const res = await this.request('login', { method: 'POST', body: { username, password }, auth: { serverUrl } });
    this.auth = { serverUrl, token: res.token, user: res.user, features: res.features || {} };
    await db.setMeta('auth', this.auth);
    this.set({ enabled: true, state: 'idle', message: `Angemeldet als ${res.user.name || res.user.username}` });
    this.run();
    return res.user;
  },

  async logout() {
    try { await this.request('logout', { method: 'POST' }); } catch { /* egal */ }
    await this.logoutLocal();
  },

  async logoutLocal() {
    this.auth = null;
    await db.setMeta('auth', null);
    this.set({ enabled: false, state: 'idle', message: 'Nicht angemeldet' });
  },

  async init() {
    this.auth = await db.getMeta('auth', null);
    const lastSync = await db.getMeta('lastSync', null);
    this.set({ enabled: !!this.auth, lastSync });
    // Listener immer registrieren – run() tut ohne Anmeldung nichts
    const later = debounce(() => this.run(), 4000);
    onChange(() => later());
    window.addEventListener('online', () => this.run());
    setInterval(() => { if (navigator.onLine) this.run(); }, 120000);
    if (this.auth) {
      this.run();
      this.request('me').then((r) => { this.auth.features = r.features || {}; this.auth.user = r.user; db.setMeta('auth', this.auth); }).catch(() => {});
    }
  },

  run({ manual = false } = {}) {
    if (!this.auth) return Promise.resolve();
    if (this.running) return this.running;
    if (!navigator.onLine) { this.set({ state: 'error', message: 'Offline – Sync folgt automatisch' }); return Promise.resolve(); }
    this.running = this._run(manual).finally(() => { this.running = null; });
    return this.running;
  },

  async _run(manual) {
    this.set({ state: 'busy', message: 'Synchronisiere …' });
    try {
      // 1. Fotos hochladen (Binärdaten zuerst, damit Referenzen gültig sind)
      const photos = (await db.all('photos')).filter((p) => !p.uploaded && p.blob);
      for (const p of photos) {
        await this.request('photo', { method: 'PUT', query: { id: p.id, inspection: p.inspectionId, project: p.projectId, w: p.width || 0, h: p.height || 0 }, body: p.blob, raw: true });
        p.uploaded = true;
        await db.put('photos', p);
      }
      // 2. Datensätze austauschen
      const changes = [];
      const pushed = [];
      for (const t of TYPES) {
        for (const r of await db.all(t)) {
          if (!r.dirty) continue;
          const { dirty, ...data } = r;
          changes.push({ type: t, id: r.id, projectId: t === 'projects' ? r.id : r.projectId, updatedAt: r.updatedAt, deleted: !!r.deleted, data });
          pushed.push([t, r.id, r.updatedAt]);
        }
      }
      // kleine Überlappung, damit parallel vergebene Revisionen nicht verloren gehen (Anwenden ist idempotent)
      let since = Math.max(0, ((await db.getMeta('syncRev', 0)) || 0) - 20);
      let res = await this.request('sync', { method: 'POST', body: { since, changes } });
      for (const [t, id, ts] of pushed) {
        const cur = await db.get(t, id);
        if (cur && cur.updatedAt === ts) { cur.dirty = false; await db.put(t, cur); }
      }
      let applied = 0;
      for (let page = 0; page < 200; page++) {
        for (const c of res.changes || []) {
          if (!TYPES.includes(c.type)) continue;
          const local = await db.get(c.type, c.id);
          if (local && local.dirty && local.updatedAt > c.updatedAt) continue; // lokal neuer
          if (local && !local.dirty && local.updatedAt === c.updatedAt) continue;
          await db.put(c.type, { ...c.data, id: c.id, updatedAt: c.updatedAt, deleted: !!c.deleted, dirty: false });
          applied++;
        }
        // Fotos anderer Geräte als Platzhalter anlegen (Download bei Bedarf)
        for (const p of res.photos || []) {
          if (!(await db.get('photos', p.id))) await db.put('photos', { ...p, blob: null, uploaded: true, remote: true });
        }
        await db.setMeta('syncRev', res.rev);
        if (!res.more) break;
        since = res.rev;
        res = await this.request('sync', { method: 'POST', body: { since, changes: [] } });
      }
      const now = Date.now();
      await db.setMeta('lastSync', now);
      this.set({ state: 'ok', lastSync: now, message: `Synchronisiert ${new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` });
      if (applied) window.dispatchEvent(new CustomEvent('app:synced', { detail: { applied } }));
    } catch (e) {
      this.set({ state: 'error', message: e.message });
      if (manual) throw e;
    }
  },

  /** Lädt ein Foto vom Server nach (wenn es auf einem anderen Gerät aufgenommen wurde). */
  async fetchPhoto(rec) {
    if (!this.auth) return null;
    const blob = await this.request('photo', { query: { id: rec.id } });
    rec.blob = blob;
    if (!rec.width || !rec.height) {
      try { const bmp = await createImageBitmap(blob); rec.width = bmp.width; rec.height = bmp.height; bmp.close?.(); } catch { /* egal */ }
    }
    rec.remote = false;
    await db.put('photos', rec);
    return blob;
  },

  users() { return this.request('users'); },
  saveUser(u) { return this.request('users', { method: 'POST', body: u }); },
  changePassword(oldPw, newPw) { return this.request('password', { method: 'POST', body: { old: oldPw, new: newPw } }); },

  async ai(payload) {
    return this.request('ai', { method: 'POST', body: payload });
  },
};
