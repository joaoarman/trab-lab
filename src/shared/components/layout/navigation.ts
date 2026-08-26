import {
  MessageCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  FolderTree,
  ScrollText,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Um item de navegação do shell — usado ao mesmo tempo pela sidebar (desktop e
 * gaveta do mobile) e pela barra inferior, para que as três nunca saiam de
 * sincronia.
 *
 * `labelKey` também é o título da página exibido no header: um texto só, num
 * lugar só. Nenhum rótulo aqui é literal — todos são chaves de i18n.
 */
export interface NavItem {
  /** Rota da página (o mesmo `path` registrado no App.tsx). */
  to: string
  /** Chave i18n do rótulo curto (sidebar, gaveta, barra inferior e título do header). */
  labelKey: string
  /** Chave i18n da linha de apoio mostrada no header. */
  subtitleKey: string
  icon: LucideIcon
  /**
   * Se o item também ocupa uma aba na barra inferior do celular. Padrão: sim.
   *
   * Existe porque a sidebar e a barra inferior têm **capacidades diferentes**. A
   * sidebar é uma coluna: cabe o sistema inteiro, e um módulo a mais não tira
   * espaço de ninguém. A barra inferior divide a largura do aparelho entre as
   * abas — cada uma a mais **encolhe** as que se usam todo dia.
   *
   * Então o critério não é "é um módulo?", é **com que frequência se usa**. O Log
   * da IA é auditoria: abre-se para conferir consumo, não no meio do dia. Dar a
   * ele uma das abas seria pagar espaço todo dia por um toque que acontece uma
   * vez por mês — no celular ele é alcançado pela gaveta.
   */
  bottomNav?: boolean
}

/**
 * O mapa do sistema, na ordem em que aparece.
 *
 * O **Chat vem primeiro e é a rota inicial** (`/` redireciona para cá, no
 * App.tsx): ele não é mais um módulo, é o jeito pretendido de usar o Self OS. As
 * outras telas existem para **ver, revisar e ajustar** o que a conversa gera —
 * não para serem o caminho obrigatório de entrada de dados.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/chat',
    labelKey: 'nav.chat',
    subtitleKey: 'nav.chatSubtitle',
    icon: MessageCircle,
  },
  // A SETA SEGUE O DINHEIRO, e não a lista: gasto é o que **sai** (para baixo),
  // receita é o que **entra** (para cima). É o mesmo sentido que o par
  // `--expense`/`--income` do tema já comunica pela cor — se o ícone apontar para
  // o outro lado, os dois sinais passam a brigar e o item de menu fica ambíguo
  // justamente para quem bate o olho sem ler o rótulo.
  {
    to: '/expenses',
    labelKey: 'nav.expenses',
    subtitleKey: 'nav.expensesSubtitle',
    icon: ArrowDownCircle,
  },
  {
    to: '/income',
    labelKey: 'nav.income',
    subtitleKey: 'nav.incomeSubtitle',
    icon: ArrowUpCircle,
  },
  {
    to: '/categories',
    labelKey: 'nav.categories',
    subtitleKey: 'nav.categoriesSubtitle',
    icon: FolderTree,
  },
  {
    to: '/ai-log',
    labelKey: 'nav.log',
    subtitleKey: 'nav.logSubtitle',
    icon: ScrollText,
    bottomNav: false,
  },
]

/** Os itens que ocupam uma aba na barra inferior do celular. */
export const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => item.bottomNav !== false)

/**
 * Telas que têm título no header mas **não** aparecem na navegação.
 *
 * "Minha conta" se alcança pelo menu do usuário, não pelo menu do sistema — ela
 * não é um módulo do Self OS, é a configuração de quem está usando. Mas continua
 * precisando de um título no header como qualquer outra tela, e o título tem que
 * sair do mesmo lugar que os demais: senão a rota cairia no nome do produto e a
 * página teria que escrever o próprio cabeçalho, que é justamente o que este
 * arquivo existe para evitar.
 */
export const ROTA_DA_CONTA = '/account'

export const ROTAS_AUXILIARES: NavItem[] = [
  {
    to: ROTA_DA_CONTA,
    labelKey: 'account.page.title',
    subtitleKey: 'account.page.description',
    icon: UserRound,
  },
]

/**
 * Qual item corresponde à rota atual — é dele que o header tira o título.
 *
 * Compara com `startsWith` além da igualdade para que uma rota filha (ex.:
 * `/expenses/123`) continue apontando para o módulo pai, em vez de deixar o header
 * sem título.
 */
export function findActiveItem(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS, ...ROTAS_AUXILIARES].find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
}
