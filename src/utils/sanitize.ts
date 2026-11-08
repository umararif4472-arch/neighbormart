/**
 * Input sanitization (Phase 8). React escapes everything it renders,
 * so stored-XSS via markup isn't the risk here — the real risks are
 * control characters, zero-width/bidi tricks in names and titles, and
 * unbounded text. These helpers run in the shared validators and both
 * service backends, so a hand-crafted API call gets the same treatment
 * as the UI.
 */

// Control chars (except newline and tab), zero-width chars, and bidi overrides,
// written as unicode escapes so the source stays printable.
const CONTROL_AND_FORMAT =
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g

/** Strip dangerous/invisible characters and normalize whitespace. */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(CONTROL_AND_FORMAT, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

/** Multi-line variant for descriptions/messages: keeps line breaks. */
export function sanitizeMultiline(value: string, maxLength: number): string {
  return value
    .replace(CONTROL_AND_FORMAT, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}
