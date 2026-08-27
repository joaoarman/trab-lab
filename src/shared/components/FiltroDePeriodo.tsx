import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { RecorteDePeriodo } from '@/shared/data/model'
import { ATALHOS, periodoDe, type PeriodoEscolhido } from '@/shared/utils/datas'

export function FiltroDePeriodo({
  recorte,
  onRecorte,
  periodo,
  onPeriodo,
  desabilitado,
}: {
  recorte: RecorteDePeriodo
  onRecorte: (recorte: RecorteDePeriodo) => void
  periodo: PeriodoEscolhido
  onPeriodo: (periodo: PeriodoEscolhido) => void
  desabilitado: boolean
}) {
  const { t } = useTranslation()

  function trocarAtalho(escolha: string) {
    if (escolha === PERSONALIZADO) {
      onPeriodo(PERSONALIZADO)
      return
    }
    const atalho = escolha as (typeof ATALHOS)[number]
    onPeriodo(atalho)
    onRecorte({ ...recorte, ...periodoDe(atalho) })
  }

  function trocarData(campo: 'de' | 'ate', valor: string) {
    if (!valor) return
    onPeriodo(PERSONALIZADO)
    onRecorte({ ...recorte, [campo]: valor })
  }

  return (
    <>
      <CampoDeFiltro id="filtro-periodo" rotulo={t('period.label')}>
        <Select value={periodo} onValueChange={trocarAtalho} disabled={desabilitado}>
          <SelectTrigger id="filtro-periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATALHOS.map((atalho) => (
              <SelectItem key={atalho} value={atalho}>
                {t(`period.${atalho}`)}
              </SelectItem>
            ))}
            <SelectItem value={PERSONALIZADO}>{t('period.custom')}</SelectItem>
          </SelectContent>
        </Select>
      </CampoDeFiltro>

      <CampoDeFiltro id="filtro-de" rotulo={t('period.from')}>
        <Input
          id="filtro-de"
          type="date"
          value={recorte.de}
          max={recorte.ate}
          onChange={(evento) => trocarData('de', evento.target.value)}
          disabled={desabilitado}
        />
      </CampoDeFiltro>

      <CampoDeFiltro id="filtro-ate" rotulo={t('period.to')}>
        <Input
          id="filtro-ate"
          type="date"
          value={recorte.ate}
          min={recorte.de}
          onChange={(evento) => trocarData('ate', evento.target.value)}
          disabled={desabilitado}
        />
      </CampoDeFiltro>
    </>
  )
}

const PERSONALIZADO = 'personalizado'

export function CampoDeFiltro({
  id,
  rotulo,
  children,
}: {
  id: string
  rotulo: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      {children}
    </div>
  )
}
