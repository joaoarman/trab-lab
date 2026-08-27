import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { PasswordInput } from '@/shared/components/ui/password-input'
import { chaveDeErroDeAuth } from '@/shared/lib/authErrors'
import { AuthShell, ErroDoFormulario } from './components/AuthShell'
import { entrar } from './supabase'

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
