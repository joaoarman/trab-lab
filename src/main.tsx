import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './shared/i18n' // import de efeito: inicializa o i18n
import { TooltipProvider } from './shared/components/ui/tooltip'
import { ThemeProvider } from './shared/context/ThemeContext'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
