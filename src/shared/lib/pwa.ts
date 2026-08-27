/*
  O registro do service worker (`public/sw.js`), que é o que torna o Self OS
  instalável — no Android e no desktop o Chrome só oferece "instalar" quando
  existe um service worker com handler de `fetch`. No iPhone, "Adicionar à Tela
  de Início" funciona sem ele; quem manda lá são as meta tags do `index.html`.

  Só em produção, de propósito: em desenvolvimento o service worker se põe entre
  o navegador e o servidor do Vite e atrapalha o hot reload.
*/
export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Sem service worker o app funciona igual: perde o "instalar" do Chrome. */
    })
  })
}
