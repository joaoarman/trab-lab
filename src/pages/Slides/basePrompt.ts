import {
  MAX_CATEGORIAS_NO_PROMPT,
  montarSystemPrompt,
  type CategoriaDoContexto,
} from '../../../supabase/functions/chat/prompts.ts'

const CATEGORIAS_DE_EXEMPLO: CategoriaDoContexto[] = [
  { id: 1, caminho: ['Casa'], ativa: true },
  { id: 2, caminho: ['Casa', 'Mercado'], ativa: true },
  { id: 3, caminho: ['Carro'], ativa: true },
  { id: 4, caminho: ['Carro', 'Gasolina'], ativa: true },
  { id: 5, caminho: ['Carro', 'Manutenção'], ativa: true },
  { id: 6, caminho: ['Assinaturas'], ativa: true },
  { id: 7, caminho: ['Assinaturas', 'IA'], ativa: true },
  { id: 8, caminho: ['Lazer', 'Cinema'], ativa: false },
]

const [base, contexto, arvore] = montarSystemPrompt({
  nome: 'João',
  hoje: '2026-08-27',
  agora: '17:41',
  diaDaSemana: 'quinta-feira',
  idioma: 'pt-BR',
  categorias: CATEGORIAS_DE_EXEMPLO,
}).split('\n\n---\n\n')

export const BASE_PROMPT_REAL = base

export const CONTEXTO_DA_CONVERSA = contexto

export const ARVORE_NO_PROMPT = arvore

export { MAX_CATEGORIAS_NO_PROMPT }
