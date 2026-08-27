import { useTranslation } from 'react-i18next'
import { Pipette } from 'lucide-react'

import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/lib/utils'

const PALETA = [
  '#10b981', // esmeralda
  '#14b8a6', // teal
  '#0ea5e9', // céu
  '#6366f1', // índigo
  '#8b5cf6', // violeta
  '#ec4899', // rosa
  '#f43f5e', // framboesa
  '#ef4444', // vermelho
  '#f97316', // laranja
  '#f59e0b', // âmbar
  '#84cc16', // lima
  '#64748b', // ardósia
] as const

export function corSugerida(quantasJaExistem: number): string {
  return PALETA[quantasJaExistem % PALETA.length]
}

export function SeletorDeCor({
  valor,
  onValor,
  desabilitado,
}: {
  valor: string
  onValor: (cor: string) => void
  desabilitado?: boolean
}) {
  const { t } = useTranslation()
  const ehDaPaleta = (PALETA as readonly string[]).includes(valor)

  return (
    <div className="space-y-2">
      <Label>{t('categories.color.label')}</Label>

      <div className="flex flex-wrap items-center gap-2">
        {PALETA.map((cor) => (
          <button
            key={cor}
            type="button"
            disabled={desabilitado}
            onClick={() => onValor(cor)}
            aria-label={t('categories.color.pick', { hex: cor })}
            aria-pressed={valor === cor}
            className={cn(
              'size-7 rounded-full ring-offset-background transition-transform',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              valor === cor
                ? 'ring-2 ring-ring ring-offset-2'
                : 'hover:scale-110 enabled:cursor-pointer',
            )}
            style={{ backgroundColor: cor }}
          />
        ))}

        <span
          className={cn(
            'relative grid size-7 place-items-center rounded-full border border-dashed border-input',
            'ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            desabilitado && 'cursor-not-allowed opacity-50',
            ehDaPaleta ? 'text-muted-foreground' : 'border-solid ring-2 ring-ring ring-offset-2',
          )}
          style={ehDaPaleta ? undefined : { backgroundColor: valor }}
        >
          {ehDaPaleta && <Pipette className="size-3.5" aria-hidden />}
          <input
            type="color"
            value={valor}
            disabled={desabilitado}
            onChange={(evento) => onValor(evento.target.value)}
            aria-label={t('categories.color.customLabel')}
            title={t('categories.color.custom')}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
      </div>
    </div>
  )
}
