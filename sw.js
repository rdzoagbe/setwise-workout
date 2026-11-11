const CACHE = "setwise-shell-v12";

// Required shell. cache.addAll() is atomic: if any one of these fails, install
// rejects and the app gets NO offline support at all. Keep this list to files
// that are committed to the repository and therefore always present.
const REQUIRED = ["./", "./index.html", "./styles.css", "./exercise-guide.js", "./app.js", "./manifest.webmanifest"];

// Optional extras. These are either generated at build time (bundled-guides.js)
// or non-essential (icons), so they are cached individually and allowed to fail
// without taking the whole install down with them.
const OPTIONAL = ["./bundled-guides.js", "./icon.svg", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];

self.addEventListener("install", event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(REQUIRED).then(() =>
    Promise.all(OPTIONAL.map(url => cache.add(url).catch(() => {})))
  ))
));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (event.request.headers.has("range") || requestUrl.pathname.toLowerCase().endsWith(".mp4")) return;
  // Guide images under assets/guides/ are not precached. The same-origin runtime
  // caching below stores each one the first time it is viewed, so guides work
  // offline after first view without a 1.7 MB upfront download.
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match("./index.html"))));
});
