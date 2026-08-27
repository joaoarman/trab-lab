import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Mail } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Separator } from '@/shared/components/ui/separator'
import { ChangeEmailDialog } from './ChangeEmailDialog'
import { ChangePasswordDialog } from './ChangePasswordDialog'

export function SecurityCard({ email }: { email: string }) {
  const { t } = useTranslation()
  const [trocandoEmail, setTrocandoEmail] = useState(false)
  const [trocandoSenha, setTrocandoSenha] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.security.title')}</CardTitle>
        <CardDescription>{t('account.security.description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('auth.fields.email')}</p>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTrocandoEmail(true)}>
            {t('common.change')}
          </Button>
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('auth.fields.password')}</p>
              <p className="truncate text-sm text-muted-foreground">
                {t('account.security.passwordHint')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTrocandoSenha(true)}>
            {t('common.change')}
          </Button>
        </div>
      </CardContent>

      <ChangeEmailDialog
        aberto={trocandoEmail}
        onFechar={() => setTrocandoEmail(false)}
        emailAtual={email}
      />
      <ChangePasswordDialog
        aberto={trocandoSenha}
        onFechar={() => setTrocandoSenha(false)}
        email={email}
      />
    </Card>
  )
}
