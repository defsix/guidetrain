import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { applyTheme, readThemePref } from './state/useTheme'

// Set the theme before the first paint, otherwise a dark-mode user gets a
// flash of the light default while React boots.
applyTheme(readThemePref())

// HashRouter because GitHub Pages has no server-side rewrite for deep links.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
