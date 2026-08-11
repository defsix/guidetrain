import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { applyTheme, readThemePref } from './state/useTheme'
import { applyDocumentLocale, deviceLocale, forgetLocalePref } from './i18n'
import { I18nProvider } from './i18n/I18nProvider'

// Set the theme before the first paint, otherwise a dark-mode user gets a
// flash of the light default while React boots.
applyTheme(readThemePref())

// Same for the language: <html lang> steers hyphenation and which font the
// browser reaches for with CJK, so it should be right from the first frame
// rather than corrected once React has mounted.
forgetLocalePref()
applyDocumentLocale(deviceLocale())

// HashRouter because GitHub Pages has no server-side rewrite for deep links.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </I18nProvider>
  </StrictMode>,
)
