import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { PasswordInput } from '@/shared/components/ui/password-input'
import { chaveDeErroDeAuth } from '@/shared/lib/authErrors'
import { AuthShell, ErroDoFormulario } from './components/AuthShell'
import { ROTA_DE_CADASTRO } from './components/RotaProtegida'
import { entrar } from './supabase'

/**
 * Entrar — `/login`.
 *
 * A tela não navega para lugar nenhum quando dá certo: ela só cria a sessão. Quem
 * redireciona é a `RotaPublica` (ver `components/RotaProtegida.tsx`), que reage à
 * mudança de sessão e sabe se a pessoa veio de alguma rota específica.
 *
 * O `isLoading` não é desligado no sucesso, de propósito: entre criar a sessão e
 * a guarda trocar a tela existe um intervalo, e devolver o botão ao normal ali
 * daria a impressão de que nada aconteceu — tempo suficiente para alguém clicar
 * de novo.
 */
export function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(email, senha)
    } catch (falha) {
      setErro(t(chaveDeErroDeAuth(falha)))
      setEnviando(false)
    }
  }

  return (
    <AuthShell
      titulo={t('auth.login.title')}
      descricao={t('auth.login.subtitle')}
      rodape={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link to={ROTA_DE_CADASTRO} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('auth.login.goToSignup')}
          </Link>
        </>
      }
    >
      <form onSubmit={aoEnviar} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.fields.email')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.fields.emailPlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha">{t('auth.fields.password')}</Label>
          <PasswordInput
            id="senha"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        <ErroDoFormulario mensagem={erro} />

        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthShell>
  )
}
