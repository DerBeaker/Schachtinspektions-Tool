// IndexedDB-Speicher (offline-first). Alle Daten liegen zuerst lokal auf dem Gerät.

const DB_NAME = 'schachtblick';
const DB_VERSION = 1;
const STORES = {
  projects: { keyPath: 'id' },
  manholes: { keyPath: 'id', indexes: ['projectId'] },
  inspections: { keyPath: 'id', indexes: ['projectId', 'manholeId'] },
  photos: { keyPath: 'id', indexes: ['inspectionId', 'projectId'] },
  meta: { keyPath: 'key' },
};

let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const s = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const ix of def.indexes || []) s.createIndex(ix, ix);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const promisify = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    Promise.resolve(fn(t.objectStore(store))).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => promisify(s.get(key))),
  all: (store) => tx(store, 'readonly', (s) => promisify(s.getAll())),
  byIndex: (store, index, value) => tx(store, 'readonly', (s) => promisify(s.index(index).getAll(value))),
  put: (store, value) => tx(store, 'readwrite', (s) => promisify(s.put(value))),
  putMany: (store, values) => tx(store, 'readwrite', (s) => Promise.all(values.map((v) => promisify(s.put(v))))),
  del: (store, key) => tx(store, 'readwrite', (s) => promisify(s.delete(key))),
  delMany: (store, keys) => tx(store, 'readwrite', (s) => Promise.all(keys.map((k) => promisify(s.delete(k))))),
  clear: async () => { for (const s of Object.keys(STORES)) await tx(s, 'readwrite', (st) => promisify(st.clear())); },
  async getMeta(key, fallback = null) {
    const r = await db.get('meta', key);
    return r ? r.value : fallback;
  },
  setMeta: (key, value) => db.put('meta', { key, value }),
};
