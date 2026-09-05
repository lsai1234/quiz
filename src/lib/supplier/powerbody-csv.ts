/**
 * PowerBody's dropshipping catalogue export.
 *
 * The file a founder can download from their dashboard at any time. One row per
 * SKU, semicolon separated:
 *
 *   sku;manufacturer_name;name;qty;flavour;weight;img_url;retail_price;
 *
 * ── Why read a CSV when there is an API ─────────────────────────────────────
 * Because the API is the part that fails. Naming a product's flavours needs one
 * detail call per SKU, and a product with six flavours across ten products is
 * sixty calls that can rate-limit, time out, or answer for a SKU that has since
 * moved. This file has every SKU PowerBody sell, is a megabyte, and cannot fail
 * halfway.
 *
 * It is not a replacement for the feed — there is no cost price here, only
 * `retail_price`, so nothing in this file can be used to price anything. It is
 * a source of NAMES, which is exactly what the flavour repair needs.
 *
 * ── The flavour column is not enough on its own ─────────────────────────────
 * It is blank on more than half the rows, including rows whose name plainly
 * carries a flavour — "Creatine HCl, Fruit Punch - 75g" ships with an empty
 * flavour field. So the name is the primary source and the column is a
 * cross-check, never the other way round.
 *
 * Pure: no network, no database, no DOM.
 */

export interface PowerBodyCsvRow {
  sku: string
  brand: string
  /** The full product name, flavour and size included. */
  name: string
  /** PowerBody's own flavour field. Frequently blank — see the header. */
  flavour: string | null
  /** `50+`, `0`, `12` — a band as often as a number, so it stays a string. */
  qty: string
  imageUrl: string | null
}

const HEADER_SKU = 'sku'

/** A field that is present but empty, which this file writes as a single space. */
function field(value: string | undefined): string {
  return (value ?? '').trim()
}

/**
 * Parse the export into rows, skipping anything malformed.
 *
 * Tolerant on purpose: this is a file somebody downloaded and may have opened
 * in Excel on the way past. A row that does not have the columns is skipped
 * rather than throwing, because one bad line should not cost the other eight
 * thousand.
 */
export function parsePowerBodyCsv(text: string): PowerBodyCsvRow[] {
  const rows: PowerBodyCsvRow[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const cells = line.split(';')
    if (cells.length < 7) continue

    const sku = field(cells[0])
    if (!sku || sku.toLowerCase() === HEADER_SKU) continue

    const name = field(cells[2])
    if (!name) continue

    const flavour = field(cells[4])
    const imageUrl = field(cells[6])

    rows.push({
      sku,
      brand: field(cells[1]),
      name,
      flavour: flavour || null,
      qty: field(cells[3]),
      imageUrl: imageUrl || null,
    })
  }

  return rows
}

/** The same, keyed by SKU, for looking a code up. */
export function indexPowerBodyCsv(text: string): Map<string, PowerBodyCsvRow> {
  const map = new Map<string, PowerBodyCsvRow>()
  // Last row wins. A duplicated SKU in an export is the later line being the
  // more recent one, and either way a stable rule beats an arbitrary one.
  for (const row of parsePowerBodyCsv(text)) map.set(row.sku, row)
  return map
}

/**
 * Does this text look like the export at all?
 *
 * Checked before anything is parsed so a founder who picks the wrong file gets
 * told which file to pick, rather than "0 flavours named" and no idea why.
 */
export function looksLikePowerBodyCsv(text: string): boolean {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const cells = first.toLowerCase().split(';').map((c) => c.trim())
  return cells[0] === HEADER_SKU && cells.includes('name')
}
