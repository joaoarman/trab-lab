import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Config base do Tailwind. Aqui só se MAPEIA CSS variables (de src/theme.css) para
// utilitários — nunca valores. A UI do projeto é o shadcn/ui, em src/shared/components/ui/
// (ver components.json); o mapeamento de cores por CSS variables (bg-primary,
// text-muted-foreground…), as famílias de fonte e o enquadramento do conteúdo estão abaixo,
// todos apontando para as variáveis do theme.css.
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          muted: 'hsl(var(--primary-muted))',
          'muted-foreground': 'hsl(var(--primary-muted-foreground))',
        },
        // Dinheiro que ENTRA e dinheiro que SAI. O par semântico do sistema —
        // por que não são primary/destructive está no cabeçalho do theme.css.
        income: {
          DEFAULT: 'hsl(var(--income))',
          foreground: 'hsl(var(--income-foreground))',
          muted: 'hsl(var(--income-muted))',
        },
        expense: {
          DEFAULT: 'hsl(var(--expense))',
          foreground: 'hsl(var(--expense-foreground))',
          muted: 'hsl(var(--expense-muted))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          muted: 'hsl(var(--destructive-muted))',
        },
        // Atenção (âmbar): "isto ainda não está salvo". Por que não é
        // destructive nem expense está no theme.css.
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          muted: 'hsl(var(--warning-muted))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        display: 'var(--font-display)',
        mono: 'var(--font-mono)',
      },
      // Enquadramento do conteúdo (shell/SPA): use no wrapper do miolo,
      // ex.: `mx-auto w-full max-w-content px-content`.
      maxWidth: {
        content: 'var(--content-max-width)',
      },
      spacing: {
        content: 'var(--content-padding)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Abre e fecha dos dropdowns (Collapsible). A altura vem do Radix, que
        // mede o conteúdo e a publica nesta variável — não dá para animar
        // `height: auto`, e é por isso que a variável existe.
        'collapsible-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },
        // Os três pontinhos de "a IA está digitando" (módulo Chat). Cada ponto
        // usa a mesma animação com um atraso diferente, e é o atraso que faz a
        // onda correr da esquerda para a direita.
        'typing-dot': {
          '0%,60%,100%': { opacity: '0.3', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-0.2rem)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-out',
        'collapsible-up': 'collapsible-up 0.2s ease-out',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config
