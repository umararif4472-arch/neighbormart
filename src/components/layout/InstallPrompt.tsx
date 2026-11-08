import { useEffect, useState } from 'react'
import { APP_NAME } from '@/config'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'neighbormart:install-dismissed'

/**
 * PWA install prompt (Phase 8): when the browser offers installation,
 * show a small dismissible banner above the mobile tab bar. Dismissal
 * is remembered for the session so it never nags.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!deferred) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDeferred(null)
  }

  return (
    <div
      role="dialog"
      aria-label={`Install ${APP_NAME}`}
      className="fixed inset-x-3 bottom-24 z-40 flex items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-3.5 shadow-xl md:bottom-6 md:left-auto md:right-6 md:w-96"
    >
      <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-bark">Install {APP_NAME}</p>
        <p className="text-xs text-bark-light">
          Faster access, works on flaky connections — like a real app.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void deferred.prompt()
          void deferred.userChoice.finally(() => setDeferred(null))
        }}
        className="shrink-0 rounded-full bg-terracotta-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-terracotta-700"
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded-full p-1.5 text-bark-light transition-colors hover:bg-bark/5 hover:text-bark"
      >
        ✕
      </button>
    </div>
  )
}
