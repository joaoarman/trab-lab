import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { Categoria } from '@/shared/data/model'
import { achatarArvore } from '@/shared/data/arvoreDeCategorias'

const TODAS = 'todas'
const SEM_CATEGORIA = 'sem'

export function SeletorDeCategoria({
  valor,
  onValor,
  categorias,
  comOpcaoTodas = false,
  desabilitado = false,
  id,
}: {
  valor: number | 'sem' | null
  onValor: (valor: number | 'sem' | null) => void
  categorias: Categoria[]
  comOpcaoTodas?: boolean
  desabilitado?: boolean
  id?: string
}) {
  const { t } = useTranslation()

  const achatadas = useMemo(() => achatarArvore(categorias), [categorias])

  return (
    <Select
      value={valor === null ? TODAS : String(valor)}
      onValueChange={(escolha) => {
        if (escolha === TODAS) onValor(null)
        else if (escolha === SEM_CATEGORIA) onValor('sem')
        else onValor(Number(escolha))
      }}
      disabled={desabilitado}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {comOpcaoTodas && <SelectItem value={TODAS}>{t('expenses.filters.allCategories')}</SelectItem>}

        <SelectItem value={SEM_CATEGORIA}>
          <span className="text-muted-foreground">{t('expenses.form.noCategory')}</span>
        </SelectItem>

        {achatadas.map(({ categoria, nivel }) => (
          <SelectItem key={categoria.id} value={String(categoria.id)}>
            <span className="flex items-center gap-2">
              <span style={{ width: `${nivel * 0.75}rem` }} aria-hidden />
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: categoria.cor }}
                aria-hidden
              />
              {categoria.nome}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
