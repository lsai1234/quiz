import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The rules My Hub and the Partners Hub are held to.
 *
 * The sibling of `founder-hub.test.ts`, and deliberately the same shape. Both
 * hubs arrived at the same two problems by the same route: 277 `--color-*`
 * references and 38 hex literals across these directories, twelve file-local
 * `const ACCENT = '#00D4FF'` declarations, and four different hardcoded reds
 * across four files that each believed they were the same colour.
 *
 * None of that landed in one commit. It arrived one reasonable-looking call site
 * at a time, and nothing said no. These tests say no.
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

const FILES = [
  ...walk('src/components/hub'),
  ...walk('src/components/partner'),
  ...walk('src/components/auth'),
  ...walk('src/components/subscription'),
]
const SYSTEM_CSS = readFileSync('src/app/system.css', 'utf8')

/** Files allowed to keep a raw control, and why. */
const ALLOWED: Record<string, readonly string[]> = {}

/**
 * Hex allowed only where it is somebody else's trademark. A provider's logo is
 * their colour, not ours, and tokenising it would be wrong rather than tidy.
 */
const BRAND_HEX = new Set(['src/components/auth/ProviderButtons.tsx'])

describe('My Hub and the Partners Hub', () => {
  it('has files to check', () => {
    expect(FILES.length).toBeGreaterThan(25)
  })

  it('puts a focus ring under every control in the region', () => {
    // The floor, applied to the region rather than to each control — so a raw
    // control added tomorrow is covered the day it lands, not the day someone
    // notices. Shared with `.founder-hub`; see `system.css`.
    expect(SYSTEM_CSS).toMatch(/:is\(\.founder-hub, \.my-hub\)/)
  })

  it('applies that region class at every root these hubs can render', () => {
    // Signed in the shell wraps everything; signed out each login screen
    // replaces it entirely, and the password fields guarding an account are
    // exactly the controls that must not be missed.
    for (const root of [
      'src/components/hub/HubShell.tsx',
      'src/components/partner/PartnerDashboard.tsx',
      'src/components/partner/PartnerLogin.tsx',
      'src/components/partner/SetPassword.tsx',
    ]) {
      expect(readFileSync(root, 'utf8')).toContain('my-hub')
    }
  })

  it.each(FILES)('%s declares no colour of its own', (file) => {
    if (BRAND_HEX.has(file)) return
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(source).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    expect(source).not.toMatch(/^\s*const (?:ACCENT|GREEN|AMBER|RED) = /m)
  })

  it.each(FILES)('%s uses no retired palette variable', (file) => {
    const source = readFileSync(file, 'utf8')
    // `--color-*` is the old palette. It still exists for the quiz and the shop,
    // which have not been migrated, but nothing in these hubs may reach for it.
    expect(source).not.toMatch(/var\(--color-[a-z0-9-]+\)/)
  })

  it.each(FILES)('%s builds on the system rather than the layer it replaced', (file) => {
    const source = readFileSync(file, 'utf8')
    // `Icon` is the one shared import the system itself takes: a drawn glyph set
    // rendering in `currentColor`, with no design values of its own.
    const imports = [...source.matchAll(/from '@\/components\/ui\/(\w+)'/g)].map((m) => m[1])
    expect(imports.filter((name) => name !== 'Icon')).toEqual([])
  })

  it.each(FILES)('%s builds its controls from the primitives', (file) => {
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    const allowed = ALLOWED[file] ?? []
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
