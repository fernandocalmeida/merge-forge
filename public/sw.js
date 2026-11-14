// Service worker do Merge Forge.
// Rede primeiro (o código novo chega na hora); sem internet, abre a cópia guardada.
// API e vídeos nunca passam pelo cache (vídeo usa Range).
const VERSAO = "forge-v31";
const CASCA = ["/", "/css/app.css", "/css/estudio.css", "/js/app.js", "/js/estudio.js", "/js/redes.js", "/js/conexoes.js", "/js/celular.js", "/js/poster.js",
  "/js/exportar.js", "/manifest.webmanifest", "/logo-forge.png", "/icone-forge-192.png", "/icone-forge-512.png", "/icone-forge-512-maskable.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/downloads/")) return;
  const chave = req.mode === "navigate" ? "/" : req;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(chave, copia)); }
        return r;
      })
      .catch(() => caches.match(chave))
  );
});
