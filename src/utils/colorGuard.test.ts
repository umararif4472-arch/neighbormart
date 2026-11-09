import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Phase 9 contrast guard — this test is why the dark-mode bugs Umar
 * found (light panels with flipped-to-light text) cannot come back:
 *
 * 1. A static scan forbids pale tint backgrounds, mid-tone text and
 *    pale borders WITHOUT a `dark:` counterpart in the same class
 *    string, and forbids literal `bg-white` panels outside a small
 *    reviewed allowlist (photo overlays + the official Google button).
 * 2. A WCAG contrast check computes the real ratios for the theme
 *    token pairs (ink / muted ink / accents / button colors) in BOTH
 *    themes from the values in index.css and asserts AA.
 */

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [full] : []
  })
}

/** Files where a literal white surface is correct in both themes. */
const WHITE_ALLOWLIST = new Set([
  'src/features/auth/SignInPage.tsx', // official Google button + gradient hero chips
  'src/components/listings/PhotoGallery.tsx', // controls sit on photos / the black lightbox backdrop
])

const PALE_BG = /\b(bg)-(red|amber|moss|terracotta|stone|green|sky|blue)-(50|100)\b/
const MID_TEXT = /\b(text)-(red|amber|moss|terracotta|stone)-(600|700|800|900)\b/
const PALE_BORDER = /\b(border)-(red|amber|moss|terracotta|stone)-(200|300)\b/

describe('color guard — no un-flipped light colors in components', () => {
  it('every pale tint / mid text / pale border carries a dark: variant', () => {
    const violations: string[] = []
    for (const file of sourceFiles(SRC)) {
      const rel = file.slice(process.cwd().length + 1)
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        // Only class-bearing lines (heuristic: contains a quote/backtick and a utility)
        if (!/className|cn\(|class=/.test(line) && !/['"`][^'"`]*\b(bg|text|border)-/.test(line))
          return
        const checks: Array<[RegExp, string]> = [
          [PALE_BG, 'pale background'],
          [MID_TEXT, 'mid-tone text'],
          [PALE_BORDER, 'pale border'],
        ]
        for (const [pattern, label] of checks) {
          if (pattern.test(line) && !line.includes('dark:')) {
            violations.push(
              `${rel}:${i + 1} ${label} without dark: variant — ${line.trim().slice(0, 110)}`,
            )
          }
        }
        if (
          /\bbg-white\b/.test(line) &&
          !WHITE_ALLOWLIST.has(rel) &&
          !/text-(bark|white|cream)\b/.test(line)
        ) {
          violations.push(`${rel}:${i + 1} literal bg-white panel — ${line.trim().slice(0, 110)}`)
        }
        // Raw hex check ignores SVG fill/stroke attributes (logo art).
        const classPart = line.replace(/(fill|stroke)="[^"]*"/g, '')
        if (
          /#[0-9a-fA-F]{6}/.test(classPart) &&
          /className|cn\(/.test(classPart) &&
          !WHITE_ALLOWLIST.has(rel)
        ) {
          violations.push(`${rel}:${i + 1} raw hex in class string — ${line.trim().slice(0, 110)}`)
        }
      })
    }
    expect(violations).toEqual([])
  })
})

/* ---------- WCAG contrast over the real theme tokens ---------- */

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

function cssVars(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/(--nm-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]!] = m[2]!
  }
  return out
}

const css = readFileSync(join(SRC, 'index.css'), 'utf8')
const light = cssVars(css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '')
const dark = cssVars(css.match(/\.dark\s*\{([^}]*)\}/)?.[1] ?? '')

