// sw.js — 工作台 PWA 离线缓存（单页应用外壳）
const CACHE = 'wb-app-v16';

// 预缓存核心外壳，保证首次安装后即可离线
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/registry.js',
  './js/storage.js',
  './js/ui.js',
  './js/cloud-sync.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // 接管后让所有已打开的窗口重新加载，立即应用新版本（无需手动刷新）
        return self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((cls) =>
          cls.forEach((client) => {
            if (client.url && client.url.indexOf('sw.js') === -1) client.navigate(client.url).catch(() => {});
          })
        );
      })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // 不拦截 POST（云同步写入）
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // 不缓存跨域（API）

  // 导航请求：network-first，保证每次都拿到最新外壳；离线再回退缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 其他同源静态资源：stale-while-revalidate（先返回缓存，后台更新，下次即新）
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
