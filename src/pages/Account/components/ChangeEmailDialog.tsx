import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { PasswordInput } from '@/shared/components/ui/password-input'
import { toast } from '@/shared/components/ui/sonner'
import { useAuth } from '@/shared/context/AuthContext'
import { chaveDeErroDeAuth } from '@/shared/lib/authErrors'
import { conferirSenhaAtual, emailDisponivel, trocarEmail } from '../supabase'
import { EscolhaDeSessoes, type EscopoDeSaida } from './EscolhaDeSessoes'

/**
 * Trocar o e-mail de login.
 *
 * ## A senha atual é exigida — e o motivo não é simetria
 *
 * Trocar o e-mail é o caminho mais curto para **tomar uma conta**. Quem sentasse
 * num computador com a sessão aberta poria o próprio endereço aqui e, num sistema
 * com recuperação de senha, receberia o link de redefinição no próprio inbox: a
 * conta muda de dono sem que a senha jamais tenha sido descoberta. Pedir a senha
 * atual fecha isso.
 *
 * ## A ordem: disponibilidade primeiro, senha depois
 *
 * O e-mail é conferido ANTES de olhar a senha. Assim, se o endereço já é de outra
 * conta, a pessoa descobre isso de imediato — e não depois de errar a senha e
 * ficar sem saber qual dos dois campos era o problema.
 *
 * ## Sem código de confirmação
 *
 * A confirmação de e-mail está desligada neste projeto, então a troca vale na
 * hora: não há código para digitar nem endereço pendente. O preço — o endereço
 * novo nunca é comprovado — está registrado como risco aceito no
 * `PENDENCIAS.md`.
 */
export function ChangeEmailDialog({
  aberto,
  onFechar,
  emailAtual,
}: {
  aberto: boolean
  onFechar: () => void
  emailAtual: string
}) {
  const { t } = useTranslation()
  const { sairDaConta, recarregarPerfil } = useAuth()

  const [etapa, setEtapa] = useState<'formulario' | 'sessoes'>('formulario')
  const [novoEmail, setNovoEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  function fecharELimpar() {
    onFechar()
    setTimeout(() => {
      setEtapa('formulario')
      setNovoEmail('')
      setSenha('')
      setErro(null)
    }, 200)
  }

  const ehOMesmo = novoEmail.trim().toLowerCase() === emailAtual.toLowerCase()
  const podeEnviar = novoEmail.trim().length > 0 && senha.length > 0 && !ehOMesmo && !processando

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setProcessando(true)
    try {
      if (!(await emailDisponivel(novoEmail))) {
        setErro(t('auth.errors.emailEmUso'))
        return
      }
      await conferirSenhaAtual(emailAtual, senha)
      await trocarEmail(novoEmail)
      // O `profile.email` é atualizado pelo trigger do banco, não por aqui —
      // reler é o que traz a cópia nova para a tela.
      await recarregarPerfil()
      setEtapa('sessoes')
    } catch (falha) {
      setErro(t(chaveDeErroDeAuth(falha)))
    } finally {
      setProcessando(false)
    }
  }

  async function aoEscolherSessoes(escopo: EscopoDeSaida) {
    setProcessando(true)
    try {
      if (escopo !== 'nenhuma') await sairDaConta(escopo)
      toast.success(t('account.email.changed'))
      fecharELimpar()
    } catch {
      toast.error(t('account.sessions.failed'))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(estaAberto) => {
        if (!estaAberto && etapa === 'formulario' && !processando) fecharELimpar()
      }}
    >
      <DialogContent className="sm:max-w-md">
        {etapa === 'sessoes' ? (
          <EscolhaDeSessoes
            titulo={t('account.email.changed')}
            onEscolher={aoEscolherSessoes}
            processando={processando}
          />
        ) : (
          <form onSubmit={aoEnviar} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('account.email.title')}</DialogTitle>
              <DialogDescription>
                {t('account.email.description', { email: emailAtual })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="novo-email">{t('account.email.new')}</Label>
              <Input
                id="novo-email"
                type="email"
                autoComplete="email"
                required
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                placeholder={t('auth.fields.emailPlaceholder')}
              />
              {ehOMesmo && novoEmail.trim().length > 0 && (
                <p className="text-xs text-muted-foreground">{t('account.email.sameAsCurrent')}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-senha">{t('account.password.current')}</Label>
              <PasswordInput
                id="email-senha"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('account.email.whyPassword')}</p>
            </div>

            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={fecharELimpar} disabled={processando}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!podeEnviar}>
                {processando && <Loader2 className="animate-spin" aria-hidden />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
