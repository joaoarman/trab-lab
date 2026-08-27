import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

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
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/components/ui/sonner'
import type { Categoria } from '@/shared/data/model'
import { caminhoAte } from '@/shared/data/arvoreDeCategorias'
import { chaveDeErroDeCategoria, criarCategoria, salvarCategoria } from '../supabase'
import { corSugerida, SeletorDeCor } from './SeletorDeCor'

export type AlvoDoFormulario =
  | { tipo: 'criar'; mae: Categoria | null }
  | { tipo: 'editar'; categoria: Categoria }

const MAX_DO_NOME = 60

const SEPARADOR = ' › '

export function DialogoDeCategoria({
  alvo,
  categorias,
  onFechar,
  onSalvo,
}: {
  alvo: AlvoDoFormulario | null
  categorias: Categoria[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const { t } = useTranslation()

  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(corSugerida(0))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!alvo) return
    setNome(alvo.tipo === 'editar' ? alvo.categoria.nome : '')
    setCor(alvo.tipo === 'editar' ? alvo.categoria.cor : corSugerida(categorias.length))
    setErro(null)
  }, [alvo])

  const nomeValido = nome.trim().length > 0

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (!alvo || !nomeValido) return

    setErro(null)
    setSalvando(true)
    try {
      if (alvo.tipo === 'criar') {
        await criarCategoria(nome, cor, alvo.mae?.id ?? null)
        toast.success(t('categories.form.created'))
      } else {
        await salvarCategoria(alvo.categoria.id, nome, cor)
        toast.success(t('categories.form.saved'))
      }
      onSalvo()
    } catch (falha) {
      setErro(t(chaveDeErroDeCategoria(falha)))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberta) => !aberta && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{t(chaveDoTitulo(alvo))}</DialogTitle>
          <DialogDescription>{descricao(alvo, categorias, t)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={aoEnviar} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="nome-da-categoria">{t('categories.form.name')}</Label>
            <Input
              id="nome-da-categoria"
              autoFocus
              maxLength={MAX_DO_NOME}
              placeholder={t('categories.form.namePlaceholder')}
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              disabled={salvando}
            />
          </div>

          <SeletorDeCor valor={cor} onValor={setCor} desabilitado={salvando} />

          {erro && <Alert variant="destructive">{erro}</Alert>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!nomeValido || salvando}>
              {salvando && <Loader2 className="animate-spin" aria-hidden />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function chaveDoTitulo(alvo: AlvoDoFormulario | null): string {
  if (alvo?.tipo === 'editar') return 'categories.form.editTitle'
  if (alvo?.mae) return 'categories.form.createChildTitle'
  return 'categories.form.createTitle'
}

function descricao(
  alvo: AlvoDoFormulario | null,
  categorias: Categoria[],
  t: (chave: string, valores?: Record<string, unknown>) => string,
): string {
  if (!alvo) return ''

  const ancestrais =
    alvo.tipo === 'criar'
      ? alvo.mae
        ? caminhoAte(categorias, alvo.mae.id)
        : []
      : caminhoAte(categorias, alvo.categoria.id).slice(0, -1)

  if (ancestrais.length === 0) return t('categories.form.atTopLevel')
  return t('categories.form.inside', {
    path: ancestrais.map((categoria) => categoria.nome).join(SEPARADOR),
  })
}
