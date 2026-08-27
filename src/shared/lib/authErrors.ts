import type { AuthError } from '@supabase/supabase-js'

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

  if (codigo === 'over_request_rate_limit' || auth.status === 429) return 'muitasTentativas'

  if (mensagem === 'email_change_pending') return 'emailAguardandoConfirmacao'

  if (mensagem.includes('failed to fetch') || mensagem.includes('network')) return 'semConexao'

  return 'desconhecido'
}

export function chaveDeErroDeAuth(erro: unknown): string {
  return `auth.errors.${mapearErroDeAuth(erro)}`
}
