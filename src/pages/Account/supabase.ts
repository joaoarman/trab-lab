import { supabase } from '@/shared/lib/supabaseClient'
import { BUCKET_DE_AVATAR, caminhoDoAvatar } from '@/shared/lib/avatar'
import type { Perfil } from '@/shared/data/model'

/**
 * Camada de dados do módulo **Account** — o que a pessoa faz com a própria conta
 * depois de entrar: editar o perfil, a foto, a senha e o e-mail.
 *
 * O que acontece na porta de entrada (entrar, cadastrar, sair, carregar o perfil
 * da sessão) mora em `src/pages/Auth/supabase.ts`.
 */

/** O que fazer com a foto ao salvar o perfil. */
export type AcaoDeAvatar =
  | { tipo: 'manter' }
  | { tipo: 'trocar'; arquivo: Blob }
  | { tipo: 'remover' }

/**
 * Grava o perfil: nome e foto, **numa ação só**.
 *
 * É um `salvar` único de propósito — a tela tem um botão "Salvar" e a foto é
 * staged como qualquer outro campo. Subir a imagem no momento em que ela é
 * escolhida faria o "Cancelar" mentir: a foto já estaria trocada.
 *
 * Ordem: primeiro o Storage, depois a tabela. Se o envio da imagem falhar, nada
 * foi gravado e a tela pode simplesmente mostrar o erro. Na ordem inversa, o
 * perfil apontaria para um arquivo que não existe.
 */
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

  // O `.eq('id', ...)` é exigência do safeupdate do PostgREST, que recusa UPDATE
  // sem filtro (erro 21000). Quem garante que a linha é do dono continua sendo a
  // RLS — o filtro não é a proteção, é a formalidade.
  const { error } = await supabase
    .from('profile')
    .update({ full_name: nome.trim(), avatar_path: avatarPath })
    .eq('id', perfil.id)

  if (error) throw error
}

/**
 * Confere a senha atual da pessoa.
 *
 * É o que impede o clássico "notebook aberto": sem isto, quem passasse pela mesa
 * trocaria a senha (ou o e-mail) de uma sessão já aberta sem saber credencial
 * nenhuma, e tomaria a conta.
 *
 * `signInWithPassword` é a única forma de validar a senha atual pelo cliente —
 * não existe um "confirmar senha" na API. Ela emite uma sessão nova para o
 * MESMO usuário, que substitui a atual neste navegador; é inofensivo, e tem até
 * um efeito bom: a sessão que segue viva depois de um "sair das outras" é a que
 * acabou de ser confirmada com a senha.
 */
export async function conferirSenhaAtual(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) throw error
}

/** Troca a senha. Só chamada depois de `conferirSenhaAtual`. */
export async function trocarSenha(novaSenha: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: novaSenha })
  if (error) throw error
}

/**
 * Se o e-mail está livre para esta conta.
 *
 * Chamada ANTES de aplicar a troca: se o endereço já é de outra conta, a tela
 * avisa em vez de deixar a pessoa bater num erro cru do servidor. A RPC devolve
 * só um booleano e não é exposta a quem não está logado — ver `supabase/schema/`.
 */
export async function emailDisponivel(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('email_available', { p_email: email.trim() })
  if (error) throw error
  return data === true
}

/**
 * Troca o e-mail de login.
 *
 * Com a confirmação de e-mail desligada no projeto, a troca vale na hora: não há
 * código para digitar nem endereço pendente. O preço é que o endereço novo nunca
 * é comprovado — está registrado como risco aceito no `PENDENCIAS.md`.
 *
 * O `profile.email` não é tocado aqui: quem o atualiza é o trigger
 * `on_auth_user_email_updated`, para a cópia nunca divergir da fonte da verdade.
 */
export async function trocarEmail(novoEmail: string): Promise<void> {
  const alvo = novoEmail.trim()
  const { data, error } = await supabase.auth.updateUser({ email: alvo })
  if (error) throw error

  /*
    Conferimos o resultado em vez de confiar nele.

    "Vale na hora" é consequência de `enable_confirmations = false` no
    `supabase/config.toml` — não é uma promessa da API. Se esse knob for religado
    (item 1 do PENDENCIAS.md), o GoTrue passa a guardar o endereço em
    `new_email` e a esperar um código, sem devolver erro nenhum. A tela então
    anunciaria "E-mail alterado" com um toast verde enquanto o login continuaria
    sendo o antigo — a pior espécie de bug, porque parece que funcionou.

    Falhando aqui, quem for religar a confirmação descobre no primeiro teste, e
    não por uma reclamação de que "o e-mail não mudou".
  */
  if (data.user?.email?.toLowerCase() !== alvo.toLowerCase()) {
    throw new Error('email_change_pending')
  }
}
