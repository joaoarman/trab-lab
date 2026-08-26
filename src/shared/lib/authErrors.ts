import type { AuthError } from '@supabase/supabase-js'

/**
 * Tradução dos erros do Supabase Auth para um vocabulário do app.
 *
 * Mora em `shared/lib` (infra/integração) porque os dois módulos de auth
 * precisam dela: o **Auth** (login e cadastro) e o **Account** (trocar senha e
 * e-mail, onde a senha atual é revalidada). Deixá-la num dos dois obrigaria o
 * outro a importar da pasta do vizinho.
 *
 * Por que traduzir em vez de mostrar `error.message`: as mensagens do GoTrue vêm
 * **em inglês e fixas** — mostrá-las cruas fura o i18n do projeto e ainda entrega
 * ao usuário um texto de servidor. Aqui a mensagem vira um código, e o código
 * vira uma chave de tradução (`auth.errors.<codigo>`) que existe nos dois idiomas.
 *
 * O `code` só passou a vir preenchido em versões mais novas do GoTrue, então a
 * checagem por texto continua como segunda via — sem ela, uma instância mais
 * antiga cairia toda em "erro desconhecido".
 */
export type CodigoDeErroDeAuth =
  | 'emailEmUso'
  | 'credenciaisInvalidas'
  | 'senhaFraca'
  | 'senhaIgualAAtual'
  | 'emailInvalido'
  | 'muitasTentativas'
  | 'emailAguardandoConfirmacao'
  | 'semConexao'
  | 'desconhecido'

export function mapearErroDeAuth(erro: unknown): CodigoDeErroDeAuth {
  if (!erro) return 'desconhecido'

  const auth = erro as Partial<AuthError> & { code?: string; status?: number }
  const codigo = auth.code ?? ''
  const mensagem = (auth.message ?? '').toLowerCase()

  if (codigo === 'user_already_exists' || codigo === 'email_exists') return 'emailEmUso'
  if (mensagem.includes('already registered') || mensagem.includes('already been registered')) {
    return 'emailEmUso'
  }

  if (codigo === 'invalid_credentials') return 'credenciaisInvalidas'
  if (mensagem.includes('invalid login credentials')) return 'credenciaisInvalidas'

  if (codigo === 'weak_password') return 'senhaFraca'
  if (mensagem.includes('password should') || mensagem.includes('password must')) return 'senhaFraca'

  if (codigo === 'same_password') return 'senhaIgualAAtual'
  if (mensagem.includes('should be different from the old password')) return 'senhaIgualAAtual'

  if (codigo === 'email_address_invalid' || codigo === 'validation_failed') return 'emailInvalido'

  // 429 é o rate limit de `[auth.rate_limit]` — sem CAPTCHA, é ele que segura o
  // força-bruta, então o usuário precisa entender que foi um limite e não um erro.
  if (codigo === 'over_request_rate_limit' || auth.status === 429) return 'muitasTentativas'

  // Lançado pelo próprio app (Account/supabase.ts) quando a troca de e-mail sai
  // pendente em vez de valer na hora — sinal de que a confirmação foi religada.
  if (mensagem === 'email_change_pending') return 'emailAguardandoConfirmacao'

  if (mensagem.includes('failed to fetch') || mensagem.includes('network')) return 'semConexao'

  return 'desconhecido'
}

/** A chave de i18n correspondente. Existe nos dois idiomas, em `auth.errors`. */
export function chaveDeErroDeAuth(erro: unknown): string {
  return `auth.errors.${mapearErroDeAuth(erro)}`
}
