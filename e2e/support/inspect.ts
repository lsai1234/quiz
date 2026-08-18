import type { Page } from '@playwright/test'

/**
 * Rendered-output inspectors.
 *
 * The unit suite already holds the *source* to the design rules — tokens only,
 * no emoji in the member-facing tree, contrast floors. What it cannot see is the
 * page after React has run: a label that fell back to its own enum id, a price
 * that formatted to `£NaN`, a glyph drawn at the wrong stroke, a heading clipped
 * by its container. Those are the faults these helpers look for, and each one
 * returns findings rather than asserting, so a spec can report every problem on
 * a page in one go instead of one per run.
 *
 * Everything here runs in the browser against the live DOM, and everything
 * skips `#__next-build-watcher` and `nextjs-portal` — the dev overlay is not
 * part of the product.
 */

export interface Finding {
  kind: string
  detail: string
  snippet: string
}

/** Elements injected by the dev server, never by us. */
const IGNORED_HOSTS = 'nextjs-portal, #__next-build-watcher, [data-nextjs-toast]'

/* ─── Text faults ─────────────────────────────────────────────────────────── */

/**
 * Characters and strings that mean something went wrong on the way to the
 * screen, rather than anything a copywriter typed.
 */
const TEXT_FAULTS: Array<{ kind: string; re: RegExp; detail: string }> = [
  // UTF-8 read as Latin-1. `Â£4.95`, `weâ€™ll`, `Ã©`.
  { kind: 'mojibake', re: /Â[£€\s]|â€[™˜œ“”]|Ã[©¨¡³±]|ï¿½/u, detail: 'UTF-8 decoded as Latin-1' },
  // An entity that reached the screen as characters instead of being decoded.
  { kind: 'raw-entity', re: /&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i, detail: 'HTML entity rendered literally' },
  // A value that never resolved.
  { kind: 'placeholder', re: /\[object Object\]|\bundefined\b|\bNaN\b|\bInfinity\b/, detail: 'unresolved value rendered' },
  // A template that never interpolated.
  { kind: 'template', re: /\$\{[^}]*\}|\{\{[^}]*\}\}/, detail: 'uninterpolated template literal' },
  // Money that lost its formatter: `£4.9`, `£4.956`, `£.95`, `£ 4.95`.
  { kind: 'money', re: /£\s|£\d+\.\d(?!\d)|£\d+\.\d{3,}|£\.\d/, detail: 'malformed currency' },
  // Two spaces mid-sentence, or a space before punctuation.
  { kind: 'spacing', re: /\w {2,}\w|\s+[,.;:!?](?:\s|$)/, detail: 'stray whitespace' },
  /* A slash-separated numeric date. This is a UK-only product priced in pounds
     and every date in it is written `18 Aug 2026` or `Tuesday 15 September`, so
     a `M/D/YYYY` here means a `toLocaleString()` somewhere took its format from
     the reader's machine — and `11/8/2026` means two different days depending
     on who is looking at it. */
  { kind: 'ambiguous-date', re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, detail: 'slash-separated date takes its order from the viewer’s locale' },
]

/**
 * Emoji and the symbol characters that were being typed where a drawn glyph
 * belongs. Mirrors `src/components/__tests__/no-emoji.test.ts` — same ban, but
 * on the rendered page, which also catches anything arriving from the database
 * or an API rather than from a `.tsx` literal.
 *
 * The two brand marks that test allows are allowed here for the same reason,
 * and arrows and the true minus sign are typography rather than iconography.
 */
const BANNED_GLYPH = /[■-◿☀-⛿✀-➿⬀-⯿\u{1F000}-\u{1FAFF}]/u
const ALLOWED_GLYPHS = new Set(['✦', '✱', '←', '→', '↑', '↓', '−', '·', '—', '–'])

/**
 * Internal identifiers that must never reach a screen. Every one of these is a
 * union member from `src/lib/types.ts` whose user-facing label is a different
 * string, so seeing the id itself means a lookup was skipped somewhere.
 *
 * Matched against the *whole* of a text node, not against a substring: several
 * of these ids are also ordinary English ("a stim-free lift", "a plant-based
 * protein"), and a substring rule reported every one of those as a defect. An
 * id that leaked is the entire label; an id that is prose has a sentence around
 * it. Ids that are also their own label ("45+") are absent for the same reason.
 */
const LEAKED_IDS = [
  '16-24', '25-34', '35-44',
  'nonbinary', 'prefer-not-to-say',
  'desk-job', 'high-stress', 'poor-sleep', 'old-injuries',
  'past_due', 'pending_payment', 'submitted_to_supplier', 'awaiting_stock',
  'one_off',
]

