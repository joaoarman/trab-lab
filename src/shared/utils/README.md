# src/shared/utils

Utilitários **compartilhados** do app — genéricos, reusáveis por qualquer módulo.

Já incluídos no template:

- `image.ts` — redimensiona uma imagem no navegador → data URL (base64).
- `exportXlsx.ts` — exporta dados (linhas + colunas) para `.xlsx` (exceljs + file-saver).
- `exportPdf.ts` — exporta título + tabela para `.pdf` (jspdf + jspdf-autotable).

Coloque aqui **novos utilitários reusáveis** que sirvam a qualquer módulo do sistema
(ex.: futura exportação PowerPoint/`.pptx`, conversões, formatadores de data/moeda).
Algo **específico de um módulo** não vem pra cá — vai na pasta do próprio módulo.

> Observação: a pasta irmã `src/shared/lib/` guarda integrações/infra (ex.: `supabaseClient.ts`).
