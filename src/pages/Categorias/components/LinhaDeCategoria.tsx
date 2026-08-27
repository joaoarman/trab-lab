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

export interface AcoesDaLinha {
  onNovaFilha: (mae: Categoria) => void
  onEditar: (categoria: Categoria) => void
  onRemover: (categoria: Categoria) => void
}

export function LinhaDeCategoria({
  no,
  fechadas,
  onAlternar,
  acoes,
}: {
  no: NoDeCategoria
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

  return temFilhas ? (
    <Collapsible asChild open={aberta} onOpenChange={() => onAlternar(no.id)}>
      <li>{corpo}</li>
    </Collapsible>
  ) : (
    <li>{corpo}</li>
  )
}
