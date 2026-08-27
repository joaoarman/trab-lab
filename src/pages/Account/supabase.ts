import { supabase } from '@/shared/lib/supabaseClient'
import { BUCKET_DE_AVATAR, caminhoDoAvatar } from '@/shared/lib/avatar'
import type { Perfil } from '@/shared/data/model'

export type AcaoDeAvatar =
  | { tipo: 'manter' }
  | { tipo: 'trocar'; arquivo: Blob }
  | { tipo: 'remover' }

export async function salvarPerfil(
  perfil: Perfil,
  nome: string,
  avatar: AcaoDeAvatar,
): Promise<void> {
  let avatarPath = perfil.avatarPath

  if (avatar.tipo === 'trocar') {
    const caminho = caminhoDoAvatar(perfil.authUuid)
    const { error } = await supabase.storage
      .from(BUCKET_DE_AVATAR)
      .upload(caminho, avatar.arquivo, { upsert: true, contentType: 'image/jpeg' })
    if (error) throw error
    avatarPath = caminho
  }

  if (avatar.tipo === 'remover' && perfil.avatarPath) {
    const { error } = await supabase.storage.from(BUCKET_DE_AVATAR).remove([perfil.avatarPath])
    if (error) throw error
    avatarPath = null
  }

  const { error } = await supabase
    .from('profile')
    .update({ full_name: nome.trim(), avatar_path: avatarPath })
    .eq('id', perfil.id)

  if (error) throw error
}

export async function conferirSenhaAtual(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) throw error
}

export async function trocarSenha(novaSenha: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: novaSenha })
  if (error) throw error
}

export async function emailDisponivel(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('email_available', { p_email: email.trim() })
  if (error) throw error
  return data === true
}

export async function trocarEmail(novoEmail: string): Promise<void> {
  const alvo = novoEmail.trim()
  const { data, error } = await supabase.auth.updateUser({ email: alvo })
  if (error) throw error

  if (data.user?.email?.toLowerCase() !== alvo.toLowerCase()) {
    throw new Error('email_change_pending')
  }
}
