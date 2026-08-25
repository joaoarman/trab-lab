import { MessageCircle, ArrowDownCircle, ArrowUpCircle, FolderTree, ScrollText } from 'lucide-react'
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
  {
    to: '/gastos',
    labelKey: 'nav.expenses',
    subtitleKey: 'nav.expensesSubtitle',
    icon: ArrowUpCircle,
  },
  {
    to: '/receitas',
    labelKey: 'nav.income',
    subtitleKey: 'nav.incomeSubtitle',
    icon: ArrowDownCircle,
  },
  {
    to: '/categorias',
    labelKey: 'nav.categories',
    subtitleKey: 'nav.categoriesSubtitle',
    icon: FolderTree,
  },
  {
    to: '/log',
    labelKey: 'nav.log',
    subtitleKey: 'nav.logSubtitle',
    icon: ScrollText,
    bottomNav: false,
  },
]

/** Os itens que ocupam uma aba na barra inferior do celular. */
export const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => item.bottomNav !== false)

/**
 * Qual item corresponde à rota atual — é dele que o header tira o título.
 *
 * Compara com `startsWith` além da igualdade para que uma rota filha (ex.:
 * `/gastos/123`) continue apontando para o módulo pai, em vez de deixar o header
 * sem título.
 */
export function findActiveItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
}
