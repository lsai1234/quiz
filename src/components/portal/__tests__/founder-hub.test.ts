import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Standing guarantees for the Founders Hub.
 *
 * The hub is being migrated onto the design system a few files at a time, and
 * these assertions are what stop the un-migrated remainder from being a hole.
 * Two things were true of it before this work and must never be true again:
 * no control anywhere had a visible focus state, and every file invented its
 * own copy of the palette.
 *
 * Both are asserted on the source, because both come back one convenient
 * copy-paste at a time.
 */

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') out.push(...walk(path))
    } else if (/\.tsx$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

const FILES = [...walk('src/components/portal'), ...walk('src/app/founderhub')]
const SYSTEM_CSS = readFileSync('src/app/system.css', 'utf8')

describe('the Founders Hub', () => {
  it('has files to check', () => {
    expect(FILES.length).toBeGreaterThan(40)
  })

  it('puts a focus ring under every control in the region', () => {
    // The floor, not a per-control opt-in. It was written when 131 raw buttons
    // and 88 raw form controls were still waiting to become primitives. They are
    // primitives now, so it protects one thing: the next raw control somebody
    // adds, which is covered the day it lands rather than the day it is noticed.
    // The selector covers both migrated regions — `.founder-hub` here and
    // `.my-hub` for My Hub and the Partners Hub. Asserted loosely enough that
    // adding a third region does not fail this, and tightly enough that dropping
    // this one does.
    expect(SYSTEM_CSS).toMatch(/:is\(\.founder-hub, \.my-hub\)/)
    expect(SYSTEM_CSS).toMatch(
      /:is\(button, \[role='button'\], a\[href\], input, select, textarea\):focus-visible/,
    )
  })

  it('applies that region class at both roots the hub can render', () => {
    // Signed in the shell wraps everything; signed out the login screen replaces
    // it entirely, and the two password fields guarding the hub are exactly the
    // controls that must not be missed.
    for (const root of ['src/components/portal/PortalShell.tsx', 'src/components/portal/PortalLogin.tsx']) {
      expect(readFileSync(root, 'utf8')).toContain('className="founder-hub"')
    }
  })

  it.each(FILES)('%s declares no colour of its own', (file) => {
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    // 95 file-local constants and 188 loose hex literals, all duplicates of a
    // token, and two of them disagreeing about what red is.
    expect(source).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    expect(source).not.toMatch(/^const (?:ACCENT|GREEN|AMBER|RED) = /m)
  })

  it.each(FILES)('%s uses no retired palette variable', (file) => {
    const source = readFileSync(file, 'utf8')
    // `--color-*` is the old palette. It still exists for the hubs that have not
    // been migrated, but nothing in Founders Hub may reach for it again.
    expect(source).not.toMatch(/var\(--color-[a-z0-9-]+\)/)
  })

  /**
   * ── The structural rule ────────────────────────────────────────────────────
   *
   * The palette rule above stopped the hub inventing colours. This one stops it
   * inventing controls. Both exist for the same reason: 151 hand-rolled buttons
   * and 79 hand-rolled fields did not arrive in one commit — they arrived one
   * reasonable-looking call site at a time, and nothing said no.
   *
   * A raw `<button>` is not a small thing to leave in. Every one of them in this
   * hub was missing at least one of: a focus ring, a disabled state, a busy
   * state, or — for the icon-only ones — a name. The primitives carry all four,
   * so reaching for the element directly is reaching past them.
   */
  const ALLOWED = {
    // The only slider in the product, in `PriceChanges`. A Slider primitive for
    // one call site would be a pattern with a single user; see the note there
    // and in `docs/DESIGN_ROLLOUT.md`. Native `<input type="range">` announces
    // its own role, name and value, and the region focus floor covers the ring.
    'src/components/portal/PriceChanges.tsx': ['input'],
    // The file input behind `ShareArtSettings`'s Upload button. It is
    // `className="hidden"` and never focusable — the Button is the control, and
    // this is the only way to open a native file picker.
    'src/components/portal/ShareArtSettings.tsx': ['input'],
    // The same pattern in `RosterImport`: a `className="hidden"` file input
    // behind the Choose-a-CSV Button. Opening a native file picker has no other
    // route, and the Button is the labelled, focusable control.
    'src/components/portal/RosterImport.tsx': ['input'],
    // And again in `ShopBannerSettings`, for the same reason: a hidden file
    // input behind the Choose-artwork Button.
    'src/components/portal/ShopBannerSettings.tsx': ['input'],
    // And in `VariantNameRepairPanel`, behind the catalogue-CSV Button. Same
    // pattern as the three above: `hidden`, never focusable, and the Button is
    // the control that is labelled and reachable.
    'src/components/portal/VariantNameRepairPanel.tsx': ['input'],
  } as const

  it.each(FILES)('%s builds its controls from the primitives', (file) => {
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    const allowed: readonly string[] = ALLOWED[file as keyof typeof ALLOWED] ?? []

    for (const tag of ['button', 'input', 'select', 'textarea']) {
      if (allowed.includes(tag)) continue
      expect({ file, tag, found: new RegExp(`<${tag}[\\s>]`).test(source) }).toEqual({
        file,
        tag,
        found: false,
      })
    }
  })
})
