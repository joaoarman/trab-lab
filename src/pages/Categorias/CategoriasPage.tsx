import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderTree, ListCollapse, Loader2, Plus, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card'
import type { Categoria } from '@/shared/data/model'
import { separarPorEstado } from './arvore'
import { listarCategorias } from './supabase'
import { CategoriasDesativadas } from './components/CategoriasDesativadas'
import { DialogoDeCategoria, type AlvoDoFormulario } from './components/DialogoDeCategoria'
import { DialogoDeRemocao } from './components/DialogoDeRemocao'
import { LinhaDeCategoria } from './components/LinhaDeCategoria'

/**
 * Categorias — `/categories`.
 *
 * A hierarquia que organiza gastos e receitas: uma árvore de profundidade livre
 * onde toda categoria pode receber subcategorias (`Carro › Gasolina`,
 * `Casa › Mercado › Feira`).
 *
 * As regras completas do módulo incluem por que excluir às vezes desativa.
 *
 * ## Toda a árvore vem aberta
 *
 * O estado guardado aqui é o dos nós **FECHADOS**, e não o dos abertos. A
 * inversão é o que faz "tudo aberto" ser o padrão de graça: um conjunto vazio já
 * é a árvore inteira à mostra, e uma categoria recém-criada nasce aberta sem
 * ninguém precisar lembrar de registrá-la. Guardando os abertos, seria o
 * contrário — a tela abriria fechada e cada nó novo apareceria colapsado.
 *
 * Não persiste entre visitas, e é de propósito: "sempre abertas" é o padrão
 * pedido, então cada abertura da tela começa dele.
 *
 * ## Um `recarregar()` depois de cada mudança
 *
 * As modais não devolvem a linha alterada para ser costurada no estado local:
 * elas avisam que algo mudou e a lista é buscada de novo. É uma requisição a
 * mais, e ela paga por si — as ações deste módulo têm efeitos que vão MUITO além
 * da linha tocada (desativar arrasta a subárvore, reativar mexe na cadeia de mães
 * inteira). Remendar isso na mão no cliente seria reescrever, em TypeScript, a
 * regra que o banco acabou de aplicar — e as duas versões divergiriam no primeiro
 * caso de canto.
 */
