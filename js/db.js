'use strict';
/* IndexedDB — 모든 데이터는 이 기기 안에만 저장됩니다 */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('metalcal', 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        d.createObjectStore('events', { keyPath: 'id' });
        d.createObjectStore('pomos', { keyPath: 'id' });
        d.createObjectStore('kv');
      };
      rq.onsuccess = () => { this.db = rq.result; res(); };
      rq.onerror = () => rej(rq.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), s = t.objectStore(store), r = fn(s);
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      t.onerror = () => rej(t.error);
    });
  },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  put(store, v) { return this.tx(store, 'readwrite', s => s.put(v)); },
  putMany(store, list) { return this.tx(store, 'readwrite', s => { list.forEach(v => s.put(v)); }); },
  del(store, id) { return this.tx(store, 'readwrite', s => s.delete(id)); },
  clear(store) { return this.tx(store, 'readwrite', s => s.clear()); },
  get(key) { return this.tx('kv', 'readonly', s => s.get(key)); },
  set(key, v) { return this.tx('kv', 'readwrite', s => s.put(v, key)); }
};
