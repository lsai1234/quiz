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
    // The floor, not a per-control opt-in. 131 raw buttons and 88 raw form
    // controls are still waiting to become primitives; this is what makes their
    // focus state correct in the meantime, and what covers the next raw one
    // somebody adds.
    expect(SYSTEM_CSS).toMatch(
      /\.founder-hub :is\(button, \[role='button'\], a\[href\], input, select, textarea\):focus-visible/,
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
})
