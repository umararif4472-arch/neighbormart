import { useEffect, useState } from 'react'
import {
  applyResolvedTheme,
  getStoredPreference,
  resolveTheme,
  storePreference,
  systemPrefersDark,
  type ThemePreference,
} from '@/utils/theme'

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

const LABEL: Record<ThemePreference, string> = {
  system: 'Theme: system (tap for light)',
  light: 'Theme: light (tap for dark)',
  dark: 'Theme: dark (tap for system)',
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

function SystemIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8m-4-4v4" />
    </svg>
  )
}

/**
 * Header theme toggle: cycles System → Light → Dark. The preference
 * persists in localStorage; 'system' keeps following the OS live.
 */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => getStoredPreference())

  useEffect(() => {
    applyResolvedTheme(resolveTheme(pref, systemPrefersDark()))
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyResolvedTheme(resolveTheme('system', mq.matches))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  return (
    <button
      type="button"
      aria-label={LABEL[pref]}
      title={LABEL[pref]}
      onClick={() => {
        const next = NEXT[pref]
        setPref(next)
        storePreference(next)
      }}
      className="rounded-full p-2.5 text-bark-light transition-colors hover:bg-bark/5 hover:text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
    >
      {pref === 'dark' ? <MoonIcon /> : pref === 'light' ? <SunIcon /> : <SystemIcon />}
    </button>
  )
}
