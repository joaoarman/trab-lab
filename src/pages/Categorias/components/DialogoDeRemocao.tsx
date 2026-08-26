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
import { caminhoAte } from '../arvore'
import { chaveDeErroDeCategoria, preverRemocao, removerCategoria } from '../supabase'

const SEPARADOR = ' › '

/**
 * A confirmação de exclusão — e o lugar onde a regra do módulo é **explicada**,
 * não só aplicada.
 *
 * ## Por que ela consulta o banco antes de perguntar
 *
 * Excluir aqui tem dois desfechos possíveis, e qual deles vale depende do que
 * está pendurado na categoria:
 *
 *   • **nada vinculado** → é excluída de vez;
 *   • **subcategorias ou lançamentos** → não é excluída, é **desativada** e vai
 *     para "Desativadas", de onde pode voltar.
 *
 * Uma modal genérica ("tem certeza?") deixaria a pessoa adivinhando qual dos dois
 * vai acontecer — e são consequências muito diferentes para o mesmo clique. Então
 * a modal abre perguntando ao banco (`preverRemocao`) e escreve o desfecho real,
 * com o número de subcategorias que vão junto. Até o rótulo do botão muda:
 * "Excluir" ou "Desativar".
 *
 * Nos dois casos ela também enuncia a REGRA, não só o resultado: quem vê
 * "será excluída" precisa saber que existe o outro caminho, senão vai supor que
 * excluir sempre apaga — e um dia vai clicar em algo que não some.
 *
 * ## A prévia não é a decisão
 *
 * Quem decide é o banco, no instante de agir: `removerCategoria` recalcula tudo e
 * devolve o que REALMENTE aconteceu, e é esse retorno que vira o aviso final. Se
 * algo mudar entre abrir a modal e confirmar, a tela conta a verdade.
 */
export function DialogoDeRemocao({
  categoria,
  categorias,
  onFechar,
  onRemovido,
}: {
  /** `null` = fechada. */
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

    // A resposta de uma categoria já fechada não pode cair na modal da próxima:
    // sem esta trava, abrir "Carro" e fechar rápido para abrir "Casa" mostraria
    // o impacto de Carro na confirmação de Casa.
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
          {/* O rótulo só aparece depois da prévia. Enquanto ela não volta, o botão
              é um spinner desabilitado: escrever "Excluir" ou "Desativar" antes
              de saber a resposta seria anunciar um desfecho que ainda pode ser o
              outro — e é justamente essa a informação que a modal existe para dar. */}
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
