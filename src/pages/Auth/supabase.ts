import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/shared/lib/supabaseClient'
import type { Perfil } from '@/shared/data/model'

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

export async function entrar(email: string, senha: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  })
  if (error) throw error
  return data.session
}

export async function sair(escopo: 'local' | 'global' | 'others' = 'local'): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: escopo })
  if (error && !`${error.message}`.toLowerCase().includes('session')) throw error
}

export async function buscarPerfil(): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('profile')
    .select(COLUNAS_DO_PERFIL)
    .maybeSingle<LinhaDePerfil>()

  if (error) throw error
  return data ? paraPerfil(data) : null
}

export async function garantirPerfil(): Promise<Perfil | null> {
  const { error } = await supabase.rpc('ensure_profile')
  if (error) throw error
  return buscarPerfil()
}
