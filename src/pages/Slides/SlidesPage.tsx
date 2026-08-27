import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, List, Maximize, Minimize } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { SLIDES, TOTAL_DE_SLIDES } from './slides'

const ARRASTO_MINIMO = 56

export function SlidesPage() {
  const { t } = useTranslation()
  const [atual, setAtual] = useState(0)
  const [emTelaCheia, setEmTelaCheia] = useState(false)
  const palco = useRef<HTMLDivElement>(null)
  const toqueInicial = useRef<{ x: number; y: number } | null>(null)

  const irPara = useCallback((indice: number) => {
    setAtual(Math.min(Math.max(indice, 0), TOTAL_DE_SLIDES - 1))
  }, [])

  const anterior = useCallback(() => setAtual((i) => Math.max(i - 1, 0)), [])
  const proximo = useCallback(() => setAtual((i) => Math.min(i + 1, TOTAL_DE_SLIDES - 1)), [])

  const alternarTelaCheia = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void palco.current?.requestFullscreen()
  }, [])

  useEffect(() => {
    const aoMudar = () => setEmTelaCheia(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', aoMudar)
    return () => document.removeEventListener('fullscreenchange', aoMudar)
  }, [])

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      switch (evento.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          evento.preventDefault()
          proximo()
          break
        case 'ArrowLeft':
        case 'PageUp':
          evento.preventDefault()
          anterior()
          break
        case 'Home':
          evento.preventDefault()
          irPara(0)
          break
        case 'End':
          evento.preventDefault()
          irPara(TOTAL_DE_SLIDES - 1)
          break
        case 'f':
        case 'F':
          evento.preventDefault()
          alternarTelaCheia()
          break
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [anterior, proximo, irPara, alternarTelaCheia])

  const slide = SLIDES[atual]
  const podeTelaCheia = typeof document !== 'undefined' && document.fullscreenEnabled

  return (
    <div ref={palco} className="flex h-full flex-col bg-background">
      <div className="h-1 shrink-0 bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${((atual + 1) / TOTAL_DE_SLIDES) * 100}%` }}
        />
      </div>

      <div
        className="min-h-0 flex-1"
        onTouchStart={(evento) => {
          const toque = evento.changedTouches[0]
          toqueInicial.current = { x: toque.clientX, y: toque.clientY }
        }}
        onTouchEnd={(evento) => {
          const inicio = toqueInicial.current
          if (!inicio) return
          toqueInicial.current = null
          const toque = evento.changedTouches[0]
          const dx = toque.clientX - inicio.x
          const dy = toque.clientY - inicio.y
          if (Math.abs(dx) < ARRASTO_MINIMO || Math.abs(dx) <= Math.abs(dy)) return
          if (dx < 0) proximo()
          else anterior()
        }}
      >
        <div key={slide.id} className="mx-auto h-full w-full max-w-content">
          {slide.render()}
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-3 py-2 sm:px-5">
        <Button
          variant="ghost"
          size="icon"
          onClick={anterior}
          disabled={atual === 0}
          aria-label={t('slides.ui.previous')}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <List className="size-4" aria-hidden />
              <span className="font-mono text-xs">
                {t('slides.ui.counter', { atual: atual + 1, total: TOTAL_DE_SLIDES })}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-64 overflow-y-auto">
            {SLIDES.map((item, indice) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => irPara(indice)}
                className={cn('gap-2', indice === atual && 'bg-accent')}
              >
                <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                  {indice + 1}
                </span>
                <span className="truncate">{t(item.titleKey)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <p className="hidden flex-1 text-center text-xs text-muted-foreground lg:block">
          {t('slides.ui.hint')}
        </p>
        <div className="flex-1 lg:hidden" />

        {podeTelaCheia && (
          <Button
            variant="ghost"
            size="icon"
            onClick={alternarTelaCheia}
            aria-label={emTelaCheia ? t('slides.ui.exitFullscreen') : t('slides.ui.fullscreen')}
          >
            {emTelaCheia ? (
              <Minimize className="size-5" aria-hidden />
            ) : (
              <Maximize className="size-5" aria-hidden />
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={proximo}
          disabled={atual === TOTAL_DE_SLIDES - 1}
          aria-label={t('slides.ui.next')}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </footer>
    </div>
  )
}
