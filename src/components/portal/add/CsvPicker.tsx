'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Checkbox, Input, Note } from '@/components/system'
import { FilePickButton, readFileText } from '@/components/portal/FilePickButton'
import {
  groupCsvRows,
  groupMatches,
  looksLikePowerBodyCsv,
  parsePowerBodyCsv,
  type CsvProductGroup,
} from '@/lib/supplier/powerbody-csv'
import { MAX_CODES, normaliseCode, plural } from './lookup'
import type { LookupBatch } from './useLookup'
import { Lede, Row, SectionTitle, Stack, bodyText, metaText } from './ui'

/** How many products are drawn at once. The file has thousands. */
const PAGE = 30

/**
 * Pick products out of PowerBody's own catalogue spreadsheet.
 *
 * ── Why the file is not enough on its own ─────────────────────────────────
 * PowerBody's spreadsheet lists every SKU with its name, flavour, stock band
 * and picture — but no product id and no cost. Every useful call (details,
 * live stock, the price we pay, placing an order) needs the id, so the codes
 * ticked here go through exactly the same lookup as codes typed into the box.
 * The file's job is choosing: 8,000 lines become a searchable list of products,
 * each with its flavours under it.
 *
 * Grouped by brand and name-without-flavour (`groupCsvRows`), so the flavours
 * of one tub sit together and are looked up together — which is what makes
 * "one product with flavours" the natural way to add them. The size stays in
 * the name, so a 75g and a 300g are two products, as they must be.
 *
 * Parsed in the browser: the file is a megabyte, nothing about choosing from
 * it needs the server, and it never has to be uploaded anywhere.
 */
