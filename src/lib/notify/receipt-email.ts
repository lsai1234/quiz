/**
 * The printed receipt, rendered for an email client.
 *
 * The website prints a thermal receipt at the end of every payment journey, and
 * that artefact is the one piece of the brand a customer keeps. Sending them a
 * plain paragraph of numbers afterwards would mean the receipt they were shown
 * and the receipt they can find again look nothing alike — so the same
 * `ReceiptData` that feeds `<ReceiptPrinter>` feeds this, and the two agree by
 * construction rather than by somebody remembering to update both.
 *
 * What changes is only how it is drawn, because email is not the web:
 *
 *  • **Tables, not flexbox.** Outlook renders through Word, which has no flex
 *    and no grid. Every row here is a `<table>`; the dot leader that the
 *    component makes with a flexed border is a three-cell row with a dotted
 *    bottom border on the middle cell.
 *  • **Inline styles only.** Gmail strips `<style>` blocks in several of its
 *    clients, so every declaration sits on the element it applies to.
 *  • **No transforms and no masks.** The stamp is not rotated and the paper's
 *    torn edge is drawn as a zigzag row of cells, because `transform` and
 *    `mask` are silently dropped almost everywhere.
 *  • **Fixed light colours.** The paper is cream with dark ink in every client,
 *    regardless of the reader's dark mode — a receipt that inverts is a receipt
 *    whose figures stop being legible.
 *
 * The plain-text rendering is not an afterthought: some clients show only that,
 * and a receipt is exactly the email somebody forwards to their accountant.
 */
import type { ReceiptData, ReceiptItem, ReceiptRow } from '@/lib/receipt/types'

/** Paper and ink, matching `ReceiptPrinter`'s palette exactly. */
const PAPER_TOP = '#fbf9f3'
const PAPER_BOTTOM = '#f5f1e6'
const INK = '#1c1814'
const INK_SOFT = 'rgba(28,24,20,0.6)'
const INK_FAINT = 'rgba(28,24,20,0.5)'
const SAVING = '#0f6b4f'
const RULE = 'rgba(28,24,20,0.38)'
const DOTS = 'rgba(28,24,20,0.3)'

const MONO = "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Courier New', monospace"

/** The paper's printable width, in the 340px the component uses. */
const PAPER_WIDTH = 340

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toneColour(tone: ReceiptRow['tone']): string {
  if (tone === 'saving') return SAVING
  if (tone === 'muted') return 'rgba(28,24,20,0.55)'
  return INK
}

/** A full-width row wrapper — every block on the paper is one of these. */
function row(inner: string): string {
  return `<tr><td style="padding:0">${inner}</td></tr>`
}

function rule(double = false): string {
  return row(
    `<div style="border-top:${double ? '3px double' : '1px dashed'} ${RULE};font-size:0;line-height:0;margin:10px 0">&nbsp;</div>`,
  )
}

/**
 * Label … value, with the dot leader every till receipt in the world prints.
 *
 * The dots are a bottom border on a spacer cell rather than a run of `.`
 * characters: a literal dot run wraps unpredictably at narrow widths and a
 * screen reader reads every one of them out.
 */
function leader(entry: ReceiptRow, bold = false): string {
  const colour = toneColour(entry.tone)
  const value = entry.strike
    ? `<s style="text-decoration:line-through">${escapeHtml(entry.value)}</s>`
    : escapeHtml(entry.value)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:${MONO};font-size:11.5px;line-height:1.5">
  <tr>
    <td style="padding:1px 0;color:${colour};white-space:nowrap">${escapeHtml(entry.label)}</td>
    <td style="padding:1px 4px;width:100%"><div style="border-bottom:1px dotted ${DOTS};font-size:0;line-height:0;margin-bottom:3px">&nbsp;</div></td>
    <td align="right" style="padding:1px 0;color:${colour};white-space:nowrap;font-weight:${bold ? 700 : 500}">${value}</td>
  </tr>
</table>`
}

function itemLine(item: ReceiptItem): string {
  const note = item.note
    ? `<div style="font-size:10px;color:${INK_FAINT};line-height:1.4">${escapeHtml(item.note)}</div>`
    : ''
  const amount = item.amount
    ? `<td align="right" valign="top" style="padding:3px 0;color:${INK};font-weight:600;white-space:nowrap">${escapeHtml(item.amount)}</td>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:${MONO};font-size:11.5px;line-height:1.45">
  <tr>
    <td valign="top" width="26" style="padding:3px 0;color:${INK_SOFT};white-space:nowrap">${item.qty}&times;</td>
    <td valign="top" style="padding:3px 0;color:${INK}">${escapeHtml(item.name)}${note}</td>
    ${amount}
  </tr>
</table>`
}

/**
 * The barcode, as a row of cells.
 *
 * Same derivation as the component's, so the same order draws the same bars in
 * the email and on the screen. Decorative — the readable reference is printed
 * under it, which is the part anyone actually quotes back to us.
 */
function barcodeBars(seed: string): number[] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  const bars: number[] = []
  for (let i = 0; i < 44; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0
    bars.push(1 + ((hash >>> 8) % 3))
  }
  return bars
}

function barcode(reference: string): string {
  const cells = barcodeBars(reference)
    .map(
      (width, i) =>
        `<td width="${width}" style="width:${width}px;height:38px;background:${
          i % 2 === 0 ? INK : 'transparent'
        };font-size:0;line-height:0">&nbsp;</td>`,
    )
    .join('')
  // A 2px gutter between bars, drawn as a cell rather than a margin: margins on
  // table cells are one of the things Word simply ignores.
  const spaced = cells.split('</td>').join('</td><td width="2" style="width:2px;font-size:0;line-height:0">&nbsp;</td>')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto"><tr>${spaced}</tr></table>`
}

