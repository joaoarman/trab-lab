import { useTranslation } from 'react-i18next'
import { AudioLines, Ban, Mic, Sparkles } from 'lucide-react'

import { PerfilAvatar } from '@/shared/components/PerfilAvatar'
import { useAuth } from '@/shared/context/AuthContext'
import { cn } from '@/shared/lib/utils'
import type { MensagemDaIA } from '@/shared/data/model'
import { urlDoAvatar } from '@/shared/lib/avatar'
import { CartaoDeRegistro } from './CartaoDeRegistro'
import { TextoDaIA } from './TextoDaIA'

/**
 * Uma mensagem da conversa.
 *
 * O desenho é o de qualquer aplicativo de mensagem, e isso é escolha: o usuário já
 * sabe ler esta tela antes de abri-la pela primeira vez. **Ele à direita, em
 * esmeralda; a IA à esquerda, no cartão.**
 *
 * ## O que diz de quem é a mensagem é o VAZIO, não a bolha
 *
 * A cor e o lado já separam os dois, mas o que o olho lê primeiro, de longe, é o
 * espaço que sobra do lado oposto. Por isso a bolha para em 78% no celular (e
 * menos no desktop) e o texto é miúdo: quanto mais estreita ela fica, mais nítido
 * é o degrau entre um lado e o outro numa tela de telefone. Bolha de largura quase
 * inteira deixa de parecer conversa — vira uma pilha de parágrafos.
 *
 * O horário fica **dentro** da bolha, ao pé: numa sequência de mensagens curtas
 * ("gastei 20 no posto", "e 40 no mercado"), uma linha de horário entre cada uma
 * dobraria a altura da conversa por uma informação que quase nunca se lê.
 *
 * ## Os três estados de uma bolha da IA
 *
 * 1. **normal** — cartão neutro, texto com o pouco de negrito que ela usa;
 * 2. **com recibo** — um ou mais `CartaoDeRegistro` **acima** do balão. O fato
 *    primeiro, o comentário depois: quem manda "gastei 20 no posto" quer saber se
 *    entrou, e o cartão responde isso sem depender de o texto ser lido. Eles ficam
 *    FORA do balão, alinhados a ele: um comprovante dentro de um balão de fala
 *    pareceria a IA "dizendo" o comprovante, quando ele é o que o banco gravou;
 * 3. **recusa** — assunto fora do sistema. Fundo vermelho suave, ícone de
 *    proibido, e a frase padrão. Ver abaixo por que ela é vermelha e não cinza.
 *
 * ## Por que a recusa é vermelha
 *
 * Porque ela precisa **parar a leitura**. Numa conversa em que quase tudo dá
 * certo, uma resposta cinza a mais se lê como "a IA respondeu alguma coisa", e o
 * usuário segue achando que foi atendido. O vermelho diz, antes de qualquer
 * palavra ser lida, que aquele pedido não foi feito — e é `--destructive`, e não
 * `--expense`, porque não é dinheiro: é um limite do sistema.
 *
 * ## Os avatares
 *
 * Um de cada lado, pequenos e alinhados pelo pé da bolha — na altura da última
 * linha, que é onde o olho termina de ler. Pequenos também porque cada pixel deles
 * é pixel que a bolha não usa. O do usuário é a foto do perfil (a mesma do menu da
 * conta); o da IA é o mesmo símbolo que abre a tela vazia, então a conversa e as
 * boas-vindas falam do mesmo interlocutor.
 *
 * Eles são **decorativos** para quem usa leitor de tela (`aria-hidden`): quem
 * falou já está dito pelo lado da bolha, e dois avatares anunciados a cada
 * mensagem transformariam a leitura da conversa numa ladainha.
 */
