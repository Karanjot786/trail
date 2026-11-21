import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyTheme } from './shell/theme'
import { startRouter } from './shell/router'
import { TooltipProvider } from './ui/tooltip'
import { App } from './App'

// Before the first paint: the theme (dark unless the viewer chose light) and any legacy-link redirect.
applyTheme()
startRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
