/**
 * SmartReader · Service Worker
 * Cache-first para assets, network-first para PDF externo
 */

const CACHE = 'smartreader-v2';
const ASSETS = [
 './',
 './index.html',
 './style.css',
 './script.js',
 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
];

self.addEventListener('install', e => {
 e.waitUntil(
 caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
 );
});

self.addEventListener('activate', e => {
 e.waitUntil(
 caches.keys().then(keys =>
 Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
 ).then(() => self.clients.claim())
 );
});

self.addEventListener('fetch', e => {
 // Fontes do Google: network-first, fallback cache
 if (e.request.url.includes('fonts.googleapis') || e.request.url.includes('fonts.gstatic')) {
 e.respondWith(
 fetch(e.request).then(r => {
 const clone = r.clone();
 caches.open(CACHE).then(c => c.put(e.request, clone));
 return r;
 }).catch(() => caches.match(e.request))
 );
 return;
 }

 // Assets locais: cache-first
 e.respondWith(
 caches.match(e.request).then(cached => {
 if (cached) return cached;
 return fetch(e.request).then(r => {
 if (r.ok && e.request.method === 'GET') {
 const clone = r.clone();
 caches.open(CACHE).then(c => c.put(e.request, clone));
 }
 return r;
 });
 })
 );
});