const AA = 4.5
const PAIRS: Array<[string, string, string, number]> = [
  // [label, fg, bg, min]
  ['light ink on canvas', light['--nm-ink']!, light['--nm-canvas']!, AA],
  ['light ink on surface', light['--nm-ink']!, light['--nm-surface']!, AA],
  ['light ink on surface-2', light['--nm-ink']!, light['--nm-surface-2']!, AA],
  ['light muted on canvas', light['--nm-ink-soft']!, light['--nm-canvas']!, AA],
  ['light muted on surface', light['--nm-ink-soft']!, light['--nm-surface']!, AA],
  ['light muted on surface-2', light['--nm-ink-soft']!, light['--nm-surface-2']!, AA],
  ['dark ink on canvas', dark['--nm-ink']!, dark['--nm-canvas']!, AA],
  ['dark ink on surface', dark['--nm-ink']!, dark['--nm-surface']!, AA],
  ['dark ink on surface-2', dark['--nm-ink']!, dark['--nm-surface-2']!, AA],
  ['dark muted on canvas', dark['--nm-ink-soft']!, dark['--nm-canvas']!, AA],
  ['dark muted on surface', dark['--nm-ink-soft']!, dark['--nm-surface']!, AA],
  ['dark muted on surface-2', dark['--nm-ink-soft']!, dark['--nm-surface-2']!, AA],
  // Hero body copy uses ink-mid: same as muted in light mode, one step
  // stronger in dark mode where ink-soft read washed out (Defect 2 fix).
  ['light ink-mid on canvas', light['--nm-ink-mid']!, light['--nm-canvas']!, AA],
  ['light ink-mid on surface', light['--nm-ink-mid']!, light['--nm-surface']!, AA],
  ['dark ink-mid on canvas', dark['--nm-ink-mid']!, dark['--nm-canvas']!, AA],
  ['dark ink-mid on surface', dark['--nm-ink-mid']!, dark['--nm-surface']!, AA],
  // Landing hero location pill (dark): moss-100 text on moss-900 field.
  ['moss-100 on moss-900 (dark hero pill)', '#e3eedd', '#1f311c', AA],
  ['white on terracotta-600 (primary button)', '#ffffff', '#a44b2d', AA],
  ['white on moss-600 (success button)', '#ffffff', '#4a7040', AA],
  ['terracotta-600 links on light canvas', '#a44b2d', light['--nm-canvas']!, AA],
  ['terracotta-400 links on dark canvas', '#d07d5b', dark['--nm-canvas']!, AA],
  ['terracotta-400 links on dark surface', '#d07d5b', dark['--nm-surface']!, AA],
  ['light items accent on canvas', light['--nm-accent-items']!, light['--nm-canvas']!, AA],
  ['light vehicles accent on canvas', light['--nm-accent-vehicles']!, light['--nm-canvas']!, AA],
  [
    'light properties accent on canvas',
    light['--nm-accent-properties']!,
    light['--nm-canvas']!,
    AA,
  ],
  ['light arenas accent on canvas', light['--nm-accent-arenas']!, light['--nm-canvas']!, AA],
  ['dark items accent on canvas', dark['--nm-accent-items']!, dark['--nm-canvas']!, AA],
  ['dark vehicles accent on canvas', dark['--nm-accent-vehicles']!, dark['--nm-canvas']!, AA],
  ['dark properties accent on canvas', dark['--nm-accent-properties']!, dark['--nm-canvas']!, AA],
  ['dark arenas accent on canvas', dark['--nm-accent-arenas']!, dark['--nm-canvas']!, AA],
  // Toast/alert dark pairs (950 bg + 100/200 text, as used by the flips)
  ['red-200 on red-950', '#fecaca', '#450a0a', AA],
  ['amber-200 on amber-950', '#fde68a', '#451a03', AA],
  ['moss-100 on moss-900', '#e3eedd', '#1f311c', AA],
  ['terracotta-100 on terracotta-900', '#f5dfd2', '#4c2518', AA],
  // Toast/alert light pairs (50 bg + 900 text)
  ['red-900 on red-50', '#7f1d1d', '#fef2f2', AA],
  ['amber-900 on amber-50', '#78350f', '#fffbeb', AA],
  ['moss-900 on moss-50', '#1f311c', '#f2f6ef', AA],
  ['terracotta-900 on terracotta-50', '#4c2518', '#faf1eb', AA],
  // Open Door brand pairs (kit hexes — static across themes; the door
  // intro and mesh hero set cream text on these exact fields).
  ['brand cream on terracotta (intro / hero)', '#f6ebdd', '#a44b2d', AA],
  ['brand cream on door dark', '#f6ebdd', '#5e2815', AA],
  ['brand ink on kit cream', '#3a2218', '#f6ebdd', AA],
  ['brand amber on dark canvas', '#d99a2b', dark['--nm-canvas']!, AA],
  ['brand cream on dark canvas (dark wordmark)', '#f6ebdd', dark['--nm-canvas']!, AA],
  ['kit "Mart" #d9805f on dark canvas', '#d9805f', dark['--nm-canvas']!, AA],
  ['terracotta-700 button text on brand cream', '#863d24', '#f6ebdd', AA],
]

describe('button terracotta rule', () => {
  it('never sets amber text on a terracotta background (2.38:1 — use cream instead)', () => {
    const bad: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/className=(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
        const cls = m[1] ?? m[2] ?? m[3] ?? ''
        if (/bg-terracotta-\d+/.test(cls) && /text-(amber|brand-amber|brand-items)(?!\w)/.test(cls)) {
          bad.push(file + ' :: ' + cls.slice(0, 60))
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('never pairs bg-terracotta-500 with white text (buttons use terracotta-600, ~5.8:1)', () => {
    const bad: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/className=(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
        const cls = m[1] ?? m[2] ?? m[3] ?? ''
        if (/bg-terracotta-500(?!\d)/.test(cls) && /text-white(?!\w)/.test(cls)) {
          bad.push(file + ' :: ' + cls.slice(0, 60))
        }
      }
    }
    expect(bad).toEqual([])
  })
})

describe('color guard — WCAG AA contrast for theme token pairs', () => {
  it.each(PAIRS)('%s meets its ratio', (_label, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min)
  })
})
