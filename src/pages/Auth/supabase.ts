import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/shared/lib/supabaseClient'
import type { Perfil } from '@/shared/data/model'

/**
 * Camada de dados do módulo **Auth** — entrar, cadastrar, sair e carregar o
 * perfil da sessão.
 *
 * O que é do dia a dia da CONTA já logada (trocar senha, trocar e-mail, editar
 * o perfil, foto) mora em `src/pages/Account/supabase.ts`. A divisão é a mesma
 * das telas: aqui é o que acontece na porta de entrada; lá, o que acontece
 * depois de entrar.
 */

/** A linha crua de `public.profile`, como o Supabase a devolve (snake_case). */
interface LinhaDePerfil {
  id: number
  auth_uuid: string
  full_name: string
  email: string
  avatar_path: string | null
  deleted_at: string | null
  updated_at: string
}

const COLUNAS_DO_PERFIL = 'id, auth_uuid, full_name, email, avatar_path, deleted_at, updated_at'

/** Traduz a linha do banco para o vocabulário do app. */
function paraPerfil(linha: LinhaDePerfil): Perfil {
  return {
    id: linha.id,
    authUuid: linha.auth_uuid,
    nome: linha.full_name,
    email: linha.email,
    avatarPath: linha.avatar_path,
    desativadoEm: linha.deleted_at,
    atualizadoEm: linha.updated_at,
  }
}

/**
 * Cria a conta.
 *
 * O nome vai em `options.data` → `raw_user_meta_data`, que é de onde o trigger
 * `handle_new_user` o lê para criar o perfil. Não há um `insert` no perfil aqui:
 * a tabela nem tem policy de INSERT, de propósito — perfil é criado pelo banco.
 *
 * Com a confirmação de e-mail desligada, a conta já nasce confirmada e a sessão
 * volta pronta nesta mesma chamada; não há tela de "confirme seu e-mail".
 *
 * "E-mail já cadastrado" chega como erro do próprio `signUp`
 * (`user_already_exists`) e é traduzido em `shared/lib/authErrors.ts`. É de
 * propósito que não exista uma checagem prévia: uma consulta pública de "esse
 * e-mail tem conta?" seria um endereço aberto para descobrir quem usa o sistema.
 */
export async function cadastrar(nome: string, email: string, senha: string): Promise<Session> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { data: { full_name: nome.trim() } },
  })
  if (error) throw error
  if (!data.session) throw new Error('signup_sem_sessao')
  return data.session
}

/** Entra com e-mail e senha. */
export async function entrar(email: string, senha: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  })
  if (error) throw error
  return data.session
}

/**
 * Sai.
 *
 * `escopo`:
 * - `local` — só este navegador (o padrão do botão Sair);
 * - `global` — todas as sessões, em todo aparelho;
 * - `others` — todas menos esta.
 *
 * Os dois últimos são usados ao fim da troca de senha e da troca de e-mail.
 */
export async function sair(escopo: 'local' | 'global' | 'others' = 'local'): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: escopo })
  // `session_not_found` significa que a sessão já morreu no servidor — que é
  // exatamente onde queríamos chegar. Tratar como erro deixaria o usuário preso
  // numa tela de erro ao sair.
  if (error && !`${error.message}`.toLowerCase().includes('session')) throw error
}

/**
 * O perfil do usuário logado.
 *
 * Sem filtro por dono na query — a RLS já limita a linha ao dono, e escrever o
 * filtro aqui daria a falsa impressão de que é o front que protege o dado.
 *
 * Devolve `null` quando a conta existe mas o perfil não. É raro (o trigger o
 * cria no cadastro), mas possível: o trigger engole exceções para não derrubar o
 * cadastro. Quem trata é o `AuthContext`, chamando `garantirPerfil()`.
 */
export async function buscarPerfil(): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('profile')
    .select(COLUNAS_DO_PERFIL)
    .maybeSingle<LinhaDePerfil>()

  if (error) throw error
  return data ? paraPerfil(data) : null
}

/**
 * Cria o perfil que faltou e devolve o perfil pronto.
 *
 * A RPC `ensure_profile` é idempotente e roda como dona da tabela — o cliente
 * não teria como inserir sozinho (não há policy de INSERT).
 */
export async function garantirPerfil(): Promise<Perfil | null> {
  const { error } = await supabase.rpc('ensure_profile')
  if (error) throw error
  return buscarPerfil()
}
