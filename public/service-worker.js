// Offline support: always try the network first (so updates show up right away),
// and fall back to the saved copy when there's no internet.
const CACHE = 'flower-playtime-v1';
const SHELL = [
  './', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/audio.js', 'js/gate.js', 'js/menu.js', 'js/nav.js', 'js/results.js', 'js/scores.js', 'js/ui.js',
  'js/games/keys.js', 'js/games/songs.js', 'js/games/spin.js', 'js/games/worm.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./'))));
});
