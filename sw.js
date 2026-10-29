/* 오프라인 캐시 — 앱 파일만 캐시하며 일정 데이터는 다루지 않습니다.
   앱을 수정했다면 VERSION 을 올려 주세요. */
const VERSION = 'metalcal-v1.4.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/util.js', './js/db.js', './js/nlp.js', './js/views.js', './js/drag.js', './js/editor.js', './js/panels.js', './js/pomodoro.js', './js/goals.js', './js/ledger.js', './js/notes.js', './js/sync.js', './js/portable.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크 우선(최신 버전 반영), 오프라인이면 캐시
self.addEventListener('fetch', e => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/__portable')) return;
  e.respondWith(
    fetch(r.mode === 'navigate' ? r.url : r, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); }
      return res;
    }).catch(async () => (await caches.match(r, { ignoreSearch: true })) || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