export function CsvPicker({
  incoming,
  busy,
  onLookUp,
  onRoster,
}: {
  /** A file handed over from elsewhere on the page (the roster importer refusing it). */
  incoming: { text: string; fileName: string; nonce: number } | null
  busy: boolean
  onLookUp: (batches: LookupBatch[]) => void
  /** Go to the roster importer — for a file that turns out to be a roster. */
  onRoster: () => void
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [groups, setGroups] = useState<CsvProductGroup[] | null>(null)
  const [skuCount, setSkuCount] = useState(0)
  const [problem, setProblem] = useState<{ text: string; roster?: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  const load = useCallback((text: string, name: string) => {
    setFileName(name)
    setProblem(null)
    setTicked(new Set())
    setQuery('')
    setLimit(PAGE)
    if (!looksLikePowerBodyCsv(text)) {
      setGroups(null)
      setProblem({
        text:
          `${name} is not PowerBody’s catalogue spreadsheet — its first line should start “sku;manufacturer_name;name”. ` +
          'If it is your own list of what to sell, with your swap groups and goals, it goes in “Import a roster spreadsheet” below.',
        roster: true,
      })
      return
    }
    const rows = parsePowerBodyCsv(text)
    if (rows.length === 0) {
      setGroups(null)
      setProblem({ text: `${name} has the right heading but no product rows. Download it again from PowerBody’s dashboard and choose the new copy.` })
      return
    }
    setSkuCount(rows.length)
    setGroups(groupCsvRows(rows))
  }, [])

  useEffect(() => {
    if (incoming) load(incoming.text, incoming.fileName)
  }, [incoming, load])

  const onFile = async (file: File) => {
    try {
      load(await readFileText(file), file.name)
    } catch {
      setProblem({ text: `${file.name} could not be read. Choose it again — if it is open in Excel, close it first.` })
    }
  }

  const matching = useMemo(() => (groups ?? []).filter((g) => groupMatches(g, query)), [groups, query])
  const shown = matching.slice(0, limit)
  const tickedGroups = (groups ?? []).filter((g) => g.rows.some((r) => ticked.has(r.sku)))

  const toggle = (sku: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(sku)
      else next.delete(sku)
      return next
    })
  const toggleGroup = (group: CsvProductGroup, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev)
      for (const r of group.rows) {
        if (on) next.add(r.sku)
        else next.delete(r.sku)
      }
      return next
    })

  const lookUp = () => {
    const batches: LookupBatch[] = tickedGroups.map((g) => ({
      title: g.title,
      brand: g.brand,
      source: 'csv',
      codes: g.rows.filter((r) => ticked.has(r.sku)).map((r) => normaliseCode(r.sku)),
    }))
    onLookUp(batches)
    setTicked(new Set())
  }
  const tooMany = ticked.size > MAX_CODES

  return (
    <Card padding="normal" as="section">
      <Stack gap="var(--space-4)">
        <div>
          <SectionTitle>Pick from PowerBody’s spreadsheet</SectionTitle>
          <Lede>
            The catalogue file you can download from PowerBody’s dashboard lists every product with its flavours and
            picture — but no product ids and no cost. So the ones you tick here are looked up, exactly as if you had
            typed them in the box above, to get their id, what they charge us and live stock.
          </Lede>
        </div>

        <Row>
          <FilePickButton accept=".csv,text/csv,text/plain" variant={groups ? 'secondary' : 'primary'} size="sm" onFile={onFile}>
            {groups ? 'Choose another file' : 'Choose PowerBody’s spreadsheet'}
          </FilePickButton>
          {fileName && groups && (
            <span style={metaText}>
              {fileName}: {plural(groups.length, 'product')}, {plural(skuCount, 'SKU')}
            </span>
          )}
        </Row>

        {problem && (
          <Note tone="attention" live="polite">
            {problem.text}{' '}
            {problem.roster && (
              <Button size="sm" variant="ghost" onClick={onRoster}>
                Go to the roster import
              </Button>
            )}
          </Note>
        )}

        {groups && (
          <>
            <Input
              label="Search the spreadsheet"
              placeholder="Name, brand, flavour or SKU"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLimit(PAGE)
              }}
            />

            {matching.length === 0 ? (
              <p style={metaText}>Nothing in the file matches “{query}”. Try the brand on its own, or part of the name.</p>
            ) : (
              <ul className="flex flex-col" style={{ gap: 'var(--space-2)' }} aria-label="Products in the spreadsheet">
                {shown.map((g) => (
                  <CsvGroupRow key={g.key} group={g} ticked={ticked} onToggle={toggle} onToggleAll={toggleGroup} />
                ))}
              </ul>
            )}
            {matching.length > shown.length && (
              <Row>
                <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                  Show {Math.min(PAGE, matching.length - shown.length)} more
                </Button>
                <span style={metaText}>
                  {shown.length} of {matching.length} shown — or narrow the search.
                </span>
              </Row>
            )}

            <Row>
              <Button variant="primary" disabled={ticked.size === 0 || tooMany} loading={busy && ticked.size > 0} onClick={lookUp}>
                {ticked.size === 0 ? 'Tick the flavours you want' : `Look up ${ticked.size} ticked`}
              </Button>
              {ticked.size > 0 && (
                <span style={tooMany ? { ...metaText, color: 'var(--tone-critical)' } : metaText}>
                  {tooMany
                    ? `That is ${ticked.size} — look up ${MAX_CODES} or fewer at a time.`
                    : `From ${plural(tickedGroups.length, 'product')}. Each product’s flavours are kept together.`}
                </span>
              )}
            </Row>
          </>
        )}
      </Stack>
    </Card>
  )
}

function CsvGroupRow({
  group,
  ticked,
  onToggle,
  onToggleAll,
}: {
  group: CsvProductGroup
  ticked: Set<string>
  onToggle: (sku: string, on: boolean) => void
  onToggleAll: (group: CsvProductGroup, on: boolean) => void
}) {
  const count = group.rows.filter((r) => ticked.has(r.sku)).length
  const all = count === group.rows.length
  return (
    <Card as="li" solid padding="tight">
      <Stack gap="var(--space-2)">
        <Row>
          <span style={{ ...bodyText, color: 'var(--ink-1)', fontWeight: 'var(--weight-strong)' }}>{group.title}</span>
          {group.brand && <span style={metaText}>{group.brand}</span>}
          <Badge tone="neutral">{plural(group.rows.length, 'flavour')}</Badge>
          {group.rows.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => onToggleAll(group, !all)}>
              {all ? 'Untick all' : `Tick all ${group.rows.length}`}
            </Button>
          )}
        </Row>
        <div className="grid" style={{ gap: 'var(--space-2)', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, calc(var(--space-8) * 8)), 1fr))' }}>
          {group.rows.map((r) => (
            <Checkbox
              key={r.sku}
              label={r.label}
              hint={`${r.sku}${r.qty ? ` · ${r.qty} in stock` : ''}`}
              checked={ticked.has(r.sku)}
              onChange={(e) => onToggle(r.sku, e.target.checked)}
            />
          ))}
        </div>
      </Stack>
    </Card>
  )
}
