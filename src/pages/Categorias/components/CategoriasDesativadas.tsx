import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, ChevronRight, Loader2, RotateCcw } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import { toast } from '@/shared/components/ui/sonner'
import { cn } from '@/shared/lib/utils'
import type { Categoria, NoDeCategoria } from '@/shared/data/model'
import { caminhoAte, tamanhoDaSubarvore } from '../arvore'
import { chaveDeErroDeCategoria, reativarCategoria } from '../supabase'

const SEPARADOR = ' › '

/**
 * O submenu "Desativadas": onde ficam as categorias que não puderam ser
 * excluídas.
 *
 * ## Por que existe
 *
 * Uma categoria com subcategorias (ou, no futuro, com lançamentos) não é
 * apagada — some da árvore e vem para cá. Sem este bloco, ela sumiria da tela e
 * pronto: a pessoa não teria como saber que ainda existe, nem como trazê-la de
 * volta, e o botão "Excluir" pareceria ter apagado algo que na verdade continua
 * no banco somando nos totais do histórico.
 *
 * ## Por que vem fechado
 *
 * É arquivo, não é a tela. A árvore principal é o que se olha todo dia; aqui só
 * se entra para desfazer algo. O que fica visível de fora é a contagem — o
 * suficiente para lembrar que existe.
 *
 * ## Por que a única ação é "Reativar"
 *
 * Excluir daqui não faria nada: uma categoria só chega a este bloco **por ter
 * algo vinculado**, e é exatamente essa condição que impede a exclusão. O botão
 * existiria para, ao ser clicado, desativar de novo o que já está desativado.
 *
 * Quem quiser mesmo se livrar de uma árvore inteira tem um caminho coerente:
 * reativar, excluir as folhas (que não têm nada pendurado e por isso somem de
 * vez) e então excluir a mãe, agora vazia.
 *
 * ## O que cada linha mostra
 *
 * As descendentes não são desenhadas uma a uma: elas saíram e voltam **em
 * bloco**, então o que importa é quantas são. Já o caminho da mãe (`Em Casa ›
 * Mercado`) é indispensável — fora da árvore, "Feira" sozinho não diz de qual
 * Mercado se trata.
 */
export function CategoriasDesativadas({
  desativadas,
  categorias,
  onReativado,
}: {
  /** Os **topos** de cada região desativada, com a subárvore pendurada. */
  desativadas: NoDeCategoria[]
  categorias: Categoria[]
  onReativado: () => void
}) {
  const { t } = useTranslation()

  const [aberta, setAberta] = useState(false)
  const [reativando, setReativando] = useState<number | null>(null)

  const total = desativadas.reduce((soma, no) => soma + tamanhoDaSubarvore(no), 0)

  async function aoReativar(no: NoDeCategoria) {
    setReativando(no.id)
    try {
      await reativarCategoria(no.id)
      toast.success(t('categories.inactive.reactivated'))
      onReativado()
    } catch (falha) {
      toast.error(t(chaveDeErroDeCategoria(falha)))
    } finally {
      setReativando(null)
    }
  }

  return (
    <Collapsible asChild open={aberta} onOpenChange={setAberta}>
      <Card>
        {/* O cabeçalho INTEIRO é o gatilho, e por isso é um `<button>` com só
            `<span>` dentro: um `<div>` (como o CardTitle) dentro de um botão é
            HTML inválido, e alguns leitores de tela param de anunciar o rótulo.
            Um alvo de clique da largura do card também é o que torna isto
            confortável no celular. */}
        <CardHeader className="p-4">
          <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Archive className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display font-semibold leading-none tracking-tight">
                {t('categories.inactive.title')}
              </span>
              <span className="mt-1 block truncate text-sm text-muted-foreground">
                {t('categories.inactive.count', { count: total })}
              </span>
            </span>
            <ChevronRight
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                aberta && 'rotate-90',
              )}
              aria-hidden
            />
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3 p-4 pt-0">
            <p className="text-sm text-muted-foreground">{t('categories.inactive.description')}</p>

            <ul className="divide-y divide-border rounded-md border">
              {desativadas.map((no) => {
                const ancestrais = caminhoAte(categorias, no.id).slice(0, -1)
                const descendentes = tamanhoDaSubarvore(no) - 1

                return (
                  <li
                    key={no.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full opacity-60"
                      style={{ backgroundColor: no.cor }}
                      aria-hidden
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{no.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {ancestrais.length > 0
                          ? t('categories.inactive.at', {
                              path: ancestrais.map((item) => item.nome).join(SEPARADOR),
                            })
                          : t('categories.inactive.atTopLevel')}
                        {descendentes > 0 &&
                          ` · ${t('categories.inactive.withChildren', { count: descendentes })}`}
                      </span>
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => aoReativar(no)}
                      disabled={reativando !== null}
                    >
                      {reativando === no.id ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw aria-hidden />
                      )}
                      {t('categories.inactive.reactivate')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
