const CACHE = 'ecocook-v2';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache d'abord (hors-ligne), mise à jour en arrière-plan
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});

// Alertes programmées (mêmes messages que l'application : PROGRAMMER_ALERTE, PROGRAMMER_ALERTES, ANNULER_ALERTE)
let timers = [];
function annuler() { timers.forEach(clearTimeout); timers = []; }
function programmer(delaiMs, titre, message) {
  return new Promise(resolve => {
    timers.push(setTimeout(() => {
      self.registration.showNotification(titre, {
        body: message, icon: './icon-192.png', badge: './icon-192.png',
        vibrate: [300, 150, 300, 150, 300], requireInteraction: true, tag: 'ecocook-' + delaiMs
      }).then(resolve, resolve);
    }, Math.max(0, delaiMs)));
  });
}

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'ANNULER_ALERTE') { annuler(); return; }
  if (d.type === 'PROGRAMMER_ALERTE') {
    annuler();
    e.waitUntil(programmer(d.delaiMs, d.titre, d.message));
  } else if (d.type === 'PROGRAMMER_ALERTES' && Array.isArray(d.alertes)) {
    annuler();
    e.waitUntil(Promise.all(d.alertes.map(a => programmer(a.delaiMs, a.titre, a.message))));
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list =>
      list.length ? list[0].focus() : self.clients.openWindow('./index.html'))
  );
});