/**
 * The torn bottom edge.
 *
 * The component masks a zigzag out of the paper; a mask is not an option here,
 * so the teeth are drawn instead — alternating cells of paper colour with a
 * diagonal border, which every client renders as a plain triangle row and the
 * few that don't render as a thin cream strip. Either way nothing breaks.
 */
function tornEdge(): string {
  const tooth = `<td width="14" style="width:14px;height:7px;font-size:0;line-height:0;border-left:7px solid ${PAPER_BOTTOM};border-right:7px solid ${PAPER_BOTTOM};border-top:7px solid ${PAPER_BOTTOM};border-bottom:0">&nbsp;</td>`
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${PAPER_WIDTH}" style="width:${PAPER_WIDTH}px;border-collapse:collapse;font-size:0;line-height:0"><tr>${tooth.repeat(Math.floor(PAPER_WIDTH / 14))}</tr></table>`
}

/**
 * The receipt as an HTML block, ready to drop into an email body.
 *
 * Centred and fixed-width, because a receipt that reflows to the width of a
 * desktop mail window stops looking like a receipt.
 */
export function receiptEmailHtml(receipt: ReceiptData): string {
  const blocks: string[] = []

  blocks.push(
    row(`<div style="text-align:center">
    <div style="font-family:${MONO};font-size:17px;font-weight:700;letter-spacing:-0.02em;color:${INK}">${escapeHtml(receipt.merchant.name)}</div>
    <div style="font-family:${MONO};font-size:9px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(28,24,20,0.55);padding-top:3px">${escapeHtml(receipt.merchant.strapline)}</div>
    <div style="font-family:${MONO};font-size:10px;color:${INK_FAINT};padding-top:2px">${escapeHtml(receipt.merchant.site)}</div>
  </div>`),
  )

  blocks.push(rule())
  blocks.push(
    row(
      `<div style="text-align:center;font-family:${MONO};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.28em;color:${INK}">${escapeHtml(receipt.docTitle)}</div>`,
    ),
  )
  blocks.push(rule())

  if (receipt.meta.length > 0) {
    blocks.push(row(receipt.meta.map((r) => leader(r)).join('')))
  }

  if (receipt.shipTo.length > 0) {
    blocks.push(rule())
    blocks.push(
      row(`<div style="font-family:${MONO};font-size:9px;text-transform:uppercase;letter-spacing:0.18em;color:${INK_FAINT};padding-bottom:4px">Deliver to</div>
  <div style="font-family:${MONO};font-size:11px;line-height:1.5;color:${INK}">${receipt.shipTo.map((line) => escapeHtml(line)).join('<br />')}</div>`),
    )
  }

  if (receipt.items.length > 0) {
    blocks.push(rule())
    // The amount column's heading only appears when there are amounts — a flat
    // plan's lines are a delivery schedule, not a price breakdown.
    const priced = receipt.items.some((item) => item.amount)
    blocks.push(
      row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:${MONO};font-size:9px;text-transform:uppercase;letter-spacing:0.18em;color:${INK_FAINT}">
    <tr><td style="padding-bottom:4px">Qty &middot; Item</td>${priced ? '<td align="right" style="padding-bottom:4px">Amount</td>' : ''}</tr>
  </table>${receipt.items.map(itemLine).join('')}`),
    )
  }

  if (receipt.adjustments.length > 0) {
    blocks.push(rule())
    blocks.push(row(receipt.adjustments.map((r) => leader(r)).join('')))
  }

  if (receipt.total) {
    blocks.push(rule(true))
    blocks.push(
      row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:${MONO};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${INK}">
    <tr><td>${escapeHtml(receipt.total.label)}</td><td align="right" style="white-space:nowrap">${escapeHtml(receipt.total.value)}</td></tr>
  </table>`),
    )
  }

  if (receipt.charge.length > 0) {
    blocks.push(rule())
    blocks.push(row(receipt.charge.map((r) => leader(r)).join('')))
  }

  if (receipt.stamp) {
    blocks.push(rule())
    blocks.push(
      row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto">
    <tr><td style="border:2px solid rgba(28,24,20,0.6);border-radius:4px;padding:6px 12px;font-family:${MONO};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:${INK};text-align:center">&#10033; ${escapeHtml(receipt.stamp)} &#10033;</td></tr>
  </table>`),
    )
  }

  if (receipt.notes.length > 0) {
    blocks.push(rule())
    blocks.push(
      row(
        receipt.notes
          .map(
            (note) =>
              `<div style="font-family:${MONO};font-size:10px;line-height:1.5;color:rgba(28,24,20,0.62);padding-bottom:6px">${escapeHtml(note)}</div>`,
          )
          .join(''),
      ),
    )
  }

  if (receipt.reference) {
    blocks.push(rule())
    blocks.push(
      row(`${barcode(receipt.reference)}
  <div style="text-align:center;font-family:${MONO};font-size:10px;letter-spacing:0.3em;color:rgba(28,24,20,0.7);padding-top:4px">${escapeHtml(receipt.reference)}</div>`),
    )
  }

  blocks.push(
    row(
      `<div style="text-align:center;font-family:${MONO};font-size:10px;text-transform:uppercase;letter-spacing:0.2em;color:${INK_SOFT};padding-top:12px">${escapeHtml(receipt.footer)}</div>`,
    ),
  )

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
  <tr><td align="center" style="padding:4px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${PAPER_WIDTH}" style="width:${PAPER_WIDTH}px;max-width:100%;border-collapse:collapse;background:${PAPER_TOP};background-image:linear-gradient(180deg, ${PAPER_TOP} 0%, ${PAPER_BOTTOM} 100%)">
      <tr><td style="padding:20px 24px 26px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
          ${blocks.join('\n          ')}
        </table>
      </td></tr>
    </table>
    ${tornEdge()}
  </td></tr>
</table>`
}

// ─── Plain text ──────────────────────────────────────────────────────────────

/** The paper's character width — 40 columns, as an 80mm till roll prints. */
const COLS = 40

function centre(text: string): string {
  const pad = Math.max(0, Math.floor((COLS - text.length) / 2))
  return ' '.repeat(pad) + text
}

function textRule(char = '-'): string {
  return char.repeat(COLS)
}

/** `Label ......... £12.34`, wrapping the label rather than the figure. */
function textLeader(entry: ReceiptRow): string {
  const label = entry.label
  const value = entry.strike ? `(${entry.value})` : entry.value
  const room = COLS - value.length - 1
  if (label.length >= room) return `${label}\n${' '.repeat(Math.max(0, COLS - value.length))}${value}`
  return `${label} ${'.'.repeat(Math.max(1, room - label.length - 1))} ${value}`
}

function wrap(text: string, width = COLS): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line.length === 0) line = word
    else if (line.length + 1 + word.length <= width) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * The receipt as monospaced text.
 *
 * Written to survive being read in a client that shows only plain text, and to
 * survive being forwarded to an accountant — which is why the totals and the
 * reference are laid out to be scanned rather than merely present.
 */
