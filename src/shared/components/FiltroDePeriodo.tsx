import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import type { RecorteDePeriodo } from '@/shared/data/model'
import { ATALHOS, periodoDe, type PeriodoEscolhido } from '@/shared/utils/datas'

/**
 * O recorte de tempo das listas de lançamento — o mesmo controle em Gastos e em
 * Receitas.
 *
 * ## Por que é compartilhado, e por que fica solto em `shared/components/`
 *
 * As duas telas fazem a mesma pergunta ("de quando até quando?") com os mesmos
 * atalhos. Duplicá-lo custaria três campos, quatro chaves de i18n e a regra de
 * "mexer numa data desfaz o atalho" em dois lugares — que divergem no dia em que
 * alguém ajustar um só. Como atravessa módulos e não é primitivo de UI nem
 * layout, mora no nível de cima de `shared/components/`, ao lado de
 * `PerfilAvatar` e `PasswordRequirements`.
 *
 * As **queries** continuam em cada módulo: o que sobe para cá é o controle e a
 * aritmética de datas (`shared/utils/datas.ts`), não o acesso ao banco.
 *
 * ## Por que o atalho e as datas convivem
 *
 * O seletor responde à pergunta comum em **um** clique ("este mês"), e os dois
 * campos de data respondem a qualquer outra. Eles não são alternativas escondidas
 * uma atrás da outra: as datas ficam **sempre visíveis**, mostrando o que o
 * atalho escolheu, porque "este mês" sem dizer de quando até quando obriga a
 * pessoa a confiar. Mexer numa das datas leva o seletor para "personalizado" — o
 * rótulo passa a dizer a verdade sobre o que está na tela.
 *
 * ## Nada de botão "aplicar"
 *
 * Cada mudança recarrega a lista na hora. Um botão a mais entre a escolha e o
 * resultado é um clique a mais em cima do gesto mais repetido da tela, e o
 * usuário perde o retorno imediato de "foi isso mesmo que eu quis ver?".
 *
 * ## Quem desenha a grade é quem chama
 *
 * O componente devolve os **três campos**, e não uma grade fechada em volta
 * deles: Gastos põe um quarto campo (a categoria) na mesma linha, Receitas não
 * tem quarto campo. Uma grade aqui dentro obrigaria a inventar um slot de
 * "filhos extras" para acomodar a diferença — e a coluna do vizinho passaria a
 * depender de um número escrito neste arquivo.
 */
export function FiltroDePeriodo({
  recorte,
  onRecorte,
  periodo,
  onPeriodo,
  desabilitado,
}: {
  recorte: RecorteDePeriodo
  onRecorte: (recorte: RecorteDePeriodo) => void
  /** Qual atalho está selecionado — ou `'personalizado'`. */
  periodo: PeriodoEscolhido
  onPeriodo: (periodo: PeriodoEscolhido) => void
  desabilitado: boolean
}) {
  const { t } = useTranslation()

  function trocarAtalho(escolha: string) {
    if (escolha === PERSONALIZADO) {
      onPeriodo(PERSONALIZADO)
      return
    }
    const atalho = escolha as (typeof ATALHOS)[number]
    onPeriodo(atalho)
    onRecorte({ ...recorte, ...periodoDe(atalho) })
  }

  /** Mexer numa data à mão desfaz o atalho: o rótulo tem de dizer a verdade. */
  function trocarData(campo: 'de' | 'ate', valor: string) {
    if (!valor) return
    onPeriodo(PERSONALIZADO)
    onRecorte({ ...recorte, [campo]: valor })
  }

  return (
    <>
      <CampoDeFiltro id="filtro-periodo" rotulo={t('period.label')}>
        <Select value={periodo} onValueChange={trocarAtalho} disabled={desabilitado}>
          <SelectTrigger id="filtro-periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATALHOS.map((atalho) => (
              <SelectItem key={atalho} value={atalho}>
                {t(`period.${atalho}`)}
              </SelectItem>
            ))}
            {/* Presente na lista, mas escolhido pelas datas: deixá-lo de fora
                faria o seletor exibir um rótulo vazio assim que alguém mexesse
                num dos campos ao lado. */}
            <SelectItem value={PERSONALIZADO}>{t('period.custom')}</SelectItem>
          </SelectContent>
        </Select>
      </CampoDeFiltro>

      <CampoDeFiltro id="filtro-de" rotulo={t('period.from')}>
        <Input
          id="filtro-de"
          type="date"
          value={recorte.de}
          max={recorte.ate}
          onChange={(evento) => trocarData('de', evento.target.value)}
          disabled={desabilitado}
        />
      </CampoDeFiltro>

      <CampoDeFiltro id="filtro-ate" rotulo={t('period.to')}>
        <Input
          id="filtro-ate"
          type="date"
          value={recorte.ate}
          min={recorte.de}
          onChange={(evento) => trocarData('ate', evento.target.value)}
          disabled={desabilitado}
        />
      </CampoDeFiltro>
    </>
  )
}

/** O valor do seletor quando as datas foram escolhidas à mão. */
const PERSONALIZADO = 'personalizado'

/**
 * Rótulo + controle, na medida dos filtros de lista.
 *
 * Exportado junto porque o campo que cada módulo acrescenta na mesma linha (a
 * categoria, em Gastos) precisa do mesmo enquadramento — sem isso, o rótulo do
 * quarto campo sairia de um tamanho e o dos três primeiros de outro.
 */
export function CampoDeFiltro({
  id,
  rotulo,
  children,
}: {
  id: string
  rotulo: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      {children}
    </div>
  )
}
