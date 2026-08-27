/**
 * Supplier description → readable copy.
 * ────────────────────────────────────
 * PowerBody's `description_en` is a raw HTML fragment lifted straight out of
 * their storefront — `<div class="RichText3-paragraph…">`, `<strong>`, `<br />`,
 * `<ul>/<li>`, and HTML entities. We render descriptions as TEXT (React escapes
 * them), so every one of those tags was showing to customers verbatim:
 *
 *   <div class="RichText3-paragraph--withVSpacingSmall …">OSAVI shaker in blue,
 *   700 ml capacity.</div> <div class="RichText3-paragraph…
 *
 * This turns that into plain text with its structure intact. Two rules matter:
 *
 *   1. **Plain text out, always.** The output is never fed to
 *      `dangerouslySetInnerHTML`. Supplier copy is third-party content we do not
 *      control, and the current safety of this path comes entirely from it being
 *      rendered as text. Cleaning it must not become a reason to stop escaping
 *      it.
 *   2. **Block structure survives.** Stripping tags naively welds sentences
 *      together ("700 ml capacity.Ideal for preparing drinks"). Block-level tags
 *      become newlines, so the text still reads as paragraphs and bullets.
 */

/** Elements whose content is markup or styling, never prose. */
const DROP_ELEMENTS = /<(script|style|noscript|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

/** Block-level tags — each one ends a line. */
const BLOCK_TAGS = /<\/?(?:p|div|br|h[1-6]|ul|ol|table|tr|section|article|header|footer|blockquote)\b[^>]*>/gi

/** List items become bullets rather than run-on sentences. */
const LIST_ITEM_OPEN = /<li\b[^>]*>/gi

/**
 * The named entities PowerBody actually emit, plus the Greek letters their
 * dimension lines use (`&phi;9.7*H21.8 cm` — a diameter). Anything not listed is
 * left alone: a stray `&something;` in the shop is a visible prompt to add it
 * here, which is better than silently deleting a character that carried meaning.
 */
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', deg: '°', plusmn: '±',
  times: '×', divide: '÷', frac12: '½', frac14: '¼', frac34: '¾',
  micro: 'µ', reg: '®', copy: '©', trade: '™', euro: '€', pound: '£',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', omega: 'ω',
  phi: 'φ', mu: 'μ', pi: 'π', sigma: 'σ', theta: 'θ', lambda: 'λ',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => codePoint(parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec) => codePoint(parseInt(dec, 10), m))
    // `&amp;` last would double-decode `&amp;lt;`; named entities are resolved in
    // one pass so each `&…;` is replaced exactly once.
    .replace(/&([a-z][a-z0-9]{1,31});/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
}

/** A numeric entity, or the original text when it isn't a usable character. */
function codePoint(code: number, original: string): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return original
  try {
    return String.fromCodePoint(code)
  } catch {
    return original
  }
}

/**
 * Plain, readable text from a supplier description.
 *
 * Safe to run on text that is already clean (it is idempotent) and on an empty
 * or missing value, so it can sit on the import path without a guard at every
 * call site.
 */
export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return ''

  const text = raw
    .replace(DROP_ELEMENTS, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(LIST_ITEM_OPEN, '\n• ')
    .replace(BLOCK_TAGS, '\n')
    // Everything else — <strong>, <em>, <span>, </li> — is inline emphasis we
    // have no way to show in plain text, so the tag goes and the words stay.
    .replace(/<\/?[a-z][^>]*>/gi, '')

  return decodeEntities(text)
    // Non-breaking and exotic spaces read as spaces once the tags are gone.
    .replace(/[   ]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    // A bullet with nothing after it is a leftover empty <li>, not a point.
    .filter((line) => line !== '' && line !== '•')
    .join('\n')
    .trim()
}

/**
 * True when a description still carries markup — the signal that a product was
 * imported before the import path cleaned descriptions, and needs backfilling.
 */
export function looksLikeHtml(text: string | null | undefined): boolean {
  if (!text) return false
  return /<[a-z!/][^>]*>/i.test(text) || /&[a-z][a-z0-9]{1,31};/i.test(text)
}