export function receiptText(receipt: ReceiptData): string {
  const out: string[] = []

  out.push(centre(receipt.merchant.name))
  out.push(centre(receipt.merchant.strapline.toUpperCase()))
  out.push(centre(receipt.merchant.site))
  out.push(textRule())
  out.push(centre(receipt.docTitle.toUpperCase()))
  out.push(textRule())

  for (const meta of receipt.meta) out.push(textLeader(meta))

  if (receipt.shipTo.length > 0) {
    out.push(textRule())
    out.push('DELIVER TO')
    for (const line of receipt.shipTo) out.push(`  ${line}`)
  }

  if (receipt.items.length > 0) {
    out.push(textRule())
    for (const item of receipt.items) {
      out.push(textLeader({ label: `${item.qty}x ${item.name}`, value: item.amount ?? '' }))
      if (item.note) out.push(`     ${item.note}`)
    }
  }

  if (receipt.adjustments.length > 0) {
    out.push(textRule())
    for (const adjustment of receipt.adjustments) out.push(textLeader(adjustment))
  }

  if (receipt.total) {
    out.push(textRule('='))
    out.push(textLeader({ label: receipt.total.label.toUpperCase(), value: receipt.total.value }))
    out.push(textRule('='))
  }

  if (receipt.charge.length > 0) {
    for (const charge of receipt.charge) out.push(textLeader(charge))
  }

  if (receipt.stamp) {
    out.push(textRule())
    out.push(centre(`* ${receipt.stamp.toUpperCase()} *`))
  }

  if (receipt.notes.length > 0) {
    out.push(textRule())
    for (const note of receipt.notes) out.push(...wrap(note))
  }

  if (receipt.reference) {
    out.push(textRule())
    out.push(centre(receipt.reference))
  }

  out.push(textRule())
  out.push(centre(receipt.footer))

  return out.join('\n')
}
