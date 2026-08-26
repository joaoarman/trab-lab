import { useTranslation } from 'react-i18next'
import { Pipette } from 'lucide-react'

import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/lib/utils'

/**
 * A paleta sugerida para as categorias.
 *
 * **Sim, são hexadecimais escritos à mão, e não é uma violação do tema.** O
 * `src/theme.css` é a fonte única da IDENTIDADE do sistema (o que é clicável, o
 * que é dinheiro que entra, o que é perigo) — e nada disso está em jogo aqui. A
 * cor de uma categoria é **dado do usuário**: ela vai para uma coluna do banco,
 * viaja na resposta da API e é escolhida por quem usa. Um token do tema não
 * poderia ser gravado numa coluna nem sobreviveria a uma troca de paleta.
 *
 * O critério da escolha foi contraste: cada tom precisa se distinguir dos
 * vizinhos como um pontinho de 10px, e continuar legível no fundo areia do tema
 * claro **e** no grafite do escuro. Por isso são tons médios — nada muito claro
 * (some no claro) nem muito escuro (some no escuro).
 */
const PALETA = [
  '#10b981', // esmeralda
  '#14b8a6', // teal
  '#0ea5e9', // céu
  '#6366f1', // índigo
  '#8b5cf6', // violeta
  '#ec4899', // rosa
  '#f43f5e', // framboesa
  '#ef4444', // vermelho
  '#f97316', // laranja
  '#f59e0b', // âmbar
  '#84cc16', // lima
  '#64748b', // ardósia
] as const

/**
 * A cor que já vem escolhida ao criar uma categoria.
 *
 * Gira pela paleta conforme a árvore cresce, em vez de sortear ou de repetir
 * sempre a primeira: assim as categorias de uma pessoa saem naturalmente
 * variadas sem que ela precise decidir nada — e quem quiser decidir, decide.
 */
export function corSugerida(quantasJaExistem: number): string {
  return PALETA[quantasJaExistem % PALETA.length]
}

/**
 * Escolher a cor da categoria: a paleta pronta num clique, ou uma cor livre.
 *
 * Os dois caminhos existem porque atendem gente diferente na mesma tela. A
 * paleta resolve o caso comum sem tirar a mão do fluxo — o normal é a pessoa só
 * querer que "Carro" não seja da mesma cor de "Casa". O seletor livre é a saída
 * para quem tem uma cor em mente, e é ele que dá sentido à coluna ser um
 * hexadecimal em vez de uma lista fechada.
 */
export function SeletorDeCor({
  valor,
  onValor,
  desabilitado,
}: {
  valor: string
  onValor: (cor: string) => void
  desabilitado?: boolean
}) {
  const { t } = useTranslation()
  const ehDaPaleta = (PALETA as readonly string[]).includes(valor)

  return (
    <div className="space-y-2">
      <Label>{t('categories.color.label')}</Label>

      <div className="flex flex-wrap items-center gap-2">
        {PALETA.map((cor) => (
          <button
            key={cor}
            type="button"
            disabled={desabilitado}
            onClick={() => onValor(cor)}
            aria-label={t('categories.color.pick', { hex: cor })}
            aria-pressed={valor === cor}
            className={cn(
              'size-7 rounded-full ring-offset-background transition-transform',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              // A seleção é um anel, e não um "check" desenhado por cima: um
              // ícone teria que ser claro em cima do âmbar e escuro em cima do
              // índigo, e erraria o contraste em metade da paleta.
              valor === cor
                ? 'ring-2 ring-ring ring-offset-2'
                : 'hover:scale-110 enabled:cursor-pointer',
            )}
            style={{ backgroundColor: cor }}
          />
        ))}

        {/* A cor livre. O <input type="color"> nativo cobre o botão, invisível:
            é ele quem abre o seletor do sistema operacional, e assim o clique
            funciona em qualquer navegador sem depender de `label for`. */}
        <span
          className={cn(
            'relative grid size-7 place-items-center rounded-full border border-dashed border-input',
            'ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            desabilitado && 'cursor-not-allowed opacity-50',
            ehDaPaleta ? 'text-muted-foreground' : 'border-solid ring-2 ring-ring ring-offset-2',
          )}
          style={ehDaPaleta ? undefined : { backgroundColor: valor }}
        >
          {ehDaPaleta && <Pipette className="size-3.5" aria-hidden />}
          <input
            type="color"
            value={valor}
            disabled={desabilitado}
            onChange={(evento) => onValor(evento.target.value)}
            aria-label={t('categories.color.customLabel')}
            title={t('categories.color.custom')}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </span>
      </div>
    </div>
  )
}
