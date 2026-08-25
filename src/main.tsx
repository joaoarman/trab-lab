import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './shared/i18n' // inicializa o i18n (react-i18next) — o app nasce internacionalizado
import { TooltipProvider } from './shared/components/ui/tooltip'
import { ThemeProvider } from './shared/context/ThemeContext'
import { App } from './App'

// O TooltipProvider fica na RAIZ, e não dentro do shell: as telas de
// autenticação (quando entrarem) vivem fora do <AppLayout> e também usam tooltip.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
