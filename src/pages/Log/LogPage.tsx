import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, ScrollText, TriangleAlert } from 'lucide-react'

import { Alert } from '@/shared/components/ui/alert'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { FiltroDePeriodo } from '@/shared/components/FiltroDePeriodo'
import type { ConsumoDeIA, MensagemDaIA, RecorteDePeriodo } from '@/shared/data/model'
import { dataLocal, periodoDe, type Atalho, type PeriodoEscolhido } from '@/shared/utils/datas'
import { consumoDoPeriodo, listarMensagens, TAMANHO_DA_PAGINA } from './supabase'
import { DiaDoLog, LinhaDoLog } from './components/LinhaDoLog'
import { TotaisDeConsumo } from './components/TotaisDeConsumo'

const ATALHO_INICIAL: Atalho = 'esteMes'

export function LogPage() {
  const { t } = useTranslation()

  const [mensagens, setMensagens] = useState<MensagemDaIA[]>([])
  const [consumo, setConsumo] = useState<ConsumoDeIA | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [temMais, setTemMais] = useState(false)
  const [erro, setErro] = useState(false)

  const [periodo, setPeriodo] = useState<PeriodoEscolhido>(ATALHO_INICIAL)
  const [recorte, setRecorte] = useState<RecorteDePeriodo>(() => periodoDe(ATALHO_INICIAL))

  const recarregar = useCallback(async () => {
    setErro(false)
    setCarregando(true)
    try {
      const [pagina, totais] = await Promise.all([
        listarMensagens(recorte),
        consumoDoPeriodo(recorte),
      ])
      setMensagens(pagina)
      setConsumo(totais)
      setTemMais(pagina.length === TAMANHO_DA_PAGINA)
    } catch {
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }, [recorte])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  async function carregarMais() {
    const ultima = mensagens[mensagens.length - 1]
    if (!ultima || carregandoMais) return

    setCarregandoMais(true)
    try {
      const proximas = await listarMensagens(recorte, ultima.id)
      setMensagens((atuais) => [...atuais, ...proximas])
      setTemMais(proximas.length === TAMANHO_DA_PAGINA)
    } catch {
      setErro(true)
    } finally {
      setCarregandoMais(false)
    }
  }

  const dias = useMemo(() => {
    const grupos: { data: string; mensagens: MensagemDaIA[] }[] = []

    for (const mensagem of mensagens) {
      const data = dataLocal(mensagem.criadaEm)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo?.data === data) ultimo.mensagens.push(mensagem)
      else grupos.push({ data, mensagens: [mensagem] })
    }

    return grupos
  }, [mensagens])

  return (
    <div className="space-y-6">
      {erro && (
        <Alert variant="destructive" className="justify-between">
          <span className="flex items-center gap-2">
            <TriangleAlert aria-hidden />
            {t('log.page.loadFailed')}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void recarregar()}>
            {t('log.page.retry')}
          </Button>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FiltroDePeriodo
              recorte={recorte}
              onRecorte={setRecorte}
              periodo={periodo}
              onPeriodo={setPeriodo}
              desabilitado={carregando}
            />
          </div>
        </CardContent>
      </Card>

      <TotaisDeConsumo consumo={consumo} carregando={carregando} />

      <Card>
        <CardContent className="p-4">
          {carregando ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : mensagens.length === 0 ? (
            <EstadoVazio />
          ) : (
            <div className="space-y-5">
              {dias.map((dia) => (
                <DiaDoLog key={dia.data} data={dia.data}>
                  {dia.mensagens.map((mensagem) => (
                    <LinhaDoLog key={mensagem.id} mensagem={mensagem} />
                  ))}
                </DiaDoLog>
              ))}

              {temMais && (
                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={carregandoMais}
                    onClick={() => void carregarMais()}
                  >
                    {carregandoMais && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {t('log.page.loadMore')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EstadoVazio() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <ScrollText className="size-6" aria-hidden />
      </span>
      <p className="font-display text-base font-medium">{t('log.empty.title')}</p>
      <p className="max-w-prose text-sm text-muted-foreground">{t('log.empty.description')}</p>
    </div>
  )
}
