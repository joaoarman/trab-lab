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
import type { Moeda, Receita } from '@/shared/data/model'
import { formatDate } from '@/shared/i18n/format'
import { paraCampoDeDataHora } from '@/shared/utils/datas'
import { reaisDeTexto, textoDeValor, VALOR_MAXIMO, VALOR_MINIMO } from '@/shared/utils/dinheiro'
import { chaveDeErroDeReceita, criarReceita, salvarReceita } from '../supabase'

const MAX_DO_NOME = 80

export function DialogoDeReceita({
  alvo,
  onFechar,
  onSalvo,
}: {
  alvo: Receita | 'nova' | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const { t } = useTranslation()

  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [moeda, setMoeda] = useState<Moeda>('BRL')
  const [cotacao, setCotacao] = useState('')
  const [recebidaEm, setRecebidaEm] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!alvo) return

    const editando = alvo !== 'nova' ? alvo : null
    setNome(editando?.nome ?? '')
    setValor(editando ? textoDeValor(editando.valor) : '')
    setMoeda(editando?.moeda ?? 'BRL')
    setCotacao(editando?.cotacao == null ? '' : String(editando.cotacao))
    setRecebidaEm(paraCampoDeDataHora(editando ? new Date(editando.recebidaEm) : new Date()))
    setErro(null)
  }, [alvo])

  const valorEmReais = reaisDeTexto(valor)
  const cotacaoNumero = moeda === 'BRL' ? null : numeroDeCotacao(cotacao)

  const valorValido =
    valorEmReais !== null && valorEmReais >= VALOR_MINIMO && valorEmReais <= VALOR_MAXIMO
  const cotacaoValida = moeda === 'BRL' || cotacaoNumero !== null
  const podeSalvar =
    nome.trim().length > 0 && valorValido && cotacaoValida && recebidaEm !== '' && !salvando

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (!alvo || !podeSalvar) return

    const rascunho = {
      nome,
      valor: valorEmReais as number,
      moeda,
      cotacao: cotacaoNumero,
      recebidaEm: new Date(recebidaEm).toISOString(),
    }

    setErro(null)
    setSalvando(true)
    try {
      if (alvo === 'nova') {
        await criarReceita(rascunho)
        toast.success(t('income.form.created'))
      } else {
        await salvarReceita(alvo.id, rascunho)
        toast.success(t('income.form.saved'))
      }
      onSalvo()
    } catch (falha) {
      setErro(t(chaveDeErroDeReceita(falha)))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberta) => !aberta && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t(alvo === 'nova' ? 'income.form.createTitle' : 'income.form.editTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={aoEnviar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receita-nome">{t('income.form.name')}</Label>
            <Input
              id="receita-nome"
              autoFocus
              maxLength={MAX_DO_NOME}
              placeholder={t('income.form.namePlaceholder')}
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              disabled={salvando}
            />
          </div>

          <EntradaDeValor
            id="receita"
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
            <Label htmlFor="receita-data">{t('income.form.receivedAt')}</Label>
            <Input
              id="receita-data"
              type="datetime-local"
              value={recebidaEm}
              onChange={(evento) => setRecebidaEm(evento.target.value)}
              disabled={salvando}
            />
            {alvo !== null && alvo !== 'nova' && (
              <p className="text-xs text-muted-foreground">
                {t('income.form.registeredAt', {
                  date: formatDate(alvo.registradaEm, {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </p>
            )}
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