export async function findTextFaults(page: Page): Promise<Finding[]> {
  const texts = await page.evaluate((ignored) => {
    const out: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const el = node.parentElement
      if (!el || el.closest(ignored)) continue
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
      const value = node.nodeValue ?? ''
      if (value.trim()) out.push(value)
    }
    return out
  }, IGNORED_HOSTS)

  const findings: Finding[] = []
  for (const text of texts) {
    for (const fault of TEXT_FAULTS) {
      if (fault.re.test(text)) {
        findings.push({ kind: fault.kind, detail: fault.detail, snippet: text.trim().slice(0, 120) })
      }
    }
    for (const char of text) {
      if (BANNED_GLYPH.test(char) && !ALLOWED_GLYPHS.has(char)) {
        findings.push({ kind: 'glyph', detail: `character "${char}" used as an icon`, snippet: text.trim().slice(0, 120) })
      }
    }
    // A leaked id is the node's entire content, possibly inside a "·"-joined run.
    const parts = text.split(/\s*·\s*|\s*,\s*/).map((p) => p.trim())
    for (const id of LEAKED_IDS) {
      if (parts.includes(id)) {
        findings.push({ kind: 'raw-id', detail: `internal id "${id}" shown instead of its label`, snippet: text.trim().slice(0, 120) })
      }
    }
  }
  return dedupe(findings)
}

/* ─── Icon faults ─────────────────────────────────────────────────────────── */

/**
 * The house icon set's construction rules, from the docblock on
 * `src/components/ui/Icon.tsx`: a 24×24 viewBox, `fill="none"`,
 * `stroke="currentColor"`, `strokeWidth={1.6}`, round caps and joins.
 *
 * Checked on the rendered SVG rather than the source, because the faults worth
 * catching are the ones a wrapper introduces — a glyph that inherits `fill` from
 * a parent, or is drawn into a box with no size and collapses to nothing.
 */
export async function findIconFaults(page: Page): Promise<Finding[]> {
  const raw = await page.evaluate((ignored) => {
    const out: Array<{ kind: string; detail: string; snippet: string }> = []
    document.querySelectorAll('svg').forEach((svg) => {
      if (svg.closest(ignored)) return
      const box = svg.getBoundingClientRect()
      const outer = svg.outerHTML.slice(0, 100)
      // Only visible glyphs: a decorative or off-screen svg is not a fault.
      if (box.width === 0 || box.height === 0) return
      const style = getComputedStyle(svg)
      if (style.visibility === 'hidden' || style.display === 'none') return

      const viewBox = svg.getAttribute('viewBox')
      // Charts, rails, rings and the share card draw their own geometry; the
      // house rules are about the 24-grid glyph set only.
      if (viewBox !== '0 0 24 24') return

      if (box.width < 8 || box.height < 8) {
        out.push({ kind: 'icon-size', detail: `glyph rendered at ${Math.round(box.width)}×${Math.round(box.height)}px`, snippet: outer })
      }
      if (Math.abs(box.width - box.height) > 1.5) {
        out.push({ kind: 'icon-aspect', detail: `glyph drawn non-square at ${Math.round(box.width)}×${Math.round(box.height)}px`, snippet: outer })
      }
      /* `currentColor` is the rule and a `var(--token)` is an accepted variation
         — both keep the colour in the design system. A literal hex or rgb() is
         the fault worth reporting: it cannot follow the surface it sits on. */
      const stroke = svg.getAttribute('stroke')
      if (stroke && /^(#|rgb|hsl)/i.test(stroke.trim())) {
        out.push({ kind: 'icon-stroke', detail: `stroke is the literal colour "${stroke}"`, snippet: outer })
      }
      const fill = svg.getAttribute('fill')
      if (fill !== null && /^(#|rgb|hsl)/i.test(fill.trim())) {
        out.push({ kind: 'icon-fill', detail: `fill is the literal colour "${fill}"`, snippet: outer })
      }
      // A glyph that ends up the same colour as what it sits on is invisible.
      if (style.color === 'rgba(0, 0, 0, 0)') {
        out.push({ kind: 'icon-colour', detail: 'glyph colour is fully transparent', snippet: outer })
      }
    })
    return out
  }, IGNORED_HOSTS)
  return dedupe(raw)
}

/* ─── Layout faults ───────────────────────────────────────────────────────── */

/**
 * Text the box cut off *silently*.
 *
 * Three things had to be separated out before this was worth running, and each
 * one was a page of false positives first:
 *
 * 1. **Truncation that announces itself** — `text-overflow: ellipsis` and
 *    `-webkit-line-clamp` — is a decision, not a defect. A hub table full of
 *    product names is supposed to end in an ellipsis.
 * 2. **Content behind a scroller** is still reachable. The delivery calendar's
 *    chips overflow their own rounded boxes inside an `overflow-x: auto` rail;
 *    the member scrolls and sees them.
 * 3. **`scrollWidth` is not a measure of text.** Every button in the design
 *    system carries an absolutely-positioned sheen band, and every raised card a
 *    decorative bloom, both wider than the box on purpose. Comparing
 *    `scrollWidth` to `clientWidth` reported the entire component library.
 *
 * So the measurement is of the text itself: a `Range` over the element's own
 * text nodes gives the rectangles the glyphs actually occupy, and those are
 * compared against the element's padding box. What survives is text a reader
 * cannot see and was given no sign of.
 */
export async function findClippedText(page: Page): Promise<Finding[]> {
  const raw = await page.evaluate((ignored) => {
    const out: Array<{ kind: string; detail: string; snippet: string }> = []

    /** Can the reader scroll to it after all? */
    function insideScroller(el: Element): boolean {
      let parent = el.parentElement
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent)
        if (/(auto|scroll)/.test(style.overflowX + style.overflowY)) return true
        parent = parent.parentElement
      }
      return false
    }

    document.querySelectorAll('*').forEach((el) => {
      if (el.closest(ignored)) return
      const style = getComputedStyle(el)
      if (style.overflowX !== 'hidden' && style.overflowY !== 'hidden') return
      if (style.textOverflow === 'ellipsis') return
      if (style.webkitLineClamp && style.webkitLineClamp !== 'none') return
      if (style.visibility === 'hidden' || style.display === 'none') return

      const box = el.getBoundingClientRect()
      // A visually-hidden label is a 1px box on purpose — the correct way to
      // name a control, and the exact shape of a clipping fault.
      if (box.width <= 2 || box.height <= 2) return
      if (insideScroller(el)) return

      // Only this element's own text, not a descendant's — the descendant is
      // where that fault belongs, and it is visited in its own right.
      let worstX = 0
      let worstY = 0
      let sample = ''
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE) continue
        const text = (node.nodeValue ?? '').trim()
        if (!text) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0 || rect.height === 0) continue
          worstX = Math.max(worstX, rect.right - box.right)
          worstY = Math.max(worstY, rect.bottom - box.bottom)
          if (rect.right - box.right > 1 || rect.bottom - box.bottom > 1) sample = text
        }
        range.detach()
      }

      // 1px of tolerance: sub-pixel layout rounds against us constantly.
      if (style.overflowX === 'hidden' && worstX > 1) {
        out.push({ kind: 'clipped-x', detail: `text runs ${Math.round(worstX)}px past its box and is cut off, with no ellipsis`, snippet: sample.slice(0, 90) })
      }
      if (style.overflowY === 'hidden' && worstY > 1) {
        out.push({ kind: 'clipped-y', detail: `text runs ${Math.round(worstY)}px below its box and is cut off, with no clamp`, snippet: sample.slice(0, 90) })
      }
    })
    return out
  }, IGNORED_HOSTS)
  return dedupe(raw)
}

