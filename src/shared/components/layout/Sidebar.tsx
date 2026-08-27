import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Brand } from './Brand'
import { UserMenu } from './UserMenu'
import { NAV_ITEMS, MODULOS_FUTUROS, type NavItem, type ModuloFuturo } from './navigation'

/**
 * A navegação lateral. **Um componente, dois papéis** — de propósito:
 *
 *  • no desktop (lg+) é uma coluna fixa à esquerda, sempre visível;
 *  • no celular é uma **gaveta** que entra por cima, aberta pelo botão do header.
 *
 * A alternativa seria duas listas de links, uma para cada caso. Elas divergiriam:
 * um módulo novo entraria numa e seria esquecido na outra. Aqui a lista é a mesma
 * (`NAV_ITEMS`) e o que muda é só o invólucro.
 *
 * A gaveta mostra o sistema INTEIRO, inclusive o que a barra inferior não
 * comporta (o Log da IA) — é ela quem garante que nada fique inalcançável no
 * celular por falta de aba.
 */
function ModuleLink({ item, onNavegar }: { item: NavItem; onNavegar?: () => void }) {
  const { t } = useTranslation()

  return (
    <NavLink
      to={item.to}
      onClick={onNavegar}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium outline-none ring-ring transition-colors focus-visible:ring-2',
          isActive
            ? 'bg-primary-muted text-primary-muted-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <item.icon className="size-5 shrink-0" aria-hidden />
      {t(item.labelKey)}
    </NavLink>
  )
}

/**
 * Um módulo que ainda não abre: o mesmo desenho de linha dos outros, mas em
 * `<div>` e não em `<NavLink>`.
 *
 * Não é um botão desabilitado. Um `<button disabled>` promete uma ação que
 * existe e está momentaneamente fora do ar — não é o caso: não há para onde ir.
 * Como não é elemento interativo, ele também **sai da navegação por Tab** sem
 * precisar de `tabIndex={-1}`, e o leitor de tela lê "Agenda, em breve" como um
 * texto, não como um controle quebrado.
 *
 * O rótulo fica em `text-muted-foreground/70`: um degrau abaixo do resto da
 * lista, para que a diferença entre "o que abre" e "o que ainda não abre" seja
 * visível antes de se ler a badge.
 */
function ModuloFuturoLink({ item }: { item: ModuloFuturo }) {
  const { t } = useTranslation()

  return (
    <div className="flex cursor-not-allowed select-none items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground/70">
      <item.icon className="size-5 shrink-0" aria-hidden />
      <span className="truncate">{t(item.labelKey)}</span>
      {/* Sem `uppercase`/`tracking` aqui, ao contrário do título do grupo: o
          rótulo ficou longo, e caixa alta com espaçamento roubaria da largura
          que sobra para o nome do módulo — numa coluna de 16rem é a diferença
          entre ler "Alimentação" e ler "Alimentaç…". */}
      <Badge
        variant="secondary"
        className="ml-auto shrink-0 px-1.5 py-0 text-[0.625rem] font-semibold"
      >
        {t('nav.comingSoon')}
      </Badge>
    </div>
  )
}

/** O miolo da coluna — igual nos dois papéis. */
function Conteudo({ onNavegar }: { onNavegar?: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <nav
        aria-label={t('nav.primaryLabel')}
        className="flex flex-1 flex-col overflow-y-auto px-3 py-4"
      >
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <ModuleLink key={item.to} item={item} onNavegar={onNavegar} />
          ))}
        </div>

        {/* Os próximos módulos ficam colados no PÉ da navegação (`mt-auto`), e
            não logo abaixo do último item: o que já funciona tem que continuar
            sendo o bloco que se lê primeiro. Quando a coluna é curta demais para
            o espaço sobrar, o `mt-auto` simplesmente não empurra nada e a lista
            rola — nunca cobre o que está acima. */}
        <div className="mt-auto space-y-1 pt-8">
          <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {t('nav.upcoming')}
          </p>
          {MODULOS_FUTUROS.map((item) => (
            <ModuloFuturoLink key={item.labelKey} item={item} />
          ))}
        </div>
      </nav>

      {/* O usuário (com tema e idioma dentro) fica no PÉ da coluna: é destino de
          configuração, não de uso diário — o topo pertence à navegação. */}
      <div className="border-t border-border p-3">
        <UserMenu />
      </div>
    </>
  )
}

export function Sidebar({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const { t } = useTranslation()
  const painel = useRef<HTMLDivElement>(null)

  // Esc fecha a gaveta. É o gesto que todo mundo tenta antes de procurar o "X",
  // e sem ele o teclado fica preso atrás de um painel que só o mouse desfaz.
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberta, onFechar])

  // Ao abrir, o foco vai para dentro do painel. Sem isto ele continua no botão
  // do header, atrás da gaveta: quem navega por teclado abriria o menu e daria
  // Tab dentro do conteúdo escondido.
  useEffect(() => {
    if (aberta) painel.current?.focus()
  }, [aberta])

  return (
    <>
      {/* ---- Desktop: coluna fixa ---- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-4">
          <Brand />
        </div>
        <Conteudo />
      </aside>

      {/* ---- Mobile: gaveta ----
          Fica sempre montada e apenas deslizada para fora da tela, em vez de
          desmontada: é o que dá a animação de entrada E de saída (um componente
          que some do DOM não tem como animar a própria saída). `invisible` +
          `pointer-events-none` garantem que, fechada, ela não receba clique nem
          apareça na navegação por Tab. */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          aberta ? 'visible' : 'pointer-events-none invisible',
        )}
        aria-hidden={!aberta}
      >
        {/* O véu escurece e captura o clique fora — o jeito mais rápido de fechar. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={t('nav.closeMenu')}
          onClick={onFechar}
          className={cn(
            'absolute inset-0 bg-foreground/40 transition-opacity duration-200',
            aberta ? 'opacity-100' : 'opacity-0',
          )}
        />

        <div
          ref={painel}
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.primaryLabel')}
          tabIndex={-1}
          className={cn(
            'absolute inset-y-0 left-0 flex w-[17rem] max-w-[85%] flex-col border-r border-border bg-card shadow-xl outline-none transition-transform duration-200 ease-out',
            aberta ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
            <Brand />
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto shrink-0"
              aria-label={t('nav.closeMenu')}
              onClick={onFechar}
            >
              <X className="size-5" aria-hidden />
            </Button>
          </div>
          {/* Tocar num módulo fecha a gaveta: a gaveta cobre a tela para onde o
              toque acabou de levar, e deixá-la aberta obrigaria a um segundo
              gesto só para ver o que já foi pedido. */}
          <Conteudo onNavegar={onFechar} />
        </div>
      </div>
    </>
  )
}
