// Service worker: a small background script the browser keeps for this site.
// It caches the app's own files so the app opens instantly and works on a bad connection.
// Strategy: "network first" for our files (always try for the newest version, fall back to the cache).
// Database calls to Supabase are never cached, so your data is always live.
const CACHE = "gym-streak-v43";
const SHELL = ["./", "index.html", "styles.css?v=43", "app.js?v=43", "config.js?v=43", "split.js?v=43", "manifest.webmanifest",
               "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Notifications: the push service wakes this script with an (already decrypted) message; we show it.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "CREW", {
    body: d.body || "", tag: d.tag, renotify: !!d.tag, data: { url: d.url || "./" },
    icon: "icons/icon-192.png", badge: "icons/icon-192.png",
  }));
});
// Tapping a notification: bring the app to the front (or open it)
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow(e.notification.data && e.notification.data.url || "./");
  }));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // leave Supabase, fonts etc. alone
  // cache: "no-cache" = ask the server "has this changed?" every time, instead of trusting a 10-minute-old copy
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }   // never cache an error page
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
