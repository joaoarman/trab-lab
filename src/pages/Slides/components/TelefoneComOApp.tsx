import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleDollarSign, Mic, Sparkles } from 'lucide-react'

/*
  Os dois telefones do slide do PWA, desenhados com a UI do próprio app.

  Pelo mesmo motivo dos diagramas: print de tela
  não segue o tema nem o idioma. Aqui é mais forte ainda, porque o conteúdo do
  telefone da direita usa as MESMAS chaves de i18n da tela de Chat de verdade
  (`chat.welcome.*`, `chat.composer.placeholder`). Mexeu no texto da tela, o
  mockup muda junto; nunca há um slide mostrando uma tela que não existe mais.
*/

function Moldura({ children, legenda }: { children: ReactNode; legenda: string }) {
  return (
    // A largura fica na <figure>, e não na moldura: sem isso a legenda (que é
    // uma frase inteira) estica o figure em max-content e empurra o telefone
    // vizinho para fora da tela no celular.
    <figure className="flex w-[8.5rem] shrink-0 flex-col items-center gap-2.5 sm:w-[9.5rem] lg:w-[11rem]">
      <div className="relative w-full rounded-[1.75rem] border-[3px] border-foreground/25 bg-background p-1 shadow-lg">
        {/* A ilha da câmera: é ela que faz o desenho ser lido como "um iPhone". */}
        <span
          className="absolute left-1/2 top-2 z-10 h-2 w-10 -translate-x-1/2 rounded-full bg-foreground/70 lg:h-2.5 lg:w-12"
          aria-hidden
        />
        <div className="aspect-[9/19] overflow-hidden rounded-[1.4rem]">{children}</div>
      </div>
      <figcaption className="text-balance text-center text-xs leading-snug text-muted-foreground sm:text-sm">
        {legenda}
      </figcaption>
    </figure>
  )
}

/* A barra de status, sem relógio de mentira: formas, e não texto inventado. */
function BarraDeStatus() {
  return (
    <div className="flex items-center justify-between px-3 pb-1 pt-3" aria-hidden>
      <span className="h-1.5 w-6 rounded-full bg-current opacity-60" />
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-3 rounded-sm bg-current opacity-60" />
        <span className="h-1.5 w-4 rounded-sm bg-current opacity-40" />
      </span>
    </div>
  )
}

function IconeDoApp({ destacado = false }: { destacado?: boolean }) {
  if (!destacado) return <span className="aspect-square rounded-[0.65rem] bg-foreground/20" />

  return (
    <span className="grid aspect-square place-items-center rounded-[0.65rem] bg-primary text-primary-foreground shadow-md ring-2 ring-background">
      <CircleDollarSign className="size-5 lg:size-6" strokeWidth={2.5} aria-hidden />
    </span>
  )
}

export function TelefoneNaTelaDeInicio({ legenda }: { legenda: string }) {
  return (
    <Moldura legenda={legenda}>
      <div className="flex h-full flex-col bg-gradient-to-br from-primary/25 via-accent to-primary-muted text-foreground">
        <BarraDeStatus />

        <div className="grid flex-1 grid-cols-4 content-start gap-2 p-3">
          {Array.from({ length: 12 }, (_, indice) => (
            <IconeDoApp key={indice} />
          ))}
        </div>

        {/* A dock: onde vai o que se abre todo dia, e é lá que o Self OS fica. */}
        <div className="m-2 grid grid-cols-4 gap-2 rounded-[1rem] bg-background/40 p-2 backdrop-blur">
          <IconeDoApp />
          <IconeDoApp destacado />
          <IconeDoApp />
          <IconeDoApp />
        </div>
      </div>
    </Moldura>
  )
}

export function TelefoneComOChat({ legenda }: { legenda: string }) {
  const { t } = useTranslation()

  return (
    <Moldura legenda={legenda}>
      <div className="flex h-full flex-col bg-background text-foreground">
        <BarraDeStatus />

        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 text-center">
          <span className="grid size-7 place-items-center rounded-full bg-primary-muted text-primary-muted-foreground lg:size-8">
            <Sparkles className="size-3.5 lg:size-4" aria-hidden />
          </span>
          <p className="text-balance font-display text-[0.6rem] font-semibold leading-tight lg:text-xs">
            {t('chat.welcome.title')}
          </p>

          <div className="mt-1 w-full space-y-1">
            {['chat.welcome.examples.expense', 'chat.welcome.examples.query'].map((chave) => (
              <p
                key={chave}
                className="truncate rounded-md border border-border px-2 py-1.5 text-left text-[0.5rem] leading-none text-muted-foreground lg:text-[0.6rem]"
              >
                {t(chave)}
              </p>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 border-t border-border p-2">
          <span className="min-w-0 flex-1 truncate rounded-full border border-border px-2 py-1.5 text-left text-[0.5rem] text-muted-foreground lg:text-[0.6rem]">
            {t('chat.composer.placeholder')}
          </span>
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground lg:size-7">
            <Mic className="size-3 lg:size-3.5" aria-hidden />
          </span>
        </div>

        {/* A barra de gestos: sem barra de endereço em cima dela, que é o ponto. */}
        <span className="mx-auto mb-1.5 h-1 w-12 rounded-full bg-foreground/40" aria-hidden />
      </div>
    </Moldura>
  )
}
