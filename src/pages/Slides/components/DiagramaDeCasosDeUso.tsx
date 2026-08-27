import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'

function quebrar(texto: string, maximo = 20): string[] {
  const palavras = texto.split(' ')
  const linhas: string[] = ['']
  for (const palavra of palavras) {
    const atual = linhas[linhas.length - 1]
    const candidato = atual ? `${atual} ${palavra}` : palavra
    if (candidato.length <= maximo || !atual) linhas[linhas.length - 1] = candidato
    else linhas.push(palavra)
  }
  return linhas
}

function CasoDeUso({
  x,
  y,
  rx,
  texto,
  destaque,
}: {
  x: number
  y: number
  rx: number
  texto: string
  destaque?: boolean
}) {
  const linhas = quebrar(texto, destaque ? 22 : 20)
  const ry = linhas.length > 1 ? 34 : 27
  const primeiroY = y - (linhas.length - 1) * 9

  return (
    <g>
      <ellipse
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        className={destaque ? 'fill-primary-muted stroke-primary' : 'fill-card stroke-border'}
        strokeWidth={destaque ? 2 : 1.5}
      />
      <text
        x={x}
        y={primeiroY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={15}
        className={destaque ? 'fill-primary-muted-foreground font-semibold' : 'fill-foreground'}
      >
        {linhas.map((linha, indice) => (
          <tspan key={linha} x={x} dy={indice === 0 ? 0 : 18}>
            {linha}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function Ator({ x, y, nome }: { x: number; y: number; nome: string }) {
  return (
    <g className="stroke-foreground" strokeWidth={2} fill="none" strokeLinecap="round">
      <circle cx={x} cy={y - 42} r={15} className="fill-card stroke-foreground" />
      <line x1={x} y1={y - 27} x2={x} y2={y + 18} />
      <line x1={x - 24} y1={y - 8} x2={x + 24} y2={y - 8} />
      <line x1={x} y1={y + 18} x2={x - 20} y2={y + 52} />
      <line x1={x} y1={y + 18} x2={x + 20} y2={y + 52} />
      <text
        x={x}
        y={y + 76}
        textAnchor="middle"
        fontSize={15}
        strokeWidth={0}
        className="fill-foreground font-semibold"
      >
        {nome}
      </text>
    </g>
  )
}

function SistemaExterno({ x, y, nome }: { x: number; y: number; nome: string }) {
  const largura = 250
  const altura = 58
  return (
    <g>
      <rect
        x={x - largura / 2}
        y={y}
        width={largura}
        height={altura}
        rx={8}
        className="fill-secondary stroke-border"
        strokeWidth={1.5}
      />
      <text
        x={x}
        y={y + 20}
        textAnchor="middle"
        fontSize={12}
        className="fill-muted-foreground italic"
      >
        «external system»
      </text>
      <text
        x={x}
        y={y + 41}
        textAnchor="middle"
        fontSize={15}
        className="fill-foreground font-semibold"
      >
        {nome}
      </text>
    </g>
  )
}

function Associacao({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-border" strokeWidth={1.5} />
}

function Dependencia({
  x1,
  y1,
  x2,
  y2,
  estereotipo,
  rotuloX,
  rotuloY,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  estereotipo: 'include' | 'extend'
  rotuloX: number
  rotuloY: number
}) {
  const include = estereotipo === 'include'
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={1.5}
        strokeDasharray="7 5"
        markerEnd={include ? 'url(#seta-include)' : 'url(#seta-extend)'}
        className={include ? 'stroke-muted-foreground' : 'stroke-primary'}
      />
      <text
        x={rotuloX}
        y={rotuloY}
        textAnchor="middle"
        fontSize={11}
        strokeWidth={3.5}
        paintOrder="stroke"
        className={cn('stroke-background', include ? 'fill-muted-foreground' : 'fill-primary')}
      >
        «{estereotipo}»
      </text>
    </g>
  )
}

export function DiagramaDeCasosDeUso() {
  const { t } = useTranslation()
  const caso = (chave: string) => t(`slides.casosDeUso.casos.${chave}`)

  const esquerda = 330
  const direita = 760
  const conversarY = 545

  const daConversa = [
    { chave: 'consultar', y: 110, estereotipo: 'include' as const },
    { chave: 'editar', y: 190, estereotipo: 'include' as const },
    { chave: 'excluir', y: 270, estereotipo: 'include' as const },
    { chave: 'criarCategoria', y: 350, estereotipo: 'include' as const },
    { chave: 'ditar', y: 430, estereotipo: 'extend' as const },
    { chave: 'recusar', y: 510, estereotipo: 'extend' as const },
  ]

  const doUsuario = [
    { chave: 'entrar', y: 110 },
    { chave: 'extrato', y: 200 },
    { chave: 'categorias', y: 275 },
    { chave: 'auditar', y: 350 },
    { chave: 'conta', y: 425 },
  ]

  return (
    <svg
      viewBox="0 0 1220 800"
      className="h-full w-full"
      role="img"
      aria-label={t('slides.casosDeUso.title')}
    >
      <defs>
        <marker id="seta-include" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
        </marker>
        <marker id="seta-extend" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
        </marker>
      </defs>

      <rect
        x={170}
        y={20}
        width={1010}
        height={660}
        rx={14}
        className="fill-background stroke-border"
        strokeWidth={2}
      />
      <text
        x={675}
        y={52}
        textAnchor="middle"
        fontSize={17}
        className="fill-muted-foreground font-semibold"
      >
        {t('slides.casosDeUso.sistema')}
      </text>

      <Ator x={85} y={280} nome={t('slides.casosDeUso.atores.usuario')} />
      {doUsuario.map(({ y }) => (
        <Associacao key={`assoc-${y}`} x1={110} y1={280} x2={esquerda - 125} y2={y} />
      ))}
      <Associacao x1={110} y1={280} x2={esquerda - 140} y2={conversarY} />

      <SistemaExterno x={esquerda} y={720} nome={t('slides.casosDeUso.atores.ia')} />
      <Associacao x1={esquerda} y1={720} x2={esquerda} y2={conversarY + 36} />

      <SistemaExterno x={825} y={720} nome={t('slides.casosDeUso.atores.cotacao')} />
      <Associacao x1={760} y1={720} x2={545} y2={650} />
      <Associacao x1={890} y1={720} x2={935} y2={650} />

      {doUsuario.map(({ chave, y }) => (
        <CasoDeUso key={chave} x={esquerda} y={y} rx={125} texto={caso(chave)} />
      ))}

      <CasoDeUso x={esquerda} y={conversarY} rx={140} texto={caso('conversar')} destaque />

      {daConversa.map(({ chave, y, estereotipo }) => {
        const include = estereotipo === 'include'
        const [x1, y1, x2, y2] = include
          ? [esquerda + 140, conversarY, direita - 130, y]
          : [direita - 130, y, esquerda + 140, conversarY]
        const dx = direita - 130 - (esquerda + 140)
        const dy = y - conversarY
        const comprimento = Math.hypot(dx, dy)
        const t = 0.72
        const afastamento = 18
        return (
          <g key={chave}>
            <Dependencia
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              estereotipo={estereotipo}
              rotuloX={esquerda + 140 + dx * t - (dy / comprimento) * afastamento}
              rotuloY={conversarY + dy * t + (dx / comprimento) * afastamento}
            />
            <CasoDeUso x={direita} y={y} rx={130} texto={caso(chave)} />
          </g>
        )
      })}

      <Dependencia
        x1={esquerda + 105}
        y1={conversarY + 30}
        x2={445}
        y2={590}
        estereotipo="include"
        rotuloX={398}
        rotuloY={601}
      />
      <CasoDeUso x={490} y={620} rx={125} texto={caso('registrarGasto')} />

      <Dependencia
        x1={esquerda + 138}
        y1={conversarY + 18}
        x2={775}
        y2={608}
        estereotipo="include"
        rotuloX={648}
        rotuloY={573}
      />
      <CasoDeUso x={900} y={620} rx={125} texto={caso('registrarReceita')} />
    </svg>
  )
}
