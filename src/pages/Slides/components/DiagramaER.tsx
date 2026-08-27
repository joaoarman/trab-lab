import { useTranslation } from 'react-i18next'

interface Coluna {
  nome: string
  tipo: string
  chave?: 'PK' | 'FK'
}

interface Tabela {
  nome: string
  x: number
  y: number
  colunas: Coluna[]
}

const LARGURA = 260
const ALTURA_DO_CABECALHO = 30
const ALTURA_DA_LINHA = 18

const alturaDe = (tabela: Tabela) =>
  ALTURA_DO_CABECALHO + tabela.colunas.length * ALTURA_DA_LINHA + 8

const TABELAS: Tabela[] = [
  {
    nome: 'profile',
    x: 465,
    y: 10,
    colunas: [
      { nome: 'id', tipo: 'int', chave: 'PK' },
      { nome: 'auth_uuid', tipo: 'uuid', chave: 'FK' },
      { nome: 'full_name', tipo: 'text' },
      { nome: 'email', tipo: 'text' },
      { nome: 'avatar_path', tipo: 'text' },
      { nome: 'deleted_at', tipo: 'timestamptz' },
    ],
  },
  {
    nome: 'category',
    x: 60,
    y: 215,
    colunas: [
      { nome: 'id', tipo: 'int', chave: 'PK' },
      { nome: 'profile_id', tipo: 'int', chave: 'FK' },
      { nome: 'parent_id', tipo: 'int', chave: 'FK' },
      { nome: 'name', tipo: 'text' },
      { nome: 'color', tipo: 'text' },
      { nome: 'is_active', tipo: 'boolean' },
      { nome: 'deleted_at', tipo: 'timestamptz' },
    ],
  },
  {
    nome: 'expense',
    x: 340,
    y: 215,
    colunas: [
      { nome: 'id', tipo: 'int', chave: 'PK' },
      { nome: 'profile_id', tipo: 'int', chave: 'FK' },
      { nome: 'category_id', tipo: 'int', chave: 'FK' },
      { nome: 'name', tipo: 'text' },
      { nome: 'amount', tipo: 'numeric(12,2)' },
      { nome: 'currency', tipo: 'currency' },
      { nome: 'exchange_rate', tipo: 'numeric(14,6)' },
      { nome: 'amount_brl', tipo: 'numeric(12,2)' },
      { nome: 'occurred_at', tipo: 'timestamptz' },
      { nome: 'deleted_at', tipo: 'timestamptz' },
    ],
  },
  {
    nome: 'income',
    x: 620,
    y: 215,
    colunas: [
      { nome: 'id', tipo: 'int', chave: 'PK' },
      { nome: 'profile_id', tipo: 'int', chave: 'FK' },
      { nome: 'name', tipo: 'text' },
      { nome: 'amount', tipo: 'numeric(12,2)' },
      { nome: 'currency', tipo: 'currency' },
      { nome: 'exchange_rate', tipo: 'numeric(14,6)' },
      { nome: 'amount_brl', tipo: 'numeric(12,2)' },
      { nome: 'received_at', tipo: 'timestamptz' },
      { nome: 'deleted_at', tipo: 'timestamptz' },
    ],
  },
  {
    nome: 'ai_log',
    x: 900,
    y: 215,
    colunas: [
      { nome: 'id', tipo: 'int', chave: 'PK' },
      { nome: 'profile_id', tipo: 'int', chave: 'FK' },
      { nome: 'role', tipo: 'text' },
      { nome: 'content', tipo: 'text' },
      { nome: 'source', tipo: 'text' },
      { nome: 'kind', tipo: 'text' },
      { nome: 'receipts', tipo: 'jsonb' },
      { nome: 'tool_calls', tipo: 'jsonb' },
      { nome: 'ai_model', tipo: 'text' },
      { nome: 'cost_usd_cents', tipo: 'numeric(12,6)' },
      { nome: 'is_active', tipo: 'boolean' },
    ],
  },
]

