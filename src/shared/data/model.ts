export interface Perfil {
  id: number
  authUuid: string
  nome: string
  email: string
  avatarPath: string | null
  desativadoEm: string | null
  atualizadoEm: string
}

export interface Categoria {
  id: number
  paiId: number | null
  nome: string
  cor: string
  ativa: boolean
  criadaEm: string
}

export interface NoDeCategoria extends Categoria {
  filhas: NoDeCategoria[]
}

export interface ImpactoDeExclusao {
  descendentes: number
  registros: number
  acao: AcaoDeRemocao
}

export type AcaoDeRemocao = 'excluir' | 'desativar'

export type Moeda = 'BRL' | 'USD'

export interface Gasto {
  id: number
  categoriaId: number | null
  nome: string
  valor: number
  moeda: Moeda
  cotacao: number | null
  valorEmBrl: number
  ocorreuEm: string
  ativo: boolean
  criadoEm: string
}

export interface RascunhoDeGasto {
  nome: string
  valor: number
  moeda: Moeda
  cotacao: number | null
  categoriaId: number | null
  ocorreuEm: string
}

export interface RecorteDePeriodo {
  de: string
  ate: string
}

export interface FiltroDeGastos extends RecorteDePeriodo {
  categoriaId: number | 'sem' | null
}

export interface Receita {
  id: number
  nome: string
  valor: number
  moeda: Moeda
  cotacao: number | null
  valorEmBrl: number
  recebidaEm: string
  registradaEm: string
  ativa: boolean
}

export interface RascunhoDeReceita {
  nome: string
  valor: number
  moeda: Moeda
  cotacao: number | null
  recebidaEm: string
}

export type FiltroDeReceitas = RecorteDePeriodo

export type TipoDeLancamento = 'GASTO' | 'RECEITA'

export interface Lancamento {
  tipo: TipoDeLancamento
  id: number
  nome: string
  valor: number
  moeda: Moeda
  cotacao: number | null
  valorEmBrl: number
  aconteceuEm: string
  categoriaId: number | null
}

export interface FiltroDaFatura extends RecorteDePeriodo {
  tipo: TipoDeLancamento | null
}

export type PapelNaConversa = 'USER' | 'ASSISTANT'

export type OrigemDaMensagem = 'TEXT' | 'AUDIO'

export type TipoDeResposta = 'MESSAGE' | 'REFUSAL'

export type AcaoDoRecibo = 'criado' | 'editado' | 'excluido' | 'desativado'

export type TipoDoRecibo = 'gasto' | 'receita' | 'categoria'

export interface ReciboDeRegistro {
  acao: AcaoDoRecibo
  tipo: TipoDoRecibo
  id: number
  nome: string
  valor?: number
  moeda?: Moeda
  cotacao?: number | null
  valorEmBrl?: number
  categoria?: string[] | null
  cor?: string
  categoriaCriada?: boolean
  aconteceuEm?: string
  criadoEm: string
}

export interface FerramentaExecutada {
  nome: string
  argumentos: unknown
  ok: boolean
  erro?: string
}

export interface MensagemDaIA {
  id: number
  papel: PapelNaConversa
  conteudo: string
  origem: OrigemDaMensagem
  tipo: TipoDeResposta
  recibos: ReciboDeRegistro[]
  ferramentas: FerramentaExecutada[]
  modelo: string | null
  tokensEntrada: number | null
  tokensEntradaCacheados: number | null
  tokensSaida: number | null
  custoEmCentavosDeDolar: number | null
  naConversa: boolean
  criadaEm: string
}

export interface ConsumoDeIA {
  mensagens: number
  custoEmCentavosDeDolar: number
  tokensEntrada: number
  tokensSaida: number
}