export function CategoriasPage() {
  const { t } = useTranslation()

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  const [fechadas, setFechadas] = useState<Set<number>>(new Set())
  const [formulario, setFormulario] = useState<AlvoDoFormulario | null>(null)
  const [aRemover, setARemover] = useState<Categoria | null>(null)

  const recarregar = useCallback(async () => {
    setErro(false)
    try {
      setCategorias(await listarCategorias())
    } catch {
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  const { ativas, desativadas } = useMemo(() => separarPorEstado(categorias), [categorias])

  const temSubcategorias = categorias.some((categoria) => categoria.paiId !== null)
  const tudoFechado = fechadas.size > 0

  function alternar(id: number) {
    setFechadas((anteriores) => {
      const proximas = new Set(anteriores)
      if (!proximas.delete(id)) proximas.add(id)
      return proximas
    })
  }

  /** Fecha todas as que têm filhas — ou reabre a árvore inteira. */
  function alternarTodas() {
    if (tudoFechado) {
      setFechadas(new Set())
      return
    }
    const comFilhas = new Set(
      categorias.filter((c) => c.paiId !== null).map((c) => c.paiId as number),
    )
    setFechadas(comFilhas)
  }

  const acoes = {
    onNovaFilha: (mae: Categoria) => setFormulario({ tipo: 'criar', mae }),
    onEditar: (categoria: Categoria) => setFormulario({ tipo: 'editar', categoria }),
    onRemover: setARemover,
  }

  if (carregando) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  return (
    <>
      {/* Sem título aqui: quem escreve "Categorias" no topo é o header, a partir
          de `navigation.ts`. Repeti-lo daria dois <h1> na mesma tela. */}
      <div className="space-y-6">
        {erro && (
          <Alert variant="destructive" className="justify-between">
            <span className="flex items-center gap-2">
              <TriangleAlert aria-hidden />
              {t('categories.page.loadFailed')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void recarregar()}>
              {t('categories.page.retry')}
            </Button>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 p-4">
            <span className="text-sm text-muted-foreground">
              {t('categories.page.count', { count: categorias.length })}
            </span>

            <span className="flex items-center gap-2">
              {temSubcategorias && (
                <Button variant="ghost" size="sm" onClick={alternarTodas}>
                  <ListCollapse aria-hidden />
                  {/* No celular o ícone basta: o rótulo roubaria a largura do
                      botão de criar, que é a ação principal da tela. */}
                  <span className="hidden sm:inline">
                    {t(tudoFechado ? 'categories.page.expandAll' : 'categories.page.collapseAll')}
                  </span>
                </Button>
              )}
              <Button size="sm" onClick={() => setFormulario({ tipo: 'criar', mae: null })}>
                <Plus aria-hidden />
                {t('categories.page.new')}
              </Button>
            </span>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            {ativas.length === 0 ? (
              // Árvore vazia tem dois motivos, e eles pedem frases diferentes:
              // "não existe nada ainda" convida a criar a primeira; "está tudo
              // desativado" precisa apontar para o bloco de baixo, senão a tela
              // diria "nenhuma categoria" logo acima de um card contando várias.
              <EstadoVazio
                semNenhuma={categorias.length === 0}
                onCriar={() => setFormulario({ tipo: 'criar', mae: null })}
              />
            ) : (
              <ul aria-label={t('categories.tree.label')}>
                {ativas.map((no) => (
                  <LinhaDeCategoria
                    key={no.id}
                    no={no}
                    fechadas={fechadas}
                    onAlternar={alternar}
                    acoes={acoes}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {desativadas.length > 0 && (
          <CategoriasDesativadas
            desativadas={desativadas}
            categorias={categorias}
            onReativado={() => void recarregar()}
          />
        )}
      </div>

      <DialogoDeCategoria
        alvo={formulario}
        categorias={categorias}
        onFechar={() => setFormulario(null)}
        onSalvo={() => {
          // Fecha ANTES de recarregar: a modal reajusta os campos quando o alvo
          // muda, e trocar a lista com ela ainda aberta piscaria o formulário
          // durante a animação de saída.
          setFormulario(null)
          void recarregar()
        }}
      />

      <DialogoDeRemocao
        categoria={aRemover}
        categorias={categorias}
        onFechar={() => setARemover(null)}
        onRemovido={() => {
          setARemover(null)
          void recarregar()
        }}
      />
    </>
  )
}

/**
 * A árvore sem nada para mostrar.
 *
 * No caso de estreia (`semNenhuma`), explica o que uma categoria é com um exemplo
 * concreto — é mais rápido de entender do que uma definição — e conta que dá para
 * não criar nenhuma: o chat monta a hierarquia sozinho conforme os gastos vão
 * sendo registrados, que é o caminho pretendido do sistema.
 *
 * No outro caso, existem categorias: estão todas desativadas, logo abaixo.
 */
function EstadoVazio({ semNenhuma, onCriar }: { semNenhuma: boolean; onCriar: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary-muted text-primary-muted-foreground">
        <FolderTree className="size-6" aria-hidden />
      </span>
      {semNenhuma && (
        <h2 className="font-display text-lg font-semibold">{t('categories.empty.title')}</h2>
      )}
      <p className="max-w-prose text-sm text-muted-foreground">
        {t(semNenhuma ? 'categories.empty.description' : 'categories.empty.allInactive')}
      </p>
      <Button className="mt-1" onClick={onCriar}>
        <Plus aria-hidden />
        {t(semNenhuma ? 'categories.empty.action' : 'categories.page.new')}
      </Button>
    </div>
  )
}
