import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Check, Clock, HelpCircle } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip'
import { MODULOS_FUTUROS } from '@/shared/components/layout/navigation'
import { cn } from '@/shared/lib/utils'
import { Bullets, Cartao, Codigo, Grade, Kicker, Slide } from './components/Slide'
import { DetalheDoPrompt } from './components/DetalheDoPrompt'
import { DiagramaDeCasosDeUso } from './components/DiagramaDeCasosDeUso'
import { DiagramaER } from './components/DiagramaER'
import { TabelaDeRequisitos } from './components/TabelaDeRequisitos'
import { TabelaDeComparacao } from './components/TabelaDeComparacao'
import { TelefoneComOChat, TelefoneNaTelaDeInicio } from './components/TelefoneComOApp'
import { ARVORE_NO_PROMPT, BASE_PROMPT_REAL, CONTEXTO_DA_CONVERSA } from './basePrompt'
import {
  ETAPAS_DE_VALIDACAO,
  PASSOS_TECNICOS,
  REQUISITOS_DEMAIS,
  REQUISITOS_ESSENCIAIS,
  TELAS,
} from './conteudo'

export interface SlideDoDeck {
  id: string
  titleKey: string
  render: () => ReactNode
}

function Passo({ numero, title, body }: { numero: number; title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-md border border-border bg-card p-4">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">
        {numero}
      </span>
      <h3 className="font-display text-base font-semibold sm:text-lg">{title}</h3>
      <p className="text-pretty text-sm leading-snug text-muted-foreground sm:text-base">{body}</p>
    </div>
  )
}

function Capa() {
  const { t } = useTranslation()
  return (
    <Slide className="justify-center">
      <div className="flex flex-1 flex-col justify-center gap-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary sm:text-sm">
          {t('slides.capa.eyebrow')}
        </p>
        <div className="space-y-3">
          <h1 className="font-display text-5xl font-bold leading-none sm:text-7xl lg:text-8xl">
            {t('slides.capa.title')}
          </h1>
          <p className="text-balance font-display text-lg text-muted-foreground sm:text-2xl lg:text-3xl">
            {t('slides.capa.tagline')}
          </p>
        </div>
        <div className="space-y-1 border-l-2 border-primary pl-4 text-sm sm:text-base lg:text-lg">
          <p className="font-semibold">{t('slides.capa.author')}</p>
          <p className="text-muted-foreground">{t('slides.capa.course')}</p>
          <p className="font-mono text-xs text-muted-foreground sm:text-sm">
            {t('slides.capa.domain')}
          </p>
        </div>
      </div>
    </Slide>
  )
}

function Problema() {
  const { t } = useTranslation()
  return (
    <Slide
      eyebrow={t('slides.problema.eyebrow')}
      title={t('slides.problema.title')}
      footer={<Kicker>{t('slides.problema.kicker')}</Kicker>}
    >
      <Bullets itens={t('slides.problema.itens', { returnObjects: true }) as string[]} />
    </Slide>
  )
}

function Solucao() {
  const { t } = useTranslation()
  const cards = t('slides.solucao.cards', { returnObjects: true }) as {
    title: string
    body: string
  }[]
  return (
    <Slide
      eyebrow={t('slides.solucao.eyebrow')}
      title={t('slides.solucao.title')}
      footer={
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t('slides.solucao.footer')}
        </p>
      }
    >
      <p className="text-pretty text-lg leading-snug sm:text-xl lg:text-2xl">
        {t('slides.solucao.lead')}
      </p>
      <Grade colunas={3}>
        {cards.map((card) => (
          <Cartao key={card.title} title={card.title}>
            {card.body}
          </Cartao>
        ))}
      </Grade>
    </Slide>
  )
}

function Fluxo() {
  const { t } = useTranslation()
  const passos = t('slides.fluxo.passos', { returnObjects: true }) as {
    title: string
    body: string
  }[]
  return (
    <Slide eyebrow={t('slides.fluxo.eyebrow')} title={t('slides.fluxo.title')}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {passos.map((passo, indice) => (
          <Passo key={passo.title} numero={indice + 1} title={passo.title} body={passo.body} />
        ))}
      </div>
    </Slide>
  )
}

