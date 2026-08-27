import { supabase } from '@/shared/lib/supabaseClient'
import type { Perfil } from '@/shared/data/model'

export const BUCKET_DE_AVATAR = 'avatars'

export function caminhoDoAvatar(authUuid: string): string {
  return `${authUuid}/avatar.jpg`
}

export function urlDoAvatar(perfil: Perfil): string | null {
  if (!perfil.avatarPath) return null
  const { data } = supabase.storage.from(BUCKET_DE_AVATAR).getPublicUrl(perfil.avatarPath)
  return `${data.publicUrl}?v=${Date.parse(perfil.atualizadoEm)}`
}
