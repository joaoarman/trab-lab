import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'

/**
 * O que ocupa a tela antes da primeira mensagem.
 *
 * Não é um estado vazio comum ("nada por aqui"): um campo de conversa em branco é
 * o pior tipo de tela em branco, porque o usuário sabe que pode escrever qualquer
 * coisa e justamente por isso não sabe o que escrever. As sugestões são exemplos
 * reais — tocar numa manda a frase, e a pessoa aprende o tom pelo uso, não por um
 * texto de ajuda.
 *
 * ## As cinco frases não são decorativas
 *
 * Elas cobrem, de propósito, tudo o que a IA sabe fazer e que ninguém adivinharia:
 *
 * 1. **registrar um gasto em linguagem solta** — o gesto principal do produto, e o
 *    que ensina que não é preciso escolher categoria;
 * 2. **registrar em dólar** — a capacidade menos óbvia das cinco. Ninguém tenta
 *    isso sem ver primeiro que dá;
 * 3. **registrar uma receita** — ensina que o sistema tem os dois lados;
 * 4. **consultar somando a subárvore** — "com carro" traz `Carro › Gasolina`
 *    junto, que é a regra que faz a hierarquia valer a pena;
 * 5. **consultar um ranking** — mostra que a conversa também responde perguntas,
 *    e não só grava.
 *
 * A ordem é a do aprendizado: primeiro o que se faz todo dia, depois o que se
 * descobre depois.
 */
const SUGESTOES = [
  'chat.welcome.examples.expense',
  'chat.welcome.examples.dollar',
  'chat.welcome.examples.income',
  'chat.welcome.examples.query',
  'chat.welcome.examples.summary',
] as const

export function BoasVindasDoChat({ onEscolher }: { onEscolher: (frase: string) => void }) {
  const { t } = useTranslation()

  return (
    // `flex-1` e não `h-full`: o pai alinha o conteúdo ao rodapé (as mensagens
    // sobem a partir do compositor), e é o `flex-1` que faz esta tela ocupar o
    // vazio inteiro e se centralizar nele, em vez de ficar colada embaixo.
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-2 py-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-primary-muted text-primary-muted-foreground">
        <Sparkles className="size-7" aria-hidden />
      </span>

      <div className="max-w-prose space-y-2">
        <h2 className="font-display text-xl font-semibold">{t('chat.welcome.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('chat.welcome.description')}</p>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-2">
        {SUGESTOES.map((chave) => (
          <Button
            key={chave}
            type="button"
            variant="outline"
            // `h-auto` + texto à esquerda: as frases têm comprimentos diferentes e
            // quebram em duas linhas no celular.
            className="h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left text-sm font-normal"
            onClick={() => onEscolher(t(chave))}
          >
            {t(chave)}
          </Button>
        ))}
      </div>
    </div>
  )
}
