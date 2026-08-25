import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/shared/lib/utils'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { useTravaDeRolagem } from './useTravaDeRolagem'

/**
 * O shell do sistema — desktop e celular com o mesmo peso:
 *  • desktop (lg+): sidebar fixa à esquerda + header;
 *  • celular: header com botão de menu (a sidebar vira gaveta) + barra de abas
 *    embaixo, com cara de app.
 *
 * O miolo respeita o enquadramento do tema (`max-w-content` / `px-content`), então
 * mudar a densidade no `src/theme.css` reflete no app inteiro.
 */

/**
 * Rotas em que a PÁGINA **é** a tela: ela ocupa a altura da janela e rola por
 * dentro (em vez de crescer para baixo e deixar a janela rolar) e recebe a
 * largura inteira, **sem o enquadramento** que o shell dá às demais.
 *
 * As duas coisas são a mesma decisão, e por isso uma lista só. Numa página comum
 * o conteúdo é um bloco dentro do app: tem respiro em volta, largura máxima, e a
 * janela rola. Numa página assim não há "em volta" — a superfície do módulo vai
 * de borda a borda, e quem rola é ela.
 *
 * Hoje só o Chat, e é da natureza dele: a conversa não termina, o campo de
 * escrever fica ancorado embaixo (se quem rolasse fosse a janela, ele subiria
 * junto com o texto e sumiria justamente quando o usuário fosse responder) e a
 * conversa é a tela — no celular, um miolo com margem em volta pareceria uma
 * página dentro do app, em vez de um aplicativo de mensagem.
 *
 * O enquadramento não some: ele **desce** para dentro da página, onde é o texto
 * que precisa dele (a lista e o compositor do chat mantêm `max-w-content`, então
 * a leitura não atravessa um monitor largo). O que fica de borda a borda são os
 * fundos e as bordas.
 *
 * ## O celular: `100vh` mente, e o shell sai do fluxo
 *
 * 1. **A altura é `100dvh`, não `100vh`** (`h-viewport`, definida no
 *    `index.css`). No iOS, `100vh` é a janela com as barras do navegador
 *    recolhidas — sempre maior que o visível enquanto a barra está na tela. O
 *    resultado seria o campo de escrever do chat cortado atrás da barra do
 *    Safari.
 * 2. **O shell fica `fixed`** nessas rotas. Elemento fixo não entra na altura do
 *    documento, então a página não tem como ficar mais alta que a tela e a
 *    rolagem "de fora" deixa de existir — sem isso a tela toda arrasta junto com
 *    a conversa no iPhone, e acertar a rolagem de dentro vira sorte.
 */
const ROTAS_DE_TELA_CHEIA = ['/chat']

export function AppLayout() {
  const { pathname } = useLocation()
  const [menuAberto, setMenuAberto] = useState(false)
  const telaCheia = ROTAS_DE_TELA_CHEIA.includes(pathname)

  // A gaveta fecha ao mudar de rota. Ela mesma já fecha no clique do link, mas
  // isto pega o que passa por fora: o botão de voltar do navegador e qualquer
  // navegação disparada por código.
  useEffect(() => setMenuAberto(false), [pathname])

  // A segunda tranca da rolagem, depois do `fixed` — o porquê de serem duas está
  // no próprio hook. Vale para a gaveta aberta E para as rotas de tela cheia.
  useTravaDeRolagem(telaCheia || menuAberto)

  return (
    <div
      className={cn(
        'bg-background text-foreground',
        telaCheia
          ? // Três coisas, e cada uma tira um jeito de a janela rolar:
            //
            // `fixed inset-x-0 top-0` tira o shell do fluxo do documento. Um
            // elemento fixo não conta para a altura da página, então não existe
            // conteúdo que possa deixá-la mais alta que a tela.
            //
            // `h-viewport` é a altura VISÍVEL (`100dvh`, ver `index.css`), e não
            // `100vh`: no celular a segunda é maior que a tela enquanto a barra
            // do navegador estiver aparecendo, e o pé do layout ficaria atrás dela.
            //
            // `overflow-hidden` fica para o que passar da altura por dentro: quem
            // rola é quem tiver `overflow-y-auto`, e mais ninguém.
            'fixed inset-x-0 top-0 h-viewport overflow-hidden'
          : 'min-h-screen',
      )}
    >
      <Sidebar aberta={menuAberto} onFechar={() => setMenuAberto(false)} />

      <div className={cn('flex flex-col lg:pl-64', telaCheia ? 'h-full' : 'min-h-screen')}>
        <Header onAbrirMenu={() => setMenuAberto(true)} />

        {/* O `pb` no celular é a barra inferior + a área segura do aparelho. A
            altura da barra vem do MESMO token que ela usa para se medir
            (`--bottom-nav-height`, no src/theme.css). */}
        <main
          className={cn(
            'flex-1 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] lg:pb-0',
            // `min-h-0` é o que permite este filho ENCOLHER: sem ele, um item de
            // flex nunca fica menor que o próprio conteúdo, e a rolagem interna
            // da conversa não aconteceria — ela empurraria a página.
            telaCheia && 'min-h-0 overflow-hidden',
          )}
        >
          {/* O enquadramento (largura máxima + respiro) é o que faz uma página
              parecer um bloco DENTRO do app. Numa rota de tela cheia ele não é
              aplicado aqui: a página recebe a largura toda e distribui o
              enquadramento por dentro, onde ele importa. */}
          <div
            className={cn(
              telaCheia ? 'h-full' : 'mx-auto w-full max-w-content px-content py-content',
            )}
          >
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  )
}
