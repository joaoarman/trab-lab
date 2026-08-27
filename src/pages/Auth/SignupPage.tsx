import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { PasswordInput } from '@/shared/components/ui/password-input'
import { PasswordRequirements, senhaValida } from '@/shared/components/PasswordRequirements'
import { chaveDeErroDeAuth } from '@/shared/lib/authErrors'
import { AuthShell, ErroDoFormulario } from './components/AuthShell'
import { ROTA_DE_LOGIN } from './components/RotaProtegida'
import { cadastrar } from './supabase'

export function SignupPage() {
  const { t } = useTranslation()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [repetirSenha, setRepetirSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const senhasDiferem = repetirSenha.length > 0 && senha !== repetirSenha
  const podeEnviar =
    nome.trim().length > 0 &&
    email.trim().length > 0 &&
    senhaValida(senha) &&
    senha === repetirSenha &&
    !enviando

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await cadastrar(nome, email, senha)
    } catch (falha) {
      setErro(t(chaveDeErroDeAuth(falha)))
      setEnviando(false)
    }
  }

  return (
    <AuthShell
      titulo={t('auth.signup.title')}
      descricao={t('auth.signup.subtitle')}
      rodape={
        <>
          {t('auth.signup.hasAccount')}{' '}
          <Link to={ROTA_DE_LOGIN} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('auth.signup.goToLogin')}
          </Link>
        </>
      }
    >
      <form onSubmit={aoEnviar} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nome">{t('auth.fields.name')}</Label>
          <Input
            id="nome"
            autoComplete="name"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t('auth.fields.namePlaceholder')}
          />
        </div>

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
            autoComplete="new-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <PasswordRequirements senha={senha} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="repetir">{t('auth.fields.repeatPassword')}</Label>
          <PasswordInput
            id="repetir"
            autoComplete="new-password"
            required
            value={repetirSenha}
            onChange={(e) => setRepetirSenha(e.target.value)}
          />
          {senhasDiferem && (
            <p className="text-xs text-destructive">{t('auth.errors.senhasNaoConferem')}</p>
          )}
        </div>

        <ErroDoFormulario mensagem={erro} />

        <Button type="submit" className="w-full" disabled={!podeEnviar}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          {t('auth.signup.submit')}
        </Button>
      </form>
    </AuthShell>
  )
}
