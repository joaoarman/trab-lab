import { useTranslation } from 'react-i18next'
import { Circle, Construction } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'

/**
 * O corpo das telas cujo módulo ainda não foi implementado.
 *
 * Existe para que os placeholders não sejam cinco cópias do mesmo JSX — quando o
 * desenho de "ainda não pronto" mudar, muda aqui. Cada página passa só a lista
 * do que falta, em chaves de i18n, e some deste arquivo assim que o módulo real
 * entrar no lugar.
 *
 * Deriva dos primitivos da UI do projeto (`Card`), como toda tela do sistema.
 */
export function ModulePlaceholder({ stepKeys }: { stepKeys: string[] }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-muted text-primary-muted-foreground">
            <Construction className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle className="font-display">{t('placeholder.title')}</CardTitle>
            <CardDescription className="mt-1.5">{t('placeholder.description')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <h2 className="text-sm font-medium">{t('placeholder.nextSteps')}</h2>
        <ul className="mt-3 space-y-2.5">
          {stepKeys.map((chave) => (
            <li key={chave} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Circle className="mt-1 size-3 shrink-0 text-primary" aria-hidden />
              {t(chave)}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
