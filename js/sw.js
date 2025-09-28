// js/sw.js
const CACHE_NAME = 'site-cache-v1';
const ASSETS = [
  '/css/music-overlay.css',
  '/js/music-overlay.js',
  '/assets/music.mp3',
  // add other critical assets you want cached
];

self.addEventListener('install', evt => {
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);

  // For known assets, serve cache first
  if (ASSETS.includes(url.pathname)) {
    evt.respondWith(
      caches.match(evt.request).then(resp => resp || fetch(evt.request))
    );
    return;
  }

  // Default: network-first then fallback to cache
  evt.respondWith(fetch(evt.request).catch(()=> caches.match(evt.request)));
});
