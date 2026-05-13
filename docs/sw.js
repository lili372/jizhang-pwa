/* Service Worker - 离线缓存
 * 改动静态文件后升级 CACHE 版本号即可强制更新
 */
const CACHE = 'jizhang-v15';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request;
  const isNavigate = req.mode === 'navigate' || req.destination === 'document';

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // 仅缓存同源成功响应
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        // 导航请求兜底:返回缓存的 index.html,避免白屏
        if (isNavigate) return caches.match('./index.html');
        // 非导航请求:返回 503 而不是 undefined,防止 respondWith 收到空值
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
