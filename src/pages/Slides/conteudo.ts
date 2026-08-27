import { NAV_ITEMS } from '@/shared/components/layout/navigation'

export type Prioridade = 'ESSENCIAL' | 'IMPORTANTE' | 'DESEJAVEL'

export type StatusDoRequisito = 'PRONTO' | 'FUTURO'

export interface Requisito {
  id: string
  prioridade: Prioridade
  status: StatusDoRequisito
}

export const REQUISITOS: Requisito[] = [
  { id: 'RF01', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF02', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF03', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF04', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF05', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF06', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF07', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF08', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF09', prioridade: 'ESSENCIAL', status: 'PRONTO' },
  { id: 'RF10', prioridade: 'IMPORTANTE', status: 'PRONTO' },
  { id: 'RF11', prioridade: 'IMPORTANTE', status: 'PRONTO' },
  { id: 'RF12', prioridade: 'IMPORTANTE', status: 'PRONTO' },
  { id: 'RF13', prioridade: 'IMPORTANTE', status: 'PRONTO' },
  { id: 'RF14', prioridade: 'IMPORTANTE', status: 'PRONTO' },
  { id: 'RF15', prioridade: 'DESEJAVEL', status: 'FUTURO' },
  { id: 'RF16', prioridade: 'DESEJAVEL', status: 'FUTURO' },
  { id: 'RF17', prioridade: 'DESEJAVEL', status: 'FUTURO' },
  { id: 'RF18', prioridade: 'DESEJAVEL', status: 'FUTURO' },
  { id: 'RF19', prioridade: 'DESEJAVEL', status: 'FUTURO' },
]

export const REQUISITOS_ESSENCIAIS = REQUISITOS.filter((r) => r.prioridade === 'ESSENCIAL')
export const REQUISITOS_DEMAIS = REQUISITOS.filter((r) => r.prioridade !== 'ESSENCIAL')

export const PRODUTOS_COMPARADOS = ['selfos', 'meuAssessor', 'magie', 'mobills'] as const
export type Produto = (typeof PRODUTOS_COMPARADOS)[number]

export type Suporte = 'SIM' | 'PARCIAL' | 'NAO'

export interface CriterioDeComparacao {
  id: string
  valores: Record<Produto, Suporte>
}

export const COMPARACAO: CriterioDeComparacao[] = [
  {
    id: 'conversa',
    valores: { selfos: 'SIM', meuAssessor: 'SIM', magie: 'SIM', mobills: 'NAO' },
  },
  {
    id: 'appProprio',
    valores: { selfos: 'SIM', meuAssessor: 'NAO', magie: 'NAO', mobills: 'SIM' },
  },
  {
    id: 'arvore',
    valores: { selfos: 'SIM', meuAssessor: 'PARCIAL', magie: 'NAO', mobills: 'PARCIAL' },
  },
  {
    id: 'auditoria',
    valores: { selfos: 'SIM', meuAssessor: 'NAO', magie: 'NAO', mobills: 'NAO' },
  },
  {
    id: 'openFinance',
    valores: { selfos: 'PARCIAL', meuAssessor: 'SIM', magie: 'SIM', mobills: 'PARCIAL' },
  },
  {
    id: 'pagamentos',
    valores: { selfos: 'NAO', meuAssessor: 'NAO', magie: 'SIM', mobills: 'NAO' },
  },
  {
    id: 'alemFinanceiro',
    valores: { selfos: 'PARCIAL', meuAssessor: 'PARCIAL', magie: 'NAO', mobills: 'NAO' },
  },
  {
    id: 'chavePropria',
    valores: { selfos: 'PARCIAL', meuAssessor: 'NAO', magie: 'NAO', mobills: 'NAO' },
  },
]

export type EstadoDaEtapa = 'FEITO' | 'PLANEJADO'

export interface EtapaDeValidacao {
  id: string
  estado: EstadoDaEtapa
}

export const ETAPAS_DE_VALIDACAO: EtapaDeValidacao[] = [
  { id: 'responsividade', estado: 'FEITO' },
  { id: 'heuristicas', estado: 'PLANEJADO' },
  { id: 'teste', estado: 'PLANEJADO' },
  { id: 'metricas', estado: 'PLANEJADO' },
  { id: 'reteste', estado: 'PLANEJADO' },
]

export interface PassoTecnico {
  id: string
  codigo: string
}

export const PASSOS_TECNICOS: PassoTecnico[] = [
  {
    id: 'mensagem',
    codigo: `texto ou áudio  →  "acabei de gastar R$ 200 de gasolina"`,
  },
  {
    id: 'pedido',
    codigo: `POST https://api.openai.com/v1/chat/completions
{
  "model": "gpt-4.1-mini",
  "messages": [
    { "role": "system", "content": "{{basePrompt}} + {{contexto}} + {{arvore}}" },
    { "role": "user",   "content": "acabei de gastar R$ 200 de gasolina" }
  ],
  "tools": [ registrar_gasto, consultar_gastos, ... 13 ferramentas ],
  "tool_choice": "auto"
}`,
  },
  {
    id: 'escolha',
    codigo: `choices[0].message.tool_calls[0]
{
  "name": "registrar_gasto",
  "arguments": {
    "nome": "posto de gasolina",
    "valor": 200,
    "categoria": ["Carro", "Gasolina"]
  }
}`,
  },
  {
    id: 'ferramenta',
    codigo: `async executar(ctx, args) {
  const { data } = await ctx.cliente
    .from('expense')
    .insert({
      name:        texto(args.nome, 80),
      amount:      dinheiro(args.valor),
      currency:    moeda(args.moeda),
      category_id: await resolverCategoria(ctx, args),
      occurred_at: paraIso(args.ocorreu_em, ctx.fusoEmMinutos),
    })
    .select().single()

  ctx.recibos.push({ acao: 'criado', tipo: 'gasto', valor: 200, ... })
  return { ok: true, id: data.id, valor_em_reais: 200 }
}`,
  },
]

export interface TelaDoSistema {
  rota: string
  labelKey: string
  subtitleKey: string
}

export const TELAS: TelaDoSistema[] = [
  ...NAV_ITEMS.map(({ to, labelKey, subtitleKey }) => ({ rota: to, labelKey, subtitleKey })),
  {
    rota: '/account',
    labelKey: 'slides.telas.extras.account',
    subtitleKey: 'slides.telas.extras.accountSubtitle',
  },
  {
    rota: '/login',
    labelKey: 'slides.telas.extras.auth',
    subtitleKey: 'slides.telas.extras.authSubtitle',
  },
]
