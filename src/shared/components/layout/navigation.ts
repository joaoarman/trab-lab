import {
  MessageCircle,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  FolderTree,
  ScrollText,
  UserRound,
  Presentation,
  Landmark,
  Users,
  CalendarDays,
  Dumbbell,
  UtensilsCrossed,
  ListChecks,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  labelKey: string
  subtitleKey: string
  icon: LucideIcon
  bottomNav?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/chat',
    labelKey: 'nav.chat',
    subtitleKey: 'nav.chatSubtitle',
    icon: MessageCircle,
  },
  {
    to: '/statement',
    labelKey: 'nav.statement',
    subtitleKey: 'nav.statementSubtitle',
    icon: Wallet,
  },
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

// Sem `to`: é o que garante, no tipo, que uma ideia nunca vire link.
export interface ModuloFuturo {
  labelKey: string
  icon: LucideIcon
}

export const MODULOS_FUTUROS: ModuloFuturo[] = [
  { labelKey: 'nav.openFinance', icon: Landmark },
  { labelKey: 'nav.family', icon: Users },
  { labelKey: 'nav.agenda', icon: CalendarDays },
  { labelKey: 'nav.workouts', icon: Dumbbell },
  { labelKey: 'nav.meals', icon: UtensilsCrossed },
  { labelKey: 'nav.tasks', icon: ListChecks },
]

export const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => item.bottomNav !== false)

export const ROTA_DA_CONTA = '/account'

export const ROTA_DOS_SLIDES = '/slides'

export const ROTAS_AUXILIARES: NavItem[] = [
  {
    to: ROTA_DA_CONTA,
    labelKey: 'account.page.title',
    subtitleKey: 'account.page.description',
    icon: UserRound,
  },
  {
    to: ROTA_DOS_SLIDES,
    labelKey: 'slides.page.title',
    subtitleKey: 'slides.page.subtitle',
    icon: Presentation,
  },
]

export function findActiveItem(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS, ...ROTAS_AUXILIARES].find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  )
}
