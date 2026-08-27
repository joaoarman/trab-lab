import { useTranslation } from 'react-i18next'

import { formatDate } from '@/shared/i18n/format'
import { dataLocal, deslocarData } from '@/shared/utils/datas'

export function SeparadorDeDia({ dia }: { dia: string }) {
  const { t } = useTranslation()

  const hoje = dataLocal()
  const rotulo =
    dia === hoje
      ? t('chat.day.today')
      : dia === deslocarData(hoje, -1)
        ? t('chat.day.yesterday')
        : formatDate(meiaNoiteLocal(dia), { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="pointer-events-none sticky top-1 z-10 flex justify-center">
      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
        {rotulo}
      </span>
    </div>
  )
}

function meiaNoiteLocal(dia: string): Date {
  const [ano, mes, data] = dia.split('-').map(Number)
  return new Date(ano, mes - 1, data)
}
