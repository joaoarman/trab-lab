import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Loader2, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import type { Categoria, ImpactoDeExclusao } from '@/shared/data/model'
import { caminhoAte } from '@/shared/data/arvoreDeCategorias'
import { chaveDeErroDeCategoria, preverRemocao, removerCategoria } from '../supabase'

const SEPARADOR = ' › '

export function DialogoDeRemocao({
  categoria,
  categorias,
  onFechar,
  onRemovido,
}: {
  categoria: Categoria | null
  categorias: Categoria[]
  onFechar: () => void
  onRemovido: () => void
}) {
  const { t } = useTranslation()

  const [impacto, setImpacto] = useState<ImpactoDeExclusao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    if (!categoria) return

    let atual = true
    setImpacto(null)
    setErro(null)

    preverRemocao(categoria.id)
      .then((resposta) => atual && setImpacto(resposta))
      .catch((falha) => atual && setErro(t(chaveDeErroDeCategoria(falha))))

    return () => {
      atual = false
    }
  }, [categoria, t])

  async function aoConfirmar() {
    if (!categoria) return

    setErro(null)
    setProcessando(true)
    try {
      const feito = await removerCategoria(categoria.id)
      toast.success(
        t(feito === 'excluir' ? 'categories.remove.deleted' : 'categories.remove.deactivated'),
      )
      onRemovido()
    } catch (falha) {
      setErro(t(chaveDeErroDeCategoria(falha)))
    } finally {
      setProcessando(false)
    }
  }

  const ancestrais = categoria ? caminhoAte(categorias, categoria.id).slice(0, -1) : []
  const vaiExcluir = impacto?.acao === 'excluir'

  return (
    <Dialog
      open={categoria !== null}
      onOpenChange={(aberta) => !aberta && !processando && onFechar()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('categories.remove.title', { name: categoria?.nome ?? '' })}
          </DialogTitle>
          {ancestrais.length > 0 && (
            <DialogDescription>
              {t('categories.inactive.at', {
                path: ancestrais.map((item) => item.nome).join(SEPARADOR),
              })}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {!impacto && !erro && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('categories.remove.checking')}
            </p>
          )}

          {impacto && vaiExcluir && (
            <>
              <Alert variant="destructive">
                <TriangleAlert aria-hidden />
                {t('categories.remove.willDelete')}
              </Alert>
              <p className="text-muted-foreground">{t('categories.remove.willDeleteHint')}</p>
            </>
          )}

          {impacto && !vaiExcluir && (
            <>
              <Alert variant="warning">
                <Archive aria-hidden />
                {t('categories.remove.willDeactivate')}
              </Alert>

              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {impacto.descendentes > 0 && (
                  <li>
                    {t('categories.remove.becauseChildren', { count: impacto.descendentes })}
                  </li>
                )}
                {impacto.registros > 0 && (
                  <li>{t('categories.remove.becauseRecords', { count: impacto.registros })}</li>
                )}
              </ul>

              <p className="text-muted-foreground">{t('categories.remove.willDeactivateHint')}</p>
            </>
          )}

          {erro && <Alert variant="destructive">{erro}</Alert>}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onFechar} disabled={processando}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={vaiExcluir ? 'destructive' : 'default'}
            onClick={aoConfirmar}
            disabled={!impacto || processando}
            aria-label={impacto ? undefined : t('categories.remove.checking')}
          >
            {(!impacto || processando) && <Loader2 className="animate-spin" aria-hidden />}
            {impacto &&
              t(
                vaiExcluir
                  ? 'categories.remove.confirmDelete'
                  : 'categories.remove.confirmDeactivate',
              )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
