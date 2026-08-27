/*
  Service worker do Self OS — deliberadamente MÍNIMO.

  Ele existe por dois motivos, e nenhum deles é velocidade:
  1. sem um service worker com handler de `fetch`, o Chrome não oferece
     "instalar" nem no Android nem no desktop;
  2. aberto sem rede, o app precisa mostrar alguma coisa que não seja o
     dinossauro do navegador.

  O que ele NÃO faz é o ponto: não guarda o HTML nem o JS do app. Cache de
  aplicação serve versão velha depois de um deploy, e a hora em que isso
  apareceria é a pior possível — no meio da apresentação, com o navegador
  jurando que está tudo atualizado. Aqui a rede sempre ganha; o cache só entra
  quando ela falha.
*/

const CACHE = 'selfos-offline-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((chave) => chave !== CACHE).map((chave) => caches.delete(chave))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  // Só navegação: pedido de API, imagem e script passam direto, sem o SW no meio.
  if (evento.request.mode !== 'navigate') return

  evento.respondWith(fetch(evento.request).catch(() => caches.match(OFFLINE)))
})
