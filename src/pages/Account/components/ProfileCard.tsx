import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Separator } from '@/shared/components/ui/separator'
import { toast } from '@/shared/components/ui/sonner'
import { useAuth } from '@/shared/context/AuthContext'
import { urlDoAvatar } from '@/shared/lib/avatar'
import type { Perfil } from '@/shared/data/model'
import { AvatarField } from './AvatarField'
import { salvarPerfil, type AcaoDeAvatar } from '../supabase'

const SEM_MUDANCA_NO_AVATAR: AcaoDeAvatar = { tipo: 'manter' }

export function ProfileCard({ perfil }: { perfil: Perfil }) {
  const { t } = useTranslation()
  const { recarregarPerfil } = useAuth()

  const [nome, setNome] = useState(perfil.nome)
  const [avatar, setAvatar] = useState<AcaoDeAvatar>(SEM_MUDANCA_NO_AVATAR)
  const [salvando, setSalvando] = useState(false)

  const nomeMudou = nome.trim() !== perfil.nome
  const temMudanca = nomeMudou || avatar.tipo !== 'manter'
  const nomeVazio = nome.trim().length === 0

  function descartar() {
    setNome(perfil.nome)
    setAvatar(SEM_MUDANCA_NO_AVATAR)
  }

  async function aoSalvar(evento: FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    try {
      await salvarPerfil(perfil, nome, avatar)
      await recarregarPerfil()
      setAvatar(SEM_MUDANCA_NO_AVATAR)
      toast.success(t('account.profile.saved'))
    } catch {
      toast.error(t('account.profile.saveFailed'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.profile.title')}</CardTitle>
        <CardDescription>{t('account.profile.description')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={aoSalvar} className="space-y-6">
          <AvatarField
            urlAtual={urlDoAvatar(perfil)}
            nome={perfil.nome || perfil.email}
            acao={avatar}
            onAcao={setAvatar}
            desabilitado={salvando}
          />

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="nome">{t('auth.fields.name')}</Label>
            <Input
              id="nome"
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={salvando}
              className="max-w-sm"
            />
          </div>

          {temMudanca && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden />
              {t('account.profile.unsaved')}
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!temMudanca || nomeVazio || salvando}>
              {salvando && <Loader2 className="animate-spin" aria-hidden />}
              {t('common.save')}
            </Button>
            {temMudanca && (
              <Button type="button" variant="ghost" onClick={descartar} disabled={salvando}>
                {t('common.discard')}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
