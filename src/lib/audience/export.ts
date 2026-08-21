/**
 * The export — the list, as a file that can be sent from anywhere.
 *
 * Server-only. One column here does the heavy lifting: **`unsubscribe_url`**.
 *
 * A campaign sent from Gmail or Mailchimp has to carry a working way out or it
 * is unlawful (PECR reg. 22). Without this column the founder has two bad
 * options: no opt-out at all, or the sending tool's own — which lands in that
 * tool's suppression list, somewhere we cannot see, so the next export from here
 * happily includes the person who just unsubscribed. The link in this column is
 * the address's own token, pointing at our opt-out page, so an opt-out taken
 * from a campaign sent through anything lands back in OUR database and the next
 * export already excludes them.
 *
 * The file is UTF-8 with a BOM because Excel reads a BOM-less UTF-8 CSV as the
 * local code page and turns every accented name into mojibake — a detail nobody
 * notices until a customer called Zoë gets an email addressed to ZoÃ«.
 */
import { appBaseUrl } from '@/lib/notify'
import { optOutUrl } from '@/lib/notify/marketing'
import { listAudience, type ListLeadsOptions } from './leads'
import type { AudienceMember } from './types'

/** RFC 4180: quote everything, double the quotes inside. */
function cell(value: string | null | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`
}

/**
 * A spreadsheet's idea of a formula, defused.
 *
 * A name beginning `=`, `+`, `-` or `@` is executed by Excel and Sheets when the
 * file is opened. It is a real attack — somebody types `=HYPERLINK(...)` into a
 * quiz field and it runs on the founder's machine — and the fix is a leading
 * apostrophe, which spreadsheets read as "this is text".
 */
function safeCell(value: string | null | undefined): string {
  const raw = value ?? ''
  return cell(/^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw)
}

export const EXPORT_COLUMNS = [
  'email',
  'first_name',
  'signed_up_at',
  'source',
  'track',
  'primary_goal',
  'basis',
  'unsubscribe_url',
] as const

export interface ExportOptions extends ListLeadsOptions {
  /**
   * Include addresses we may NOT email.
   *
   * Off by default and deliberately awkward to turn on. The default export is
   * the one a founder pastes into a sending tool, and the only safe default for
   * that file is "everybody we are allowed to email". Someone genuinely
   * exporting the whole list for a data audit has to say so.
   */
  includeSuppressed?: boolean
}

export interface AudienceExport {
  csv: string
  rows: number
  /** How many were left out because we may not email them. */
  excluded: number
}

export async function buildAudienceCsv(options: ExportOptions = {}): Promise<AudienceExport> {
  const everyone = await listAudience({ ...options, marketableOnly: false })
  const rows = options.includeSuppressed ? everyone : everyone.filter((m) => m.marketable)
  const base = appBaseUrl()

  const lines = [EXPORT_COLUMNS.join(',')]
  for (const member of rows) {
    lines.push(await csvRow(member, base))
  }

  return {
    // \r\n, which is what RFC 4180 says and what Excel expects.
    csv: `﻿${lines.join('\r\n')}\r\n`,
    rows: rows.length,
    excluded: everyone.length - rows.length,
  }
}

async function csvRow(member: AudienceMember, base: string): Promise<string> {
  let unsubscribe = ''
  try {
    unsubscribe = await optOutUrl(base, member.email)
  } catch (err) {
    // A row with no way out must not go into a campaign, so it goes out with an
    // empty cell and a loud log rather than a link that does not work.
    console.error('[audience] no opt-out link for an exported row:', err)
  }

  return [
    safeCell(member.email),
    safeCell(member.firstName),
    cell(member.firstSeenAt),
    cell(member.source),
    cell(member.track),
    cell(member.primaryGoal),
    cell(member.basis),
    cell(unsubscribe),
  ].join(',')
}

/** The filename a founder sees in their downloads. Dated, so two are two files. */
export function exportFilename(now = new Date()): string {
  return `chrgd-audience-${now.toISOString().slice(0, 10)}.csv`
}
