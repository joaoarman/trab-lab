import {
  MessageCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  FolderTree,
  ScrollText,
  UserRound,
  Landmark,
  Users,
  CalendarDays,
  Dumbbell,
  UtensilsCrossed,
  ListChecks,
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

/**
 * Um módulo que **ainda não existe**: aparece na sidebar, rotulado "em breve", e
 * não é clicável.
 *
 * Não é um `NavItem` de propósito — não tem `to`. Um item de navegação sem rota
 * é uma contradição, e dar a ele uma rota falsa (`#`, `/em-breve`) colocaria no
 * roteador uma tela que ninguém escreveu: o clique levaria a lugar nenhum e o
 * usuário teria que usar o "voltar" para desfazer um caminho que o produto
 * prometeu e não cumpre. Aqui o item é **apenas um rótulo com ícone**, e a
 * ausência de `to` é o que garante, no tipo, que ele nunca vire link.
 *
 * O que ele comunica é o desenho do Self OS: o financeiro é o primeiro módulo de
 * um sistema operacional da vida pessoal, não o produto inteiro. Sem esta lista,
 * quem abre o app pela primeira vez lê "Self OS" e vê um app de gastos.
 */
export interface ModuloFuturo {
  /** Chave i18n do rótulo curto. */
  labelKey: string
  icon: LucideIcon
}

/**
 * Os próximos módulos, na ordem em que aparecem no pé da sidebar.
 *
 * Ficam **só na sidebar**: a barra inferior do celular divide a largura do
 * aparelho entre as abas, e gastar uma delas com algo que não abre encolheria as
 * que se usam todo dia — o mesmo critério que já deixa o Log da IA fora dela.
 */
export const MODULOS_FUTUROS: ModuloFuturo[] = [
  { labelKey: 'nav.openFinance', icon: Landmark },
  { labelKey: 'nav.family', icon: Users },
  { labelKey: 'nav.agenda', icon: CalendarDays },
  { labelKey: 'nav.workouts', icon: Dumbbell },
  { labelKey: 'nav.meals', icon: UtensilsCrossed },
  { labelKey: 'nav.tasks', icon: ListChecks },
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
