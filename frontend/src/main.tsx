import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App, { applyCookieThemeEarly } from './App.tsx'
import { isTauri } from './platform'
import './index.css'

applyCookieThemeEarly()

if (!isTauri && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch((err) => console.warn('Falha ao registrar o service worker', err))
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
