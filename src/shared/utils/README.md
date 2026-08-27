# src/shared/utils

Utilitários **compartilhados** do app — genéricos, reusáveis por qualquer módulo.

O que existe hoje:

- `image.ts` — redimensiona uma imagem no navegador → data URL (base64).
- `dinheiro.ts` — o texto digitado ↔ os centavos inteiros que o banco guarda.
- `datas.ts` — toda conta de data do app, sempre no fuso local.

Coloque aqui **novos utilitários reusáveis** que sirvam a qualquer módulo do sistema
(conversões, formatadores, cálculos que não pertencem a uma tela só).
Algo **específico de um módulo** não vem pra cá — vai na pasta do próprio módulo.

> Observação: a pasta irmã `src/shared/lib/` guarda integrações/infra (ex.: `supabaseClient.ts`).
