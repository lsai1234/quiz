/**
 * The export.
 *
 * The file this produces is the one a founder pastes into a sending tool, so
 * two properties matter more than the rest: a suppressed address can never be
 * in it, and every row carries a working way out — without which a campaign
 * sent from Gmail or Mailchimp is unlawful (PECR reg. 22).
 */
import { buildAudienceCsv, exportFilename, EXPORT_COLUMNS } from '../export'
import { recordMarketingConsent, upsertLead } from '..'
import { suppressMarketing } from '@/lib/notify/marketing'

const optIn = (email: string, basis: 'consent' | 'soft-opt-in' = 'consent') =>
  recordMarketingConsent({ email, action: 'opt-in', basis, source: 'quiz-reveal' })

/**
 * Rows as fields, the way a spreadsheet would read them.
 *
 * A real parser rather than a split on commas, because half of what is being
 * asserted here is that a comma inside a name does NOT become a new column.
 */
function parse(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const text = csv.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
    else field += ch
  }
  if (field || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

describe('the exported file', () => {
  it('names its columns, unsubscribe link included', async () => {
    const { csv } = await buildAudienceCsv()
    expect(csv.replace(/^﻿/, '').split('\r\n')[0]).toBe(EXPORT_COLUMNS.join(','))
    expect(EXPORT_COLUMNS).toContain('unsubscribe_url')
  })

  it('starts with a BOM, so Excel does not mangle an accented name', async () => {
    await upsertLead({ email: 'zoe@example.com', firstName: 'Zoë', source: 'quiz-reveal' })
    await optIn('zoe@example.com')

    const { csv } = await buildAudienceCsv()
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Zoë')
  })

  it('carries only addresses we may email', async () => {
    await upsertLead({ email: 'in@example.com', source: 'quiz-reveal' })
    await optIn('in@example.com')
    await upsertLead({ email: 'never-asked@example.com', source: 'quiz-reveal' })
    await upsertLead({ email: 'left@example.com', source: 'quiz-reveal' })
    await optIn('left@example.com')
    await suppressMarketing('left@example.com')

    const { csv, excluded } = await buildAudienceCsv()
    expect(csv).toContain('in@example.com')
    // Never asked, and asked-then-left, are both out.
    expect(csv).not.toContain('never-asked@example.com')
    expect(csv).not.toContain('left@example.com')
    expect(excluded).toBeGreaterThanOrEqual(2)
  })

  it('gives every row its own working unsubscribe link', async () => {
    await upsertLead({ email: 'linked@example.com', source: 'quiz-reveal' })
    await optIn('linked@example.com')

    const rows = parse((await buildAudienceCsv()).csv)
    const header = rows[0]
    const row = rows.find((r) => r[header.indexOf('email')] === 'linked@example.com')!
    const url = row[header.indexOf('unsubscribe_url')]

    expect(url).toContain('/api/notify/marketing-opt-out?t=')
    // The token is the credential, so it must not be the address itself.
    expect(url).not.toContain('linked@example.com')
  })

  it('says which permission each row rests on', async () => {
    await upsertLead({ email: 'ticked@example.com', source: 'quiz-reveal' })
    await optIn('ticked@example.com')
    await upsertLead({ email: 'bought@example.com', source: 'checkout' })
    await optIn('bought@example.com', 'soft-opt-in')

    const rows = parse((await buildAudienceCsv()).csv)
    const header = rows[0]
    const basisOf = (email: string) =>
      rows.find((r) => r[header.indexOf('email')] === email)![header.indexOf('basis')]

    expect(basisOf('ticked@example.com')).toBe('consent')
    expect(basisOf('bought@example.com')).toBe('soft-opt-in')
  })

  it('defuses a name a spreadsheet would run as a formula', async () => {
    // Somebody types =HYPERLINK(...) into the quiz's name field; Excel executes
    // it when the founder opens the export. A leading apostrophe stops it.
    await upsertLead({ email: 'formula@example.com', firstName: '=HYPERLINK("http://evil")', source: 'quiz-reveal' })
    await optIn('formula@example.com')

    const rows = parse((await buildAudienceCsv()).csv)
    const header = rows[0]
    const name = rows.find((r) => r[header.indexOf('email')] === 'formula@example.com')![header.indexOf('first_name')]
    expect(name.startsWith("'=")).toBe(true)
  })

  it('survives a name with a comma and a quote in it', async () => {
    await upsertLead({ email: 'punct@example.com', firstName: 'Smith, "Bo"', source: 'quiz-reveal' })
    await optIn('punct@example.com')

    const rows = parse((await buildAudienceCsv()).csv)
    const header = rows[0]
    const row = rows.find((r) => r[header.indexOf('email')] === 'punct@example.com')!
    expect(row[header.indexOf('first_name')]).toBe('Smith, "Bo"')
    // The comma stayed inside its field rather than becoming a new column.
    expect(row).toHaveLength(EXPORT_COLUMNS.length)
  })

  it('can be asked for everybody, for a data audit rather than a campaign', async () => {
    await upsertLead({ email: 'audit@example.com', source: 'quiz-reveal' })
    const { csv } = await buildAudienceCsv({ includeSuppressed: true })
    expect(csv).toContain('audit@example.com')
  })

  it('dates the filename, so two exports are two files', () => {
    expect(exportFilename(new Date('2026-08-21T10:00:00Z'))).toBe('chrgd-audience-2026-08-21.csv')
  })
})