/**
 * Controls a screen reader would announce as nothing at all.
 *
 * An icon-only button with no `aria-label` is the common way this happens, and
 * it is invisible on screen — which is exactly why it wants a test.
 */
export async function findUnnamedControls(page: Page): Promise<Finding[]> {
  const raw = await page.evaluate((ignored) => {
    const out: Array<{ kind: string; detail: string; snippet: string }> = []
    document.querySelectorAll('button, a[href], input, select, textarea').forEach((el) => {
      if (el.closest(ignored)) return
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return
      if ((el as HTMLElement).hidden || el.getAttribute('aria-hidden') === 'true') return

      const labelledBy = el.getAttribute('aria-labelledby')
      const labelled = labelledBy
        ? labelledBy.split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())
        : false
      const own =
        (el.getAttribute('aria-label') ?? '').trim() ||
        (el.textContent ?? '').trim() ||
        (el.getAttribute('title') ?? '').trim() ||
        (el.getAttribute('placeholder') ?? '').trim() ||
        (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent?.trim() : '') ||
        el.closest('label')?.textContent?.trim() ||
        ''
      if (!own && !labelled) {
        out.push({ kind: 'unnamed-control', detail: `<${el.tagName.toLowerCase()}> has no accessible name`, snippet: el.outerHTML.slice(0, 140) })
      }
    })
    return out
  }, IGNORED_HOSTS)
  return dedupe(raw)
}

/* ─── Composition ─────────────────────────────────────────────────────────── */

/** Everything above, in one pass. */
export async function inspect(page: Page): Promise<Finding[]> {
  const [text, icons, clipped, unnamed] = await Promise.all([
    findTextFaults(page),
    findIconFaults(page),
    findClippedText(page),
    findUnnamedControls(page),
  ])
  return [...text, ...icons, ...clipped, ...unnamed]
}

/** A readable failure message — the whole point is to fix them in one pass. */
export function report(where: string, findings: Finding[]): string {
  if (!findings.length) return ''
  const lines = findings.map((f) => `  · [${f.kind}] ${f.detail}\n      ${f.snippet}`)
  return `${findings.length} rendering fault(s) on ${where}:\n${lines.join('\n')}`
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.kind}|${f.detail}|${f.snippet}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
