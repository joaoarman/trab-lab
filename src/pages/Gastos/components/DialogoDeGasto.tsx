import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { toast } from '@/shared/components/ui/sonner'
import { EntradaDeValor, numeroDeCotacao } from '@/shared/components/EntradaDeValor'
import type { Categoria, Gasto, Moeda } from '@/shared/data/model'
import { paraCampoDeDataHora } from '@/shared/utils/datas'
import { reaisDeTexto, textoDeValor, VALOR_MAXIMO, VALOR_MINIMO } from '@/shared/utils/dinheiro'
import { chaveDeErroDeGasto, criarGasto, salvarGasto } from '../supabase'
import { SeletorDeCategoria } from './SeletorDeCategoria'

const MAX_DO_NOME = 80

export function DialogoDeGasto({
  alvo,
  categorias,
  onFechar,
  onSalvo,
}: {
  alvo: Gasto | 'novo' | null
  categorias: Categoria[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const { t } = useTranslation()

  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [moeda, setMoeda] = useState<Moeda>('BRL')
  const [cotacao, setCotacao] = useState('')
  const [categoriaId, setCategoriaId] = useState<number | 'sem'>('sem')
  const [ocorreuEm, setOcorreuEm] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!alvo) return

    const editando = alvo !== 'novo' ? alvo : null
    setNome(editando?.nome ?? '')
    setValor(editando ? textoDeValor(editando.valor) : '')
    setMoeda(editando?.moeda ?? 'BRL')
    setCotacao(editando?.cotacao == null ? '' : String(editando.cotacao))
    setCategoriaId(editando?.categoriaId ?? 'sem')
    setOcorreuEm(paraCampoDeDataHora(editando ? new Date(editando.ocorreuEm) : new Date()))
    setErro(null)
  }, [alvo])

  const valorEmReais = reaisDeTexto(valor)
  const cotacaoNumero = moeda === 'BRL' ? null : numeroDeCotacao(cotacao)

  const valorValido =
    valorEmReais !== null && valorEmReais >= VALOR_MINIMO && valorEmReais <= VALOR_MAXIMO
  const cotacaoValida = moeda === 'BRL' || cotacaoNumero !== null
  const podeSalvar =
    nome.trim().length > 0 && valorValido && cotacaoValida && ocorreuEm !== '' && !salvando

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (!alvo || !podeSalvar) return

    const rascunho = {
      nome,
      valor: valorEmReais as number,
      moeda,
      cotacao: cotacaoNumero,
      categoriaId: categoriaId === 'sem' ? null : categoriaId,
      ocorreuEm: new Date(ocorreuEm).toISOString(),
    }

    setErro(null)
    setSalvando(true)
    try {
      if (alvo === 'novo') {
        await criarGasto(rascunho)
        toast.success(t('expenses.form.created'))
      } else {
        await salvarGasto(alvo.id, rascunho)
        toast.success(t('expenses.form.saved'))
      }
      onSalvo()
    } catch (falha) {
      setErro(t(chaveDeErroDeGasto(falha)))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberta) => !aberta && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t(alvo === 'novo' ? 'expenses.form.createTitle' : 'expenses.form.editTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={aoEnviar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gasto-nome">{t('expenses.form.name')}</Label>
            <Input
              id="gasto-nome"
              autoFocus
              maxLength={MAX_DO_NOME}
              placeholder={t('expenses.form.namePlaceholder')}
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              disabled={salvando}
            />
          </div>

          <EntradaDeValor
            id="gasto"
            valor={valor}
            onValor={setValor}
            moeda={moeda}
            onMoeda={setMoeda}
            cotacao={cotacao}
            onCotacao={setCotacao}
            valorEmReais={valorEmReais}
            desabilitado={salvando}
          />

          <div className="space-y-2">
            <Label htmlFor="gasto-categoria">{t('expenses.form.category')}</Label>
            <SeletorDeCategoria
              id="gasto-categoria"
              valor={categoriaId}
              onValor={(escolha) => setCategoriaId(escolha === null ? 'sem' : escolha)}
              categorias={categorias}
              desabilitado={salvando}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gasto-data">{t('expenses.form.occurredAt')}</Label>
            <Input
              id="gasto-data"
              type="datetime-local"
              value={ocorreuEm}
              onChange={(evento) => setOcorreuEm(evento.target.value)}
              disabled={salvando}
            />
          </div>

          {erro && <Alert variant="destructive">{erro}</Alert>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!podeSalvar}>
              {salvando && <Loader2 className="animate-spin" aria-hidden />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
