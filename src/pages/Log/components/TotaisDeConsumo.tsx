import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, ArrowUpFromLine, Coins, MessagesSquare } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card } from '@/shared/components/ui/card'
import type { ConsumoDeIA } from '@/shared/data/model'
import { formatNumber } from '@/shared/i18n/format'
import { custoDeIA } from './custo'

export function TotaisDeConsumo({
  consumo,
  carregando,
}: {
  consumo: ConsumoDeIA | null
  carregando: boolean
}) {
  const { t } = useTranslation()

  const itens: { chave: string; icone: LucideIcon; valor: string; destaque?: boolean }[] = [
    {
      chave: 'cost',
      icone: Coins,
      valor: consumo ? custoDeIA(consumo.custoEmCentavosDeDolar, 'total') : '—',
      destaque: true,
    },
    {
      chave: 'messages',
      icone: MessagesSquare,
      valor: consumo ? formatNumber(consumo.mensagens) : '—',
    },
    {
      chave: 'tokensIn',
      icone: ArrowDownToLine,
      valor: consumo ? formatNumber(consumo.tokensEntrada) : '—',
    },
    {
      chave: 'tokensOut',
      icone: ArrowUpFromLine,
      valor: consumo ? formatNumber(consumo.tokensSaida) : '—',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {itens.map((item) => (
        <Card key={item.chave} className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <item.icone className="size-3.5 shrink-0" aria-hidden />
            {t(`log.totals.${item.chave}`)}
          </p>
          <p
            className={
              item.destaque
                ? 'mt-1.5 font-mono text-xl font-semibold text-foreground'
                : 'mt-1.5 font-mono text-lg font-medium text-foreground'
            }
          >
            {carregando ? '—' : item.valor}
          </p>
        </Card>
      ))}
    </div>
  )
}
