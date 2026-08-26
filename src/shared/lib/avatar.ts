import { supabase } from '@/shared/lib/supabaseClient'
import type { Perfil } from '@/shared/data/model'

/**
 * O endereço da foto de perfil no Storage.
 *
 * ## Por que isto mora em `shared/lib` e não no `supabase.ts` do Account
 *
 * A foto é escrita num lugar só — a tela de conta — mas é **lida em toda tela**:
 * o menu do usuário a mostra no rodapé da sidebar e no header do celular. Se
 * estas funções ficassem no módulo Account, o shell (que é global) importaria da
 * pasta de um módulo, invertendo a dependência: `shared/` passaria a depender de
 * `pages/`, e mexer no módulo Account poderia quebrar o layout do sistema
 * inteiro.
 *
 * Aqui não há consulta ao banco — só a montagem do caminho e da URL pública. A
 * gravação (upload, remoção e o `update` da coluna `avatar_path`) continua no
 * `supabase.ts` do Account, que é o dono da escrita.
 */
export const BUCKET_DE_AVATAR = 'avatars'

/**
 * O caminho da foto: uma pasta por usuário, com **um arquivo de nome fixo**.
 *
 * O nome fixo é o que impede foto órfã. Se cada envio gerasse um nome novo, a
 * anterior continuaria ocupando o bucket para sempre, invisível — só o
 * `avatar_path` do perfil apontaria para a atual. Com um caminho só, trocar a
 * foto é sobrescrever (`upsert`), e o bucket nunca guarda mais de uma por pessoa.
 *
 * A pasta é o `auth_uuid`, e não o `id` do perfil, porque a policy do Storage a
 * compara com `auth.uid()` — e porque o bucket é de leitura pública: uma pasta
 * numerada (`1/`, `2/`, `3/`…) deixaria percorrer as fotos de todo mundo em
 * minutos, enquanto um uuid não se adivinha.
 */
export function caminhoDoAvatar(authUuid: string): string {
  return `${authUuid}/avatar.jpg`
}

/**
 * A URL pública da foto do perfil, ou null.
 *
 * O `?v=` é cache busting, e aqui ele é obrigatório: como o caminho é fixo, o
 * navegador (e o CDN) continuariam mostrando a foto ANTIGA depois de uma troca —
 * a URL não mudou. A "versão" é o `updated_at` do perfil, que muda exatamente
 * quando o perfil é gravado, isto é, quando a foto pode ter mudado.
 */
export function urlDoAvatar(perfil: Perfil): string | null {
  if (!perfil.avatarPath) return null
  const { data } = supabase.storage.from(BUCKET_DE_AVATAR).getPublicUrl(perfil.avatarPath)
  return `${data.publicUrl}?v=${Date.parse(perfil.atualizadoEm)}`
}
