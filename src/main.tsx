import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from '@/context/AppContext'
import { ToastProvider } from '@/context/ToastContext'
import App from './App'
import './index.css'
import { installGlobalErrorHandlers } from '@/utils/globalErrors'

installGlobalErrorHandlers()

// PWA (Phase 8): register the service worker in production builds only —
// in dev it would fight Vite's HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a progressive enhancement; never break boot.
    })
  })
}

// AppProvider (global state, hydration) + ToastProvider (ephemeral UI
// moments like tier-ups) wrap the router and the app shell.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AppProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppProvider>
    </ToastProvider>
  </StrictMode>,
)
