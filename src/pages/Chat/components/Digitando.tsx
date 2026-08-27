import { useTranslation } from 'react-i18next'

/**
 * "A IA está digitando" — a bolha com os três pontinhos.
 *
 * Ela ocupa o lugar exato onde a resposta vai aparecer, do lado da IA e com a
 * mesma forma da bolha dela, para a chegada da resposta ser uma substituição e não
 * um salto na tela.
 *
 * Ela cobre mais tempo do que parece: entre o envio e a resposta, a IA pode
 * consultar a árvore de categorias, criar uma categoria nova, gravar o gasto e
 * ainda somar o mês. Sem esse sinal, a espera pareceria travamento — e é
 * justamente na rua, com conexão ruim, que ela é mais longa.
 *
 * `role="status"` faz o leitor de tela anunciar o estado sem roubar o foco de quem
 * está digitando a próxima mensagem.
 */
export function Digitando() {
  const { t } = useTranslation()

  return (
    // `pl-8` = o avatar da IA (`size-6`) mais o vão (`gap-2`). Sem ele os
    // pontinhos nascem colados na margem e a resposta, quando chega, dá um passo
    // para a direita — o salto que esta bolha existe para evitar.
    <div className="flex w-full justify-start pl-8" role="status" aria-live="polite">
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-3.5 shadow-sm">
        <span className="sr-only">{t('chat.typing')}</span>
        {/* O atraso é o que faz a onda correr: mesmo movimento, começos
            diferentes. A animação vem do tailwind.config.ts (`typing-dot`). */}
        {['0ms', '150ms', '300ms'].map((atraso) => (
          <span
            key={atraso}
            aria-hidden
            className="size-2 animate-typing-dot rounded-full bg-muted-foreground"
            style={{ animationDelay: atraso }}
          />
        ))}
      </div>
    </div>
  )
}
