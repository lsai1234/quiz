import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * The primitive layer consumes tokens and nothing else.
 *
 * This is the rule the whole design system rests on, and it is the one that
 * degrades quietest — a single `#00D4FF` or `px-3` slipped into a primitive is
 * invisible in review and permanent in practice. The audit found that exact
 * decay already well advanced: the accent redeclared as a file-local constant in
 * 39 files, 92 distinct spacing values, 13 type sizes, two different reds.
 *
 * So the rule is asserted on the source rather than trusted. If a primitive
 * needs a value the tokens do not have, the answer is to add a token and say why
 * in `DESIGN.md` — not to reach past the system at the call site.
 *
 * Scope is `src/components/system` only. `src/components/ui` is the layer being
 * replaced and is deliberately exempt; it goes away as the last hub lands.
 */

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') out.push(...walk(path))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(path)
    }
  }
  return out
}

const FILES = walk('src/components/system')

/** The comment blocks are prose about the values, and cite them constantly. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the primitive layer', () => {
  it('is not empty, so the assertions below mean something', () => {
    expect(FILES.length).toBeGreaterThan(5)
  })

  it.each(FILES)('%s declares no colour of its own', (file) => {
    const source = code(readFileSync(file, 'utf8'))
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toMatch(/\brgba?\(/)
    expect(source).not.toMatch(/\b(?:hsl|oklch|color-mix)\(/)
  })

  it.each(FILES)('%s uses no Tailwind design utility', (file) => {
    // Token names look like utilities to a regex — `var(--shadow-raised)` is a
    // correct reference, `shadow-lg` is the thing being banned. Reading the
    // references out first is what separates them.
    const source = code(readFileSync(file, 'utf8')).replace(/var\(--[a-z0-9-]+\)/g, 'TOKEN')

    // Layout utilities are fine and expected — flex, grid, absolute, w-full,
    // overflow-y-auto. What is banned is anything carrying a design value:
    // colour, type size, weight, radius, shadow, spacing.
    const banned: [RegExp, string][] = [
      [/\bbg-\[?[a-z]/, 'background colour utility'],
      [/\btext-(?:xs|sm|base|lg|xl|\dxl|\[)/, 'type size utility'],
      [/\bfont-(?:thin|light|normal|medium|semibold|bold|extrabold|black)\b/, 'font weight utility'],
      [/\brounded(?:-|\b)/, 'radius utility'],
      [/\bshadow-/, 'shadow utility'],
      [/\b-?[pm][xytblre]?-\d/, 'padding or margin utility'],
      [/\bgap(?:-[xy])?-\d/, 'gap utility'],
      [/\bspace-[xy]-\d/, 'space-between utility'],
      [/\bborder-(?:\d|\[)/, 'border width utility'],
      [/\bopacity-\d/, 'opacity utility'],
      [/\bduration-\d/, 'duration utility'],
      [/\bease-(?:linear|in|out|in-out)\b/, 'easing utility'],
    ]

    for (const [pattern, what] of banned) {
      expect({ file, what, matched: pattern.exec(source)?.[0] ?? null }).toEqual({
        file,
        what,
        matched: null,
      })
    }
  })

  it.each(FILES)('%s writes no length literal into a style', (file) => {
    const source = code(readFileSync(file, 'utf8'))

    // Hairlines are the one exception: a 1px or 2px border is structural, and
    // there is no meaningful scale between them to tokenise. Everything with a
    // scale — spacing, radius, type, widths — has to come from a custom
    // property. `dvh`, `%` and `fr` are viewport and layout units, not values.
    const lengths = source.match(/\b\d+(?:\.\d+)?(?:px|rem|em)\b/g) ?? []
    const offenders = lengths.filter((l) => l !== '1px' && l !== '2px')

    expect({ file, offenders }).toEqual({ file, offenders: [] })
  })

  it.each(FILES)('%s reaches outside the system only for the glyph set', (file) => {
    const source = code(readFileSync(file, 'utf8'))
    const imports = [...source.matchAll(/from\s+'(@\/[^']+)'/g)].map((m) => m[1])

    // `Icon` renders in `currentColor` and holds no design values, so it is
    // shared rather than duplicated. `useReducedMotion` is behaviour, not style.
    // Anything else from the old layer would make this a wrapper around it.
    const allowed = ['@/components/ui/Icon', '@/hooks/useReducedMotion']
    expect(imports.filter((i) => !allowed.includes(i))).toEqual([])
  })
})
