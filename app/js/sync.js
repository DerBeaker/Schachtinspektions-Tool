// Synchronisation mit dem (optionalen) Server auf dem eigenen Webspace.
// Prinzip: offline-first. Lokale Änderungen werden als "dirty" markiert und
// beim nächsten Sync hochgeladen; der Server vergibt fortlaufende Revisionen.
// Konflikte: der zuletzt geänderte Datensatz gewinnt (pro Inspektion/Schacht).

import { db } from './core/db.js';
import { onChange, getSettings, saveSettings } from './core/store.js';
import { debounce } from './core/util.js';
import { PLATTFORM_STANDARD } from './brand.js';

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
      throw Object.assign(new Error(msg || `Serverfehler ${res.status}`), { status: res.status });
    }
    return ct.includes('json') ? res.json() : res.blob();
  },

  async ping(serverUrl) {
    const url = new URL(this.apiBase(serverUrl));
    url.searchParams.set('r', 'ping');
    let res;
    try { res = await fetch(url); } catch { throw new Error(`Keine Verbindung zu ${url.origin}${url.pathname}`); }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Server nicht erreichbar (${res.status})`);
    if (!data) throw new Error('Die Antwort ist kein JSON – läuft PHP auf dem Webspace?');
    return data;
  },

  async login(serverUrl, username, password) {
    const res = await this.request('login', { method: 'POST', body: { username, password }, auth: { serverUrl } });
    return this.loginWith(serverUrl, res);
  },

  /** Anmeldeantwort übernehmen (Login, angenommene Einladung). */
  async loginWith(serverUrl, res) {
    this.auth = { serverUrl, token: res.token, user: res.user, features: res.features || {}, lizenz: res.lizenz || null };
    await db.setMeta('auth', this.auth);
    if (res.firma) await this.applyFirma(res.firma).catch(() => {});
    this.set({ enabled: true, state: 'idle', message: `Angemeldet als ${res.user.name || res.user.username}` });
    this.run();
    return res.user;
  },

  /** Öffentliche Aufrufe ohne Anmeldung (Einladung, Passwort vergessen). */
  open(route, body, serverUrl = '') {
    return this.request(route, { method: 'POST', body, auth: { serverUrl } });
  },

  async logout() {
    try { await this.request('logout', { method: 'POST' }); } catch { /* egal */ }
    await this.logoutLocal();
  },

  async logoutLocal() {
    this.auth = null;
    await db.setMeta('auth', null);
    const s = await getSettings();
    if (s.firmaZentral) { s.firmaZentral = false; await saveSettings(s); }
    this.set({ enabled: false, state: 'idle', message: 'Nicht angemeldet' });
  },

  isAdmin() { return this.auth?.user?.role === 'admin'; },
  isOperator() { return !!this.auth?.user?.operator; },

  /** Lizenz abgelaufen (Test oder Abo beendet): Daten nur noch lesen. */
  abgelaufen() {
    const l = this.auth?.lizenz;
    if (!l || l.plan === 'betreiber') return false;
    return !!l.expired || (!!l.validUntil && l.validUntil < new Date().toISOString().slice(0, 10));
  },

  /** XML-Export (ISYBAU, DWA-M 150) gehört zu Schachtblick Pro – auch offline anhand der gespeicherten Lizenz. */
  xmlErlaubt() {
    if (window.SB_DEMO) return true;
    return !!this.auth?.lizenz?.xml && !this.abgelaufen();
  },

  /** Plattform-Angaben des Servers (Freigabe, Preise, Testzeitraum); ohne Server die Standardwerte. */
  async plattform() {
    if (this._plattform) return this._plattform;
    try {
      const s = await getSettings();
      const r = await this.ping(this.auth?.serverUrl ?? s.serverUrl);
      if (r.plattform) this._plattform = { ...PLATTFORM_STANDARD, ...r.plattform, server: true };
    } catch { /* kein Server */ }
    return this._plattform || { ...PLATTFORM_STANDARD, server: false };
  },

  async setLizenz(l) {
    if (!this.auth || !l || JSON.stringify(l) === JSON.stringify(this.auth.lizenz)) return;
    this.auth.lizenz = l;
    await db.setMeta('auth', this.auth);
    window.dispatchEvent(new CustomEvent('app:lizenz'));
  },

  /**
   * Firmendaten vom Server (Name, Anschrift, Kontakt, Logo) in die Einstellungen übernehmen.
   * Hat der Server noch keine, übernimmt ein Administrator die bisher lokal gepflegten.
   */
  async applyFirma(f) {
    const s = await getSettings();
    if (!f.updated) {
      if (this.isAdmin() && (s.companyAddress || s.companyContact || s.logo)) {
        const r = await this.saveFirma({ name: f.name, anschrift: s.companyAddress, kontakt: s.companyContact, logo: s.logo });
        f = r.firma;
      } else {
        if (!s.company) s.company = f.name;
        Object.assign(s, { firmaZentral: true, firmaStand: (s.firmaStand || 0) + 1 });
        await saveSettings(s);
        window.dispatchEvent(new CustomEvent('app:firma'));
        return;
      }
    }
    // firmaStand: ältere Kopien der Einstellungen überschreiben diese Daten nicht mehr (store.saveSettings)
    Object.assign(s, { company: f.name, companyAddress: f.anschrift || '', companyContact: f.kontakt || '', logo: f.logo || '', firmaZentral: true, firmaStand: (s.firmaStand || 0) + 1 });
    await saveSettings(s);
    await db.setMeta('firmaUpdated', f.updated || 0);
    window.dispatchEvent(new CustomEvent('app:firma'));
  },

  async saveFirma(f) {
    const r = await this.request('firma', { method: 'POST', body: f });
    await db.setMeta('firmaUpdated', r.firma?.updated || 0);
    return r;
  },

  /** Gespeicherte Anmeldung lesen – vor dem ersten Bildschirm, damit er gleich angemeldet erscheint. */
  async load() {
    this.auth = await db.getMeta('auth', null);
    const lastSync = await db.getMeta('lastSync', null);
    this.set({ enabled: !!this.auth, lastSync });
    this._geladen = true;
  },

  async init() {
    if (!this._geladen) await this.load();
    // Listener immer registrieren – run() tut ohne Anmeldung nichts
    const later = debounce(() => this.run(), 4000);
    onChange(() => later());
    window.addEventListener('online', () => this.run());
    setInterval(() => { if (navigator.onLine) this.run(); }, 120000);
    if (this.auth) {
      this.run();
      this.request('me').then(async (r) => {
        Object.assign(this.auth, { features: r.features || {}, user: r.user });
        await db.setMeta('auth', this.auth);
        await this.setLizenz(r.lizenz || null);
        if (r.firma && r.firma.updated !== (await db.getMeta('firmaUpdated', 0))) await this.applyFirma(r.firma);
      }).catch(() => {});
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
    // Lizenz abgelaufen: nur abrufen, lokale Änderungen bleiben markiert, bis wieder gebucht ist
    const nurLesen = this.abgelaufen();
    try {
      // 1. Fotos hochladen (Binärdaten zuerst, damit Referenzen gültig sind)
      const photos = nurLesen ? [] : (await db.all('photos')).filter((p) => !p.uploaded && p.blob && !p.uploadFehler);
      let nr = 0;
      for (const p of photos) {
        if (photos.length > 1) this.set({ message: `Lade Fotos hoch (${++nr} von ${photos.length}) …` });
        try {
          await this.request('photo', { method: 'PUT', query: { id: p.id, inspection: p.inspectionId, project: p.projectId, w: p.width || 0, h: p.height || 0 }, body: p.blob, raw: true });
          p.uploaded = true;
        } catch (e) {
          // vom Server abgelehnt (zu groß, kein JPEG …): merken und weitermachen, statt den Abgleich zu blockieren
          if (!e.status || e.status < 400 || e.status >= 500 || e.status === 401 || e.status === 403) throw e;
          p.uploadFehler = e.message;
        }
        await db.put('photos', p);
      }
      if (photos.length) this.set({ message: 'Gleiche Daten ab …' });
      // 2. Datensätze austauschen
      const changes = [];
      const pushed = [];
      for (const t of nurLesen ? [] : TYPES) {
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
      if (res.lizenz) await this.setLizenz(res.lizenz);
      for (const [t, id, ts] of res.nurLesen ? [] : pushed) {
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
      // Firmendaten (Logo, Anschrift) geändert? Dann für Berichte übernehmen
      if (res.firmaUpdated && res.firmaUpdated !== (await db.getMeta('firmaUpdated', 0))) {
        const f = await this.request('firma');
        if (f.firma) await this.applyFirma(f.firma);
      }
      const now = Date.now();
      await db.setMeta('lastSync', now);
      const uhr = new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      this.set({ state: 'ok', lastSync: now, message: this.abgelaufen() ? `Nur lesen (Lizenz abgelaufen) · abgerufen ${uhr}` : `Synchronisiert ${uhr}` });
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
  deleteUser(id) { return this.request('user-delete', { method: 'POST', body: { id } }); },
  invite(d) { return this.request('invite', { method: 'POST', body: d }); },
  invites() { return this.request('invites'); },
  revokeInvite(id) { return this.request('invite-revoke', { method: 'POST', body: { id } }); },
  // Betreiber-Bereich
  opTenants() { return this.request('op-tenants'); },
  opSaveTenant(t) { return this.request('op-tenant', { method: 'POST', body: t }); },
  opInvite(d) { return this.request('op-invite', { method: 'POST', body: d }); },
  opDeleteTenant(id, confirm) { return this.request('op-tenant-delete', { method: 'POST', body: { id, confirm } }); },
  opExport(tenant) { return this.request('op-export', { query: { tenant } }); },
  opMailtest(email) { return this.request('op-mailtest', { method: 'POST', body: { email } }); },
  opPlattform(p) { return this.request('op-plattform', { method: 'POST', body: p }).then((r) => { this._plattform = null; return r; }); },
  opAuftraege() { return this.request('op-auftraege'); },
  opAuftragErledigt(id, erledigt) { return this.request('op-auftrag', { method: 'POST', body: { id, erledigt } }); },
  // Abo & Verträge (Firmen-Administrator)
  async konto() { const r = await this.request('konto'); await this.setLizenz(r.lizenz); return r; },
  async vertragAnnehmen(d) { const r = await this.request('vertrag', { method: 'POST', body: d }); await this.setLizenz(r.lizenz); return r; },
  async buchen(d) { const r = await this.request('konto-buchen', { method: 'POST', body: d }); await this.setLizenz(r.lizenz); return r; },
  async kuendigen() { const r = await this.request('konto-kuendigen', { method: 'POST', body: {} }); await this.setLizenz(r.lizenz); return r; },
  changePassword(oldPw, newPw) { return this.request('password', { method: 'POST', body: { old: oldPw, new: newPw } }); },

  async ai(payload) {
    return this.request('ai', { method: 'POST', body: payload });
  },
};
