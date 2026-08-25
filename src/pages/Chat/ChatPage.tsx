import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'

/**
 * O Chat — o coração do Self OS, e a tela em que o usuário cai ao entrar.
 *
 * É uma **rota de tela cheia** (ver `ROTAS_DE_TELA_CHEIA`, no AppLayout): o shell
 * não aplica margem nem largura máxima aqui, porque a conversa vai de borda a
 * borda e quem rola é a lista de mensagens — não a janela. Em troca, o
 * enquadramento é aplicado **por dentro** (`max-w-content` / `px-content`), senão
 * a leitura atravessaria um monitor largo de ponta a ponta.
 *
 * `h-full` + `min-h-0` + `overflow-y-auto` é o trio que faz a rolagem acontecer
 * aqui dentro: sem o `min-h-0`, um item de flex nunca encolhe abaixo do próprio
 * conteúdo, e a lista empurraria a página em vez de rolar.
 *
 * Quando o módulo for implementado, esta estrutura permanece e o que muda é o
 * miolo: a lista de bolhas ocupa a área que rola, e o compositor (texto + botão
 * de gravar áudio) fica ancorado no pé, fora dela.
 */
export function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-content px-content py-content">
          <ModulePlaceholder
            stepKeys={[
              'chat.placeholder.step1',
              'chat.placeholder.step2',
              'chat.placeholder.step3',
              'chat.placeholder.step4',
            ]}
          />
        </div>
      </div>
    </div>
  )
}
