/**
 * Theme (dark mode) preferences — Phase 7.
 *
 * The user's choice is 'system' (default), 'light' or 'dark', stored in
 * localStorage. The RESOLVED theme is what actually renders: 'system'
 * follows the OS setting. Applying a theme toggles the `.dark` class on
 * <html>; every neutral design token is a CSS variable that flips under
 * that class (see src/index.css), and Tailwind's `dark:` variant is
 * bound to the same class.
 *
 * An inline copy of the resolution runs in index.html before first
 * paint so there's no light-flash for dark users.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'neighbormart:theme'

/** Pure resolution: preference + OS setting → what to render. */
export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function getStoredPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function storePreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Private mode etc. — theme still applies for the session.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Toggle the `.dark` class so CSS variables + `dark:` variants flip. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

/** Read storage + OS, apply, and return the resolved theme. */
export function initTheme(): ResolvedTheme {
  const resolved = resolveTheme(getStoredPreference(), systemPrefersDark())
  applyResolvedTheme(resolved)
  return resolved
}