const ENQUADRAMENTO_DO_DIAGRAMA = 'gap-3 px-3 py-4 sm:gap-4 sm:px-5 sm:py-5 lg:gap-4 lg:px-6 lg:py-6'

function Dica({ texto }: { texto: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={texto}
          className="rounded-full text-muted-foreground outline-none ring-ring transition-colors hover:text-primary focus-visible:ring-2"
        >
          <HelpCircle className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-pretty leading-snug">
        {texto}
      </TooltipContent>
    </Tooltip>
  )
}

const MARCADOR = /\{\{(\w+)\}\}/g

function comMarcadores(codigo: string, botoes: Record<string, ReactNode>): ReactNode[] {
  const partes: ReactNode[] = []
  let cursor = 0
  for (const achado of codigo.matchAll(MARCADOR)) {
    const inicio = achado.index ?? 0
    if (inicio > cursor) partes.push(codigo.slice(cursor, inicio))
    partes.push(<Fragment key={inicio}>{botoes[achado[1]]}</Fragment>)
    cursor = inicio + achado[0].length
  }
  partes.push(codigo.slice(cursor))
  return partes
}

function FluxoTecnico() {
  const { t } = useTranslation()

  const botoes: Record<string, ReactNode> = {
    basePrompt: (
      <DetalheDoPrompt
        rotulo={t('slides.fluxoTecnico.detalhes.basePrompt.rotulo')}
        titulo={t('slides.fluxoTecnico.detalhes.basePrompt.titulo')}
        descricao={t('slides.fluxoTecnico.detalhes.basePrompt.descricao', {
          linhas: BASE_PROMPT_REAL.split('\n').length,
        })}
        conteudo={BASE_PROMPT_REAL}
      />
    ),
    contexto: (
      <DetalheDoPrompt
        rotulo={t('slides.fluxoTecnico.detalhes.contexto.rotulo')}
        titulo={t('slides.fluxoTecnico.detalhes.contexto.titulo')}
        descricao={t('slides.fluxoTecnico.detalhes.contexto.descricao')}
        conteudo={CONTEXTO_DA_CONVERSA}
      />
    ),
    arvore: (
      <DetalheDoPrompt
        rotulo={t('slides.fluxoTecnico.detalhes.arvore.rotulo')}
        titulo={t('slides.fluxoTecnico.detalhes.arvore.titulo')}
        descricao={t('slides.fluxoTecnico.detalhes.arvore.descricao')}
        conteudo={ARVORE_NO_PROMPT}
      />
    ),
  }

  return (
    <Slide eyebrow={t('slides.fluxoTecnico.eyebrow')} title={t('slides.fluxoTecnico.title')}>
      <div className="grid gap-4 lg:grid-cols-2">
        {PASSOS_TECNICOS.map((passo, indice) => (
          <div key={passo.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[0.6875rem] font-bold text-primary-foreground">
                {indice + 1}
              </span>
              <h3 className="font-display text-base font-semibold sm:text-lg">
                {t(`slides.fluxoTecnico.passos.${passo.id}.title`)}
              </h3>
              <Dica texto={t(`slides.fluxoTecnico.passos.${passo.id}.body`)} />
            </div>
            <Codigo>{comMarcadores(passo.codigo, botoes)}</Codigo>
          </div>
        ))}
      </div>
    </Slide>
  )
}

function Personas() {
  const { t } = useTranslation()
  const pessoas = t('slides.personas.pessoas', { returnObjects: true }) as {
    nome: string
    papel: string
    cita: string
    dor: string
    precisa: string
  }[]
  return (
    <Slide eyebrow={t('slides.personas.eyebrow')} title={t('slides.personas.title')}>
      <Grade colunas={3}>
        {pessoas.map((pessoa) => (
          <div
            key={pessoa.nome}
            className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:p-5"
          >
            <div>
              <h3 className="font-display text-lg font-semibold sm:text-xl">{pessoa.nome}</h3>
              <p className="text-sm text-muted-foreground">{pessoa.papel}</p>
            </div>
            <p className="text-pretty border-l-2 border-primary pl-3 font-display text-base italic leading-snug sm:text-lg">
              {pessoa.cita}
            </p>
            <p className="text-pretty text-sm leading-snug text-muted-foreground sm:text-base">
              {pessoa.dor}
            </p>
            <p className="text-pretty mt-auto text-sm leading-snug sm:text-base">
              {pessoa.precisa}
            </p>
          </div>
        ))}
      </Grade>
    </Slide>
  )
}

function Historias() {
  const { t } = useTranslation()
  const itens = t('slides.historias.itens', { returnObjects: true }) as {
    quero: string
    para: string
  }[]
  return (
    <Slide eyebrow={t('slides.historias.eyebrow')} title={t('slides.historias.title')}>
      <ul className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
        {itens.map((item) => (
          <li key={item.quero} className="flex gap-3 border-b border-border/60 pb-3">
            <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
            <span className="text-pretty text-sm leading-snug sm:text-base lg:text-lg">
              <span className="font-medium">{item.quero}</span>{' '}
              <span className="text-muted-foreground">{item.para}</span>
            </span>
          </li>
        ))}
      </ul>
    </Slide>
  )
}

function RequisitosEssenciais() {
  const { t } = useTranslation()
  return (
    <Slide
      eyebrow={t('slides.requisitos.eyebrow')}
      title={t('slides.requisitos.titleEssenciais')}
      footer={
        <p className="text-xs text-muted-foreground sm:text-sm">{t('slides.requisitos.nota')}</p>
      }
    >
      <TabelaDeRequisitos requisitos={REQUISITOS_ESSENCIAIS} />
    </Slide>
  )
}

function RequisitosDemais() {
  const { t } = useTranslation()
  return (
    <Slide eyebrow={t('slides.requisitos.eyebrow')} title={t('slides.requisitos.titleDemais')}>
      <TabelaDeRequisitos requisitos={REQUISITOS_DEMAIS} />
    </Slide>
  )
}

function CasosDeUso() {
  const { t } = useTranslation()
  return (
    <Slide
      eyebrow={t('slides.casosDeUso.eyebrow')}
      title={t('slides.casosDeUso.title')}
      className={ENQUADRAMENTO_DO_DIAGRAMA}
      footer={
        <p className="text-xs text-muted-foreground sm:text-sm">{t('slides.casosDeUso.legenda')}</p>
      }
    >
      <div className="min-h-0 flex-1">
        <DiagramaDeCasosDeUso />
      </div>
    </Slide>
  )
}

function Banco() {
  const { t } = useTranslation()
  return (
    <Slide
      eyebrow={t('slides.banco.eyebrow')}
      title={t('slides.banco.title')}
      className={ENQUADRAMENTO_DO_DIAGRAMA}
    >
      <div className="min-h-0 flex-1">
        <DiagramaER />
      </div>
    </Slide>
  )
}

function Arquitetura() {
  const { t } = useTranslation()
  const blocos = t('slides.arquitetura.blocos', { returnObjects: true }) as {
    title: string
    body: string
  }[]
  return (
    <Slide eyebrow={t('slides.arquitetura.eyebrow')} title={t('slides.arquitetura.title')}>
      <Grade colunas={4}>
        {blocos.map((bloco) => (
          <Cartao key={bloco.title} title={bloco.title}>
            {bloco.body}
          </Cartao>
        ))}
      </Grade>
    </Slide>
  )
}

function Telas() {
  const { t } = useTranslation()
  return (
    <Slide
      eyebrow={t('slides.telas.eyebrow')}
      title={t('slides.telas.title')}
      footer={
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          {t('slides.telas.lead')}
        </p>
      }
    >
      <Grade colunas={4}>
        {TELAS.map((tela) => (
          <div
            key={tela.rota}
            className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-4"
          >
            <h3 className="font-display text-base font-semibold sm:text-lg">{t(tela.labelKey)}</h3>
            <p className="text-pretty text-sm leading-snug text-muted-foreground">
              {t(tela.subtitleKey)}
            </p>
            <Button asChild variant="ghost" size="sm" className="mt-auto justify-start px-0">
              <a href={tela.rota} target="_blank" rel="noreferrer">
                <span className="font-mono text-xs">{tela.rota}</span>
                <ArrowUpRight className="size-4" aria-hidden />
                <span className="sr-only">{t('slides.ui.open')}</span>
              </a>
            </Button>
          </div>
        ))}
      </Grade>
    </Slide>
  )
}

function Pwa() {
  const { t } = useTranslation()
  const cartoes = t('slides.pwa.cartoes', { returnObjects: true }) as {
    title: string
    body: string
  }[]

  return (
    <Slide
      eyebrow={t('slides.pwa.eyebrow')}
      title={t('slides.pwa.title')}
    >
      <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex shrink-0 items-start gap-4 sm:gap-5">
          <TelefoneNaTelaDeInicio legenda={t('slides.pwa.telaDeInicio')} />
          <TelefoneComOChat legenda={t('slides.pwa.telaDoChat')} />
        </div>

        <div className="grid min-w-0 flex-1 gap-2.5 sm:grid-cols-2 lg:gap-3">
          {cartoes.map((cartao) => (
            <Cartao key={cartao.title} title={cartao.title} className="gap-1 p-3 sm:p-4">
              {cartao.body}
            </Cartao>
          ))}
        </div>
      </div>
    </Slide>
  )
}

function Validacao() {
  const { t } = useTranslation()
  return (
    <Slide eyebrow={t('slides.validacao.eyebrow')} title={t('slides.validacao.title')}>
      <ol className="space-y-3">
        {ETAPAS_DE_VALIDACAO.map(({ id, estado }) => {
          const feito = estado === 'FEITO'
          const Icone = feito ? Check : Clock
          return (
            <li key={id} className="flex gap-3 sm:gap-4">
              <span
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                  feito ? 'bg-income-muted text-income' : 'bg-muted text-muted-foreground',
                )}
              >
                <Icone className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="font-display text-base font-semibold sm:text-lg lg:text-xl">
                    {t(`slides.validacao.etapas.${id}.title`)}
                  </h3>
                  <Badge variant={feito ? 'secondary' : 'outline'} className="shrink-0">
                    {t(`slides.validacao.estados.${estado}`)}
                  </Badge>
                </div>
                <p className="text-pretty text-sm leading-snug text-muted-foreground sm:text-base lg:text-lg">
                  {t(`slides.validacao.etapas.${id}.body`)}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Slide>
  )
}

function Concorrentes() {
  const { t } = useTranslation()
  const itens = t('slides.concorrentes.itens', { returnObjects: true }) as {
    nome: string
    onde: string
    faz: string
    falta: string
  }[]
  return (
    <Slide eyebrow={t('slides.concorrentes.eyebrow')} title={t('slides.concorrentes.title')}>
      <Grade colunas={3}>
        {itens.map((item) => (
          <div
            key={item.nome}
            className="flex flex-col gap-2 rounded-md border border-border bg-card p-4 sm:p-5"
          >
            <div>
              <h3 className="font-display text-lg font-semibold sm:text-xl">{item.nome}</h3>
              <p className="font-mono text-xs text-muted-foreground">{item.onde}</p>
            </div>
            <p className="text-pretty text-sm leading-snug sm:text-base">{item.faz}</p>
            <p className="text-pretty mt-auto border-t border-border pt-2 text-sm leading-snug text-expense">
              {item.falta}
            </p>
          </div>
        ))}
      </Grade>
    </Slide>
  )
}

function Comparacao() {
  const { t } = useTranslation()
  return (
    <Slide eyebrow={t('slides.comparacao.eyebrow')} title={t('slides.comparacao.title')}>
      <TabelaDeComparacao />
    </Slide>
  )
}

function Documentacao() {
  const { t } = useTranslation()
  const itens = t('slides.documentacao.itens', { returnObjects: true }) as {
    path: string
    body: string
  }[]
  return (
    <Slide eyebrow={t('slides.documentacao.eyebrow')} title={t('slides.documentacao.title')}>
      <ul className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
        {itens.map((item) => (
          <li key={item.path} className="border-l-2 border-border pl-3">
            <p className="font-mono text-xs font-semibold text-primary sm:text-sm">{item.path}</p>
            <p className="text-pretty text-sm leading-snug text-muted-foreground sm:text-base">
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </Slide>
  )
}

function Futuro() {
  const { t } = useTranslation()
  return (
    <Slide
      eyebrow={t('slides.futuro.eyebrow')}
      title={t('slides.futuro.title')}
      footer={<Kicker>{t('slides.futuro.kicker')}</Kicker>}
    >
      <p className="text-pretty text-lg leading-snug sm:text-xl lg:text-2xl">
        {t('slides.futuro.lead')}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {MODULOS_FUTUROS.map((modulo) => (
          <div
            key={modulo.labelKey}
            className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border p-4 text-center"
          >
            <modulo.icon className="size-6 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium sm:text-base">{t(modulo.labelKey)}</span>
          </div>
        ))}
      </div>
    </Slide>
  )
}

function Fim() {
  const { t } = useTranslation()
  return (
    <Slide className="justify-center">
      <div className="flex flex-1 flex-col justify-center gap-4">
        <h2 className="font-display text-5xl font-bold sm:text-7xl lg:text-8xl">
          {t('slides.fim.title')}
        </h2>
        <p className="font-display text-2xl text-muted-foreground sm:text-4xl">
          {t('slides.fim.lead')}
        </p>
        <p className="text-pretty max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t('slides.fim.demo')}
        </p>
      </div>
    </Slide>
  )
}

export const SLIDES: SlideDoDeck[] = [
  { id: 'capa', titleKey: 'slides.capa.title', render: () => <Capa /> },
  { id: 'problema', titleKey: 'slides.problema.title', render: () => <Problema /> },
  { id: 'solucao', titleKey: 'slides.solucao.title', render: () => <Solucao /> },
  { id: 'fluxo', titleKey: 'slides.fluxo.title', render: () => <Fluxo /> },
  {
    id: 'fluxo-tecnico',
    titleKey: 'slides.fluxoTecnico.title',
    render: () => <FluxoTecnico />,
  },
  { id: 'personas', titleKey: 'slides.personas.title', render: () => <Personas /> },
  { id: 'historias', titleKey: 'slides.historias.eyebrow', render: () => <Historias /> },
  {
    id: 'requisitos-essenciais',
    titleKey: 'slides.requisitos.titleEssenciais',
    render: () => <RequisitosEssenciais />,
  },
  {
    id: 'requisitos-demais',
    titleKey: 'slides.requisitos.titleDemais',
    render: () => <RequisitosDemais />,
  },
  { id: 'casos-de-uso', titleKey: 'slides.casosDeUso.title', render: () => <CasosDeUso /> },
  { id: 'banco', titleKey: 'slides.banco.title', render: () => <Banco /> },
  { id: 'arquitetura', titleKey: 'slides.arquitetura.title', render: () => <Arquitetura /> },
  { id: 'telas', titleKey: 'slides.telas.title', render: () => <Telas /> },
  { id: 'pwa', titleKey: 'slides.pwa.title', render: () => <Pwa /> },
  { id: 'validacao', titleKey: 'slides.validacao.title', render: () => <Validacao /> },
  { id: 'concorrentes', titleKey: 'slides.concorrentes.title', render: () => <Concorrentes /> },
  { id: 'comparacao', titleKey: 'slides.comparacao.title', render: () => <Comparacao /> },
  { id: 'documentacao', titleKey: 'slides.documentacao.title', render: () => <Documentacao /> },
  { id: 'futuro', titleKey: 'slides.futuro.title', render: () => <Futuro /> },
  { id: 'fim', titleKey: 'slides.fim.title', render: () => <Fim /> },
]

export const TOTAL_DE_SLIDES = SLIDES.length
