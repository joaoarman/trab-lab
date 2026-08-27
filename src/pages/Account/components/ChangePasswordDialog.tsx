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
import { Label } from '@/shared/components/ui/label'
import { PasswordInput } from '@/shared/components/ui/password-input'
import { PasswordRequirements, senhaValida } from '@/shared/components/PasswordRequirements'
import { toast } from '@/shared/components/ui/sonner'
import { useAuth } from '@/shared/context/AuthContext'
import { chaveDeErroDeAuth } from '@/shared/lib/authErrors'
import { conferirSenhaAtual, trocarSenha } from '../supabase'
import { EscolhaDeSessoes, type EscopoDeSaida } from './EscolhaDeSessoes'

export function ChangePasswordDialog({
  aberto,
  onFechar,
  email,
}: {
  aberto: boolean
  onFechar: () => void
  email: string
}) {
  const { t } = useTranslation()
  const { sairDaConta } = useAuth()

  const [etapa, setEtapa] = useState<'formulario' | 'sessoes'>('formulario')
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetir, setRepetir] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  function fecharELimpar() {
    onFechar()
    setTimeout(() => {
      setEtapa('formulario')
      setAtual('')
      setNova('')
      setRepetir('')
      setErro(null)
    }, 200)
  }

  const senhasDiferem = repetir.length > 0 && nova !== repetir
  const podeEnviar =
    atual.length > 0 && senhaValida(nova) && nova === repetir && !processando

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setProcessando(true)
    try {
      await conferirSenhaAtual(email, atual)
      await trocarSenha(nova)
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
      toast.success(t('account.password.changed'))
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
            titulo={t('account.password.changed')}
            onEscolher={aoEscolherSessoes}
            processando={processando}
          />
        ) : (
          <form onSubmit={aoEnviar} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('account.password.title')}</DialogTitle>
              <DialogDescription>{t('account.password.description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="senha-atual">{t('account.password.current')}</Label>
              <PasswordInput
                id="senha-atual"
                autoComplete="current-password"
                required
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha-nova">{t('account.password.new')}</Label>
              <PasswordInput
                id="senha-nova"
                autoComplete="new-password"
                required
                value={nova}
                onChange={(e) => setNova(e.target.value)}
              />
              <PasswordRequirements senha={nova} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha-repetir">{t('auth.fields.repeatPassword')}</Label>
              <PasswordInput
                id="senha-repetir"
                autoComplete="new-password"
                required
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
              />
              {senhasDiferem && (
                <p className="text-xs text-destructive">{t('auth.errors.senhasNaoConferem')}</p>
              )}
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