function Caixa({ tabela }: { tabela: Tabela }) {
  const { x, y } = tabela
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={LARGURA}
        height={alturaDe(tabela)}
        rx={8}
        className="fill-card stroke-border"
        strokeWidth={1.5}
      />
      <path
        d={`M ${x} ${y + ALTURA_DO_CABECALHO} v -22 a 8 8 0 0 1 8 -8 h ${LARGURA - 16} a 8 8 0 0 1 8 8 v 22 z`}
        className="fill-primary-muted"
      />
      <line
        x1={x}
        y1={y + ALTURA_DO_CABECALHO}
        x2={x + LARGURA}
        y2={y + ALTURA_DO_CABECALHO}
        className="stroke-border"
        strokeWidth={1.5}
      />
      <text
        x={x + 12}
        y={y + 20}
        fontSize={15}
        className="fill-primary-muted-foreground font-mono font-semibold"
      >
        {tabela.nome}
      </text>

      {tabela.colunas.map((coluna, indice) => {
        const linhaY = y + ALTURA_DO_CABECALHO + 14 + indice * ALTURA_DA_LINHA
        return (
          <g key={coluna.nome}>
            {coluna.chave && (
              <text x={x + 10} y={linhaY} fontSize={9} className="fill-primary font-semibold">
                {coluna.chave}
              </text>
            )}
            <text x={x + 34} y={linhaY} fontSize={12.5} className="fill-foreground font-mono">
              {coluna.nome}
            </text>
            <text
              x={x + LARGURA - 10}
              y={linhaY}
              textAnchor="end"
              fontSize={10.5}
              className="fill-muted-foreground font-mono"
            >
              {coluna.tipo}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function Cardinalidade({ x, y, texto }: { x: number; y: number; texto: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={12}
      className="fill-muted-foreground font-mono font-semibold"
    >
      {texto}
    </text>
  )
}

export function DiagramaER() {
  const { t } = useTranslation()

  const profile = TABELAS[0]
  const auth: Tabela = {
    nome: 'auth.users',
    x: 140,
    y: 40,
    colunas: [
      { nome: 'id', tipo: 'uuid', chave: 'PK' },
      { nome: 'email', tipo: 'text' },
    ],
  }
  const meioDoProfile = profile.x + LARGURA / 2
  const peDoProfile = profile.y + alturaDe(profile)
  const barramento = 185

  return (
    <svg
      viewBox="50 0 1130 504"
      className="h-full w-full"
      role="img"
      aria-label={t('slides.banco.title')}
    >
      <defs>
        <marker
          id="er-seta"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
        </marker>
      </defs>

      <g className="opacity-70">
        <rect
          x={auth.x}
          y={auth.y}
          width={LARGURA}
          height={alturaDe(auth)}
          rx={8}
          className="fill-card stroke-muted-foreground"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text
          x={auth.x + 12}
          y={auth.y + 20}
          fontSize={15}
          className="fill-muted-foreground font-mono font-semibold"
        >
          {auth.nome}
        </text>
        {auth.colunas.map((coluna, indice) => {
          const linhaY = auth.y + ALTURA_DO_CABECALHO + 14 + indice * ALTURA_DA_LINHA
          return (
            <g key={coluna.nome}>
              {coluna.chave && (
                <text x={auth.x + 10} y={linhaY} fontSize={9} className="fill-primary font-semibold">
                  {coluna.chave}
                </text>
              )}
              <text x={auth.x + 34} y={linhaY} fontSize={12.5} className="fill-foreground font-mono">
                {coluna.nome}
              </text>
              <text
                x={auth.x + LARGURA - 10}
                y={linhaY}
                textAnchor="end"
                fontSize={10.5}
                className="fill-muted-foreground font-mono"
              >
                {coluna.tipo}
              </text>
            </g>
          )
        })}
      </g>
      <path
        d={`M ${auth.x + LARGURA} 77 H ${profile.x}`}
        className="stroke-muted-foreground"
        strokeWidth={1.5}
        fill="none"
        markerEnd="url(#er-seta)"
      />
      <Cardinalidade x={(auth.x + LARGURA + profile.x) / 2} y={68} texto="1 : 1" />

      <path
        d={`M ${meioDoProfile} ${peDoProfile} V ${barramento}`}
        className="stroke-muted-foreground"
        strokeWidth={1.5}
        fill="none"
      />
      <Cardinalidade x={meioDoProfile + 16} y={peDoProfile + 20} texto="1" />
      {TABELAS.slice(1).map((tabela) => {
        const centro = tabela.x + LARGURA / 2
        return (
          <g key={tabela.nome}>
            <path
              d={`M ${meioDoProfile} ${barramento} H ${centro} V ${tabela.y}`}
              className="stroke-muted-foreground"
              strokeWidth={1.5}
              fill="none"
              markerEnd="url(#er-seta)"
            />
            <Cardinalidade x={centro + 16} y={tabela.y - 8} texto="N" />
          </g>
        )
      })}

      {TABELAS.map((tabela) => (
        <Caixa key={tabela.nome} tabela={tabela} />
      ))}

      <path
        d="M 160 379 V 401 H 220 V 379"
        className="stroke-muted-foreground"
        strokeWidth={1.5}
        fill="none"
        markerEnd="url(#er-seta)"
      />
      <text x={158} y={418} textAnchor="middle" fontSize={11} className="fill-muted-foreground font-mono">
        parent_id · 0..1 : N
      </text>

      <path
        d="M 292 379 V 470 H 470 V 433"
        className="stroke-muted-foreground"
        strokeWidth={1.5}
        fill="none"
        markerEnd="url(#er-seta)"
      />
      <text x={365} y={489} textAnchor="middle" fontSize={11} className="fill-muted-foreground font-mono">
        category_id · 0..1 : N
      </text>
    </svg>
  )
}
