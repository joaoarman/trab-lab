import { useTranslation } from 'react-i18next'
import { ArrowDownCircle, ArrowUpCircle, Check, FolderTree, Pencil, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import type { ReciboDeRegistro } from '@/shared/data/model'
import { formatDate, formatMoney, formatNumber } from '@/shared/i18n/format'

/**
 * O CARTÃO DE CONFIRMAÇÃO — o que a conversa mostra quando um registro é salvo.
 *
 * É a peça que fecha o ciclo do produto. A pessoa disse uma frase; a IA decidiu o
 * valor, a moeda, a categoria e a data por conta própria. O cartão é onde ela
 * **confere se a IA acertou**, de relance, sem abrir a tela de Gastos.
 *
 * ## Por que é um componente, e não texto formatado pela IA
 *
 * A alternativa seria a IA escrever "✅ **Gasto salvo** · R$ 108,42 · Carro ›
 * Gasolina". Três coisas se perdem nesse caminho:
 *
 * 1. **a formatação depende do modelo acertar toda vez.** Aqui o valor passa por
 *    `formatMoney` (o `Intl` do idioma ativo), e a data por `formatDate` — em
 *    inglês o cartão sai em inglês sem ninguém pedir;
 * 2. **a cor semântica some.** Gasto é `--expense`, receita é `--income`, e o par
 *    é a linguagem visual do app inteiro (a mesma das listas). Texto de bolha não
 *    tem como pintar isso;
 * 3. **a garantia some.** O cartão só existe porque a Edge Function gravou um
 *    recibo em `ai_log.receipts`, e ela só grava quando a ferramenta de escrita
 *    voltou OK. Um "✅" digitado pela IA prova apenas que ela escreveu "✅" — e
 *    esse foi o defeito mais caro que este módulo teve de resolver.
 *
 * ## Ele é um recibo: não se atualiza
 *
 * Os valores vêm gravados na linha da mensagem, não buscados na `expense` pelo id.
 * O cartão de três semanas atrás continua mostrando o que foi salvo naquele dia,
 * mesmo que o gasto tenha sido editado (ou excluído) depois. É o ponto: um
 * comprovante que muda sozinho não comprova nada.
 *
 * ## A ordem das linhas segue a ordem da conferência
 *
 * Valor primeiro (é o que se confere), depois onde foi, depois a categoria — e a
 * categoria com a **hierarquia inteira**, porque "Gasolina" sozinha não distingue
 * a do carro da do gerador, e escolher a gaveta é justamente a decisão que a IA
 * tomou sozinha. A data fecha, miúda, e é uma só: **quando aconteceu**.
 */
export function CartaoDeRegistro({ recibo }: { recibo: ReciboDeRegistro }) {
  const { t } = useTranslation()

  const { icone: Icone, cor, fundo, borda } = APARENCIA[recibo.tipo]
  const acao = ACOES[recibo.acao]
  const emDolar = recibo.moeda === 'USD' && recibo.cotacao != null

  return (
    <div className={cn('rounded-2xl border p-3', borda, fundo)}>
      {/* O cabeçalho: o que aconteceu, com o ícone da AÇÃO à esquerda e o da
          ENTIDADE junto do título. São dois ícones porque são duas perguntas
          diferentes — "foi salvo ou apagado?" e "é gasto, receita ou categoria?" —
          e um ícone só teria de responder as duas. */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full',
            recibo.acao === 'excluido' || recibo.acao === 'desativado'
              ? 'bg-muted text-muted-foreground'
              : cn('bg-card', cor),
          )}
        >
          <acao.icone className="size-3.5" aria-hidden />
        </span>

        <span className={cn('flex items-center gap-1.5 text-sm font-semibold', cor)}>
          <Icone className="size-4 shrink-0" aria-hidden />
          {t(`chat.receipt.${recibo.tipo}.${recibo.acao}`)}
        </span>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {/* O VALOR, em font-mono: é a fonte que o projeto reserva para dinheiro, e
            aqui ela também alinha o valor com o convertido logo abaixo. */}
        {recibo.valorEmBrl !== undefined && (
          <p className={cn('font-mono text-lg font-semibold leading-none', cor)}>
            {formatMoney(recibo.valorEmBrl)}
          </p>
        )}

        {/* A CONVERSÃO — só quando houve. Ela existe porque a cotação é um fato
            datado: o gasto de US$ 20 valeu o dólar daquele dia, e é esse número
            que o usuário precisa poder conferir. Sem esta linha, um valor em reais
            que não bate com o que a pessoa lembra de ter gasto parece erro. */}
        {emDolar && recibo.valor !== undefined && (
          <p className="font-mono text-xs text-muted-foreground">
            {t('chat.receipt.converted', {
              original: formatMoney(recibo.valor, recibo.moeda),
              // Quatro casas porque é a precisão com que a cotação é cotada — com
              // duas, 5,4210 viraria 5,42 e a conta deixaria de fechar na
              // calculadora de quem quiser conferir.
              rate: formatNumber(recibo.cotacao as number, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              }),
            })}
          </p>
        )}

        {/* ONDE foi — o descritor do episódio. Numa categoria, é o próprio nome
            dela, e aí a linha da hierarquia logo abaixo já o repete: por isso ela
            só aparece quando há valor (ou seja, num lançamento). */}
        {recibo.valorEmBrl !== undefined && recibo.nome && (
          <p className="break-words text-sm text-foreground">{recibo.nome}</p>
        )}

        {/* A HIERARQUIA INTEIRA. É a razão de o cartão existir: a categoria foi
            escolhida pela IA, e só o caminho completo deixa conferir a escolha. */}
        {recibo.categoria && recibo.categoria.length > 0 && (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <FolderTree className="size-3.5 shrink-0" aria-hidden />
            {recibo.categoria.map((degrau, indice) => (
              <span key={`${degrau}-${indice}`} className="flex items-center gap-1">
                {indice > 0 && <span aria-hidden>›</span>}
                {/* A folha em destaque: é onde o lançamento de fato caiu; o
                    caminho acima dela é contexto. */}
                <span
                  className={cn(indice === recibo.categoria!.length - 1 && 'font-medium text-foreground')}
                >
                  {degrau}
                </span>
              </span>
            ))}

            {/* O SELO DE CATEGORIA NOVA — a IA mexeu na árvore do usuário, e isso
                não pode ficar só na frase dela. O selo vem do que a ferramenta de
                fato criou, então "criei a categoria Mercado" passa a ser
                conferível de relance: sem selo, nada nasceu, por mais convincente
                que a bolha esteja. Em âmbar porque é a cor de "olhe para isto"
                deste tema, e não de erro nem de dinheiro. */}
            {recibo.categoriaCriada && (
              <span className="rounded-full bg-warning-muted px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-warning">
                {t('chat.receipt.newCategory')}
              </span>
            )}
          </p>
        )}

        {/* Lançamento sem categoria é um estado legítimo (registrar nunca trava por
            falta de hierarquia), e dizê-lo é melhor do que a ausência de linha —
            que se leria como "a IA esqueceu de mostrar". */}
        {recibo.tipo === 'gasto' && !recibo.categoria && (
          <p className="flex items-center gap-1 text-xs italic text-muted-foreground">
            <FolderTree className="size-3.5 shrink-0" aria-hidden />
            {t('chat.receipt.noCategory')}
          </p>
        )}
      </div>

      {/* UMA data, no pé e miúda: QUANDO ACONTECEU. O instante em que a linha
          entrou no banco não vai para o cartão — ele é quase sempre "agora", e um
          "agora" impresso ao lado da data que importa só disputa a atenção dela.
          Quem precisa desse dado é auditoria, e auditoria tem tela própria (o Log
          da IA, que guarda o `created_at` de cada turno).

          Num cartão de categoria não existe "aconteceu": a categoria nasceu na
          hora em que foi criada, então ali a data da criação É a data do fato — e
          o rótulo muda junto, senão o cartão diria "ocorreu em" sobre algo que não
          ocorre. */}
      <dl className="mt-3 flex gap-1 border-t border-border/60 pt-2 text-[0.6875rem] text-muted-foreground">
        <dt>{t(ROTULO_DA_DATA[recibo.tipo])}</dt>
        <dd className="font-medium text-foreground/80">
          {dataHora(recibo.aconteceuEm ?? recibo.criadoEm)}
        </dd>
      </dl>
    </div>
  )
}

