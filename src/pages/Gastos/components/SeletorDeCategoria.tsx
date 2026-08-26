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

/**
 * O seletor de categoria — o mesmo componente no formulário e no filtro.
 *
 * São dois usos com uma diferença só: o filtro precisa da opção "todas", o
 * formulário não. Fazer dois componentes duplicaria o achatamento da árvore, o
 * recuo e a bolinha de cor para ganhar uma linha de `if`.
 *
 * ## A hierarquia vira recuo
 *
 * Um `<select>` de HTML não aninha opções em mais de um nível, então
 * `Carro › Gasolina` não pode aparecer *dentro* de `Carro`. A árvore é achatada
 * **na ordem de leitura** (mãe, depois as filhas dela, depois as netas) e a
 * profundidade vira espaço à esquerda — o mesmo recuo que a tela de Categorias
 * usa. A bolinha da cor escolhida pelo usuário completa o reconhecimento: em
 * lista longa, a cor é achada antes do nome.
 *
 * ## Só as categorias ativas aparecem
 *
 * `achatarArvore` já corta as desativadas. Uma categoria desativada saiu da
 * árvore de propósito, e oferecê-la aqui a traria de volta pela porta dos fundos
 * — a pessoa classificaria um gasto numa gaveta que ela mesma guardou.
 *
 * Um gasto ANTIGO que aponte para uma categoria desativada continua exibindo o
 * nome dela na lista: quem resolve o nome é a linha do extrato, a partir da lista
 * completa de categorias, e não este seletor.
 */

/** Os valores que não são um id de categoria. Radix não aceita `value=""`. */
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
  /** `null` = "todas" (só no filtro) · `'sem'` = sem categoria · número = o id. */
  valor: number | 'sem' | null
  onValor: (valor: number | 'sem' | null) => void
  /** A lista plana completa, como vem do banco. */
  categorias: Categoria[]
  /** Liga a opção "todas as categorias" — o filtro usa, o formulário não. */
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
              {/* O recuo é um vão de verdade, e não espaços no texto: assim ele
                  sobrevive ao truncamento do nome numa tela estreita. */}
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