export function Bolha({
  mensagem,
  transcrevendo = false,
}: {
  mensagem: MensagemDaIA
  /**
   * O áudio já foi enviado e está virando texto. A bolha existe desde o instante
   * em que o usuário soltou o botão — é a mensagem dele, a caminho —, e o texto
   * aparece aqui dentro quando fica pronto, sem ela mudar de lugar.
   */
  transcrevendo?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { perfil } = useAuth()

  const doUsuario = mensagem.papel === 'USER'
  const recusa = mensagem.tipo === 'REFUSAL'

  // Só a hora: o dia já está no separador de datas da lista.
  const horario = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(mensagem.criadaEm))

  const avatar = doUsuario ? (
    <PerfilAvatar
      url={perfil ? urlDoAvatar(perfil) : null}
      nome={perfil?.nome ?? ''}
      className="size-6"
      classNameFallback="text-[0.625rem]"
      tamanhoDoIcone="size-3"
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full',
        recusa
          ? 'bg-destructive-muted text-destructive'
          : 'bg-primary-muted text-primary-muted-foreground',
      )}
    >
      {recusa ? <Ban className="size-3.5" /> : <Sparkles className="size-3.5" />}
    </span>
  )

  return (
    <div
      className={cn(
        // `items-end` alinha o avatar pelo PÉ da bolha: numa mensagem de cinco
        // linhas, alinhado ao topo ele ficaria longe do fim do texto, que é onde
        // o olho está quando termina de ler.
        'flex w-full items-end gap-2',
        doUsuario ? 'justify-end' : 'justify-start',
      )}
    >
      {!doUsuario && <div aria-hidden>{avatar}</div>}

      {/* O teto de largura desconta o avatar e o vão (`size-6` + `gap-2` = 2rem),
          senão uma mensagem longa empurraria a bolha para além da margem do lado
          oposto. É este teto que diz de quem é a mensagem — o que se lê não é a
          bolha, é o VAZIO do lado oposto. */}
      <div className="flex max-w-[calc(78%-2rem)] flex-col gap-2 sm:max-w-[calc(70%-2rem)] lg:max-w-[calc(62%-2rem)]">
        {/* OS CARTÕES VÊM ANTES DO BALÃO, e é a ordem em que a conversa acontece:
            o fato primeiro, o comentário depois. A pessoa manda "gastei 20 no
            posto" e o que ela quer saber é se entrou — o cartão responde isso
            sozinho, sem depender de ler uma linha de texto antes.

            Invertido (texto e depois cartão), o "Anotei, mas criei a categoria
            Casa › Mercado" chegava como uma ressalva sobre algo que o usuário
            ainda não tinha visto, e a pergunta do fim ("quer trocar?") ficava
            longe do cartão que a responde. Assim ela encosta nele.

            Ficam FORA do balão: o balão é o que a IA disse, o cartão é o que o
            banco gravou. Vários quando a mesma frase gerou vários lançamentos
            ("gastei 20 no posto e 40 no mercado"). */}
        {mensagem.recibos.map((recibo, indice) => (
          <CartaoDeRegistro key={`${recibo.tipo}-${recibo.id}-${indice}`} recibo={recibo} />
        ))}

        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-[0.8125rem] leading-relaxed shadow-sm',
            doUsuario
              ? // O canto reto do lado de quem fala é o detalhe que dá o "rabinho"
                // da bolha sem desenhar um triângulo.
                'rounded-br-md bg-primary text-primary-foreground'
              : recusa
                ? 'rounded-bl-md border border-destructive/30 bg-destructive-muted text-destructive'
                : 'rounded-bl-md border border-border bg-card text-card-foreground',
          )}
        >
          {transcrevendo ? (
            // A onda pulsando ocupa o lugar exato onde o texto vai entrar, então a
            // troca não mexe na conversa. O rótulo diz o que está acontecendo —
            // sem ele, um ícone sozinho pareceria um áudio a tocar.
            <div className="flex items-center gap-2 py-0.5">
              <AudioLines className="size-4 shrink-0 animate-pulse" aria-hidden />
              {/* Sem tamanho próprio: herda o da bolha, senão muda de corpo na
                  hora em que o texto transcrito toma o lugar do aviso. */}
              <span className="opacity-80">{t('chat.message.transcribing')}</span>
            </div>
          ) : (
            /* A formatação da IA (o negrito dos valores) só é interpretada do lado
               dela. O que o usuário escreveu vai como ele escreveu — asterisco
               digitado por ele é asterisco, não formatação. */
            <div className="whitespace-pre-wrap break-words">
              {doUsuario ? mensagem.conteudo : <TextoDaIA texto={mensagem.conteudo} />}
            </div>
          )}

          <div
            className={cn(
              'mt-1 flex items-center justify-end gap-1 text-[0.6875rem] leading-none',
              doUsuario
                ? 'text-primary-foreground/70'
                : recusa
                  ? 'text-destructive/70'
                  : 'text-muted-foreground',
            )}
          >
            {/* O microfone marca o que foi ditado: quando a transcrição erra um
                valor, quem lê precisa reconhecer que aquilo foi falado. */}
            {mensagem.origem === 'AUDIO' && (
              <>
                <Mic className="size-3" aria-hidden />
                <span className="sr-only">{t('chat.message.fromAudio')}</span>
              </>
            )}
            <time dateTime={mensagem.criadaEm}>{horario}</time>
          </div>
        </div>
      </div>

      {doUsuario && <div aria-hidden>{avatar}</div>}
    </div>
  )
}