/**
 * O rótulo da única data do cartão, por tipo de registro.
 *
 * Gasto "ocorreu", receita foi "recebida" e categoria foi "criada" — três verbos
 * diferentes para o mesmo campo, e usar um só ("data") economizaria uma palavra
 * ao custo de o cartão parar de dizer o que aquele instante significa.
 */
const ROTULO_DA_DATA: Record<ReciboDeRegistro['tipo'], string> = {
  gasto: 'chat.receipt.occurredAt',
  receita: 'chat.receipt.receivedAt',
  categoria: 'chat.receipt.createdAt',
}

/** Data e hora curtas, no idioma ativo. Sempre pelo `Intl`, nunca montadas à mão. */
function dataHora(iso: string): string {
  return formatDate(iso, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * A cara de cada tipo de registro.
 *
 * Gasto e receita usam o **par semântico do sistema** (`--expense` / `--income`),
 * o mesmo das listas de Gastos e Receitas — o cartão da conversa e a linha do
 * extrato falam do mesmo dinheiro, e o olho tem de reconhecer isso sem ler. As
 * setas seguem o dinheiro (sai = para baixo, entra = para cima), exatamente como
 * na navegação (`navigation.ts`).
 *
 * Categoria não é dinheiro, então usa a marca: ela é estrutura, não valor.
 */
const APARENCIA: Record<ReciboDeRegistro['tipo'], {
  icone: LucideIcon
  cor: string
  fundo: string
  borda: string
}> = {
  gasto: {
    icone: ArrowDownCircle,
    cor: 'text-expense',
    fundo: 'bg-expense-muted',
    borda: 'border-expense/25',
  },
  receita: {
    icone: ArrowUpCircle,
    cor: 'text-income',
    fundo: 'bg-income-muted',
    borda: 'border-income/25',
  },
  categoria: {
    icone: FolderTree,
    cor: 'text-primary-muted-foreground',
    fundo: 'bg-primary-muted',
    borda: 'border-primary/25',
  },
}

/**
 * O ícone da ação.
 *
 * O **check** é o que o usuário procura ao mandar um gasto, e ele só aparece
 * quando algo foi de fato gravado. Editar ganha o lápis e remover ganha a lixeira
 * porque "salvo" e "apagado" não podem compartilhar o mesmo símbolo numa tela em
 * que se rola para trás conferindo o que foi feito.
 */
const ACOES: Record<ReciboDeRegistro['acao'], { icone: LucideIcon }> = {
  criado: { icone: Check },
  editado: { icone: Pencil },
  excluido: { icone: Trash2 },
  desativado: { icone: Trash2 },
}
