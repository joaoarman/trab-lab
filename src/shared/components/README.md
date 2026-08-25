# src/shared/components

Componentes **compartilhados** por todo o app (a UI **deste** projeto — não há biblioteca de UI
compartilhada entre projetos).

- `ui/` — **primitivos da UI** do projeto (Button, Card, Input, Dialog…). Tipicamente gerados pelo
  **shadcn/ui** (`npx shadcn@latest add …`, com o `components.json` apontando para cá) ou feitos à mão.
- **Layout / shell** (ex.: uma pasta `layout/` com `AppLayout`, `Sidebar`, `Header`, `Brand`) também
  mora aqui. A estrutura do shell (sidebar/header/combinação) é definida na criação do projeto e construída sob
  medida — **não há layout padrão**.

Regras:

- Primitivo de UI reutilizável ou componente global → **aqui**.
- Componente **específico de um módulo** → na pasta do módulo (`src/pages/<Módulo>/components/`), não aqui.
- O util `cn` fica em `src/shared/lib/utils.ts`.
