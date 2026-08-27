import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderTree, ListCollapse, Loader2, Plus, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card'
import type { Categoria } from '@/shared/data/model'
import { separarPorEstado } from '@/shared/data/arvoreDeCategorias'
import { listarCategorias } from './supabase'
import { CategoriasDesativadas } from './components/CategoriasDesativadas'
import { DialogoDeCategoria, type AlvoDoFormulario } from './components/DialogoDeCategoria'
import { DialogoDeRemocao } from './components/DialogoDeRemocao'
import { LinhaDeCategoria } from './components/LinhaDeCategoria'

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
