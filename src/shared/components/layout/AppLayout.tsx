import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/shared/lib/utils'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { useTravaDeRolagem } from './useTravaDeRolagem'

const ROTAS_DE_TELA_CHEIA = ['/chat', '/slides']

export function AppLayout() {
  const { pathname } = useLocation()
  const [menuAberto, setMenuAberto] = useState(false)
  const telaCheia = ROTAS_DE_TELA_CHEIA.includes(pathname)

  useEffect(() => setMenuAberto(false), [pathname])

  useTravaDeRolagem(telaCheia || menuAberto)

  return (
    <div
      className={cn(
        'bg-background text-foreground',
        telaCheia ? 'fixed inset-x-0 top-0 h-viewport overflow-hidden' : 'min-h-screen',
      )}
    >
      <Sidebar aberta={menuAberto} onFechar={() => setMenuAberto(false)} />

      <div className={cn('flex flex-col lg:pl-64', telaCheia ? 'h-full' : 'min-h-screen')}>
        <Header onAbrirMenu={() => setMenuAberto(true)} />

        <main
          className={cn(
            'flex-1 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] lg:pb-0',
            telaCheia && 'min-h-0 overflow-hidden',
          )}
        >
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
