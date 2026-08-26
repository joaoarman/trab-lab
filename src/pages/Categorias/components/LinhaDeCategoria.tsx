import { useTranslation } from 'react-i18next'
import { ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import type { Categoria, NoDeCategoria } from '@/shared/data/model'

/** O que a linha sabe fazer. Vem da página, que é quem abre as modais. */
export interface AcoesDaLinha {
  onNovaFilha: (mae: Categoria) => void
  onEditar: (categoria: Categoria) => void
  onRemover: (categoria: Categoria) => void
}

/**
 * Uma categoria na árvore — e, recursivamente, as filhas dela.
 *
 * ## A hierarquia se lê sem precisar decifrar
 *
 * Três coisas ao mesmo tempo dizem "isto está dentro daquilo": o recuo, a **linha
 * guia vertical** que desce da mãe ao longo das filhas, e a seta que só existe em
 * quem tem filhas. A guia é o que sustenta a leitura quando a árvore fica funda —
 * só o recuo, com quatro níveis na tela de um celular, vira uma coluna de textos
 * que não diz mais de quem cada um descende.
 *
 * ## Quem tem filha vira dropdown; quem não tem, não finge que vira
 *
 * A seta aparece **apenas** onde há o que fechar. Onde não há, o espaço dela é
 * reservado por um vão da mesma largura — sem isso os nomes de um mesmo nível
 * desalinhariam conforme tivessem ou não subcategorias, e o recuo deixaria de
 * significar profundidade.
 *
 * ## As ações ficam à vista
 *
 * Nada de aparecer só no hover: metade do uso deste sistema é no celular, onde
 * hover não existe. O que as mantém discretas é a cor (`muted-foreground` até
 * serem apontadas), não a ausência.
 *
 * A `+` fica solta, fora do menu, porque é a ação que a tela existe para
 * oferecer — criar uma subcategoria ali, naquele ponto da árvore, sem escolher a
 * mãe num formulário depois. Editar e excluir vão para o `⋯`: são menos
 * frequentes, e excluir num clique de distância seria um convite ao acidente.
 */
export function LinhaDeCategoria({
  no,
  fechadas,
  onAlternar,
  acoes,
}: {
  no: NoDeCategoria
  /** Os ids **fechados**. O padrão é toda categoria vir aberta. */
  fechadas: Set<number>
  onAlternar: (id: number) => void
  acoes: AcoesDaLinha
}) {
  const { t } = useTranslation()

  const temFilhas = no.filhas.length > 0
  const aberta = !fechadas.has(no.id)

  const corpo = (
    <>
      <div className="flex items-center gap-1.5 rounded-md py-0.5 pr-0.5 transition-colors hover:bg-accent">
        {temFilhas ? (
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={t(aberta ? 'categories.tree.collapse' : 'categories.tree.expand', {
                name: no.nome,
              })}
            >
              <ChevronRight
                className={cn('transition-transform duration-200', aberta && 'rotate-90')}
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
        ) : (
          <span className="size-7 shrink-0" aria-hidden />
        )}

        {/* A cor é dado do usuário, não token do tema — por isso vai num style.
            Ver a nota no topo de SeletorDeCor.tsx. */}
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: no.cor }}
          aria-hidden
        />

        <span className="min-w-0 flex-1 truncate py-1 text-sm">{no.nome}</span>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => acoes.onNovaFilha(no)}
          aria-label={t('categories.tree.addChild', { name: no.nome })}
        >
          <Plus aria-hidden />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t('categories.tree.actions', { name: no.nome })}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => acoes.onEditar(no)}>
              <Pencil aria-hidden />
              {t('categories.tree.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => acoes.onRemover(no)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 aria-hidden />
              {t('categories.tree.remove')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {temFilhas && (
        <CollapsibleContent>
          {/* `ml-3.5` alinha a guia com o centro da seta da mãe (size-7 = 28px,
              metade = 14px = 3.5rem/4). Mexeu no tamanho do botão, mexa aqui. */}
          <ul className="ml-3.5 border-l border-border pl-2">
            {no.filhas.map((filha) => (
              <LinhaDeCategoria
                key={filha.id}
                no={filha}
                fechadas={fechadas}
                onAlternar={onAlternar}
                acoes={acoes}
              />
            ))}
          </ul>
        </CollapsibleContent>
      )}
    </>
  )

  // Só quem tem filhas é um Collapsible. Envolver uma folha num dropdown vazio
  // custaria um nó a mais por linha e um `aria-expanded` que mentiria.
  return temFilhas ? (
    <Collapsible asChild open={aberta} onOpenChange={() => onAlternar(no.id)}>
      <li>{corpo}</li>
    </Collapsible>
  ) : (
    <li>{corpo}</li>
  )
}
