import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Standing guarantees for the hub, enforced on the source.
 *
 * These are the three defects that were true of essentially every interactive
 * element before this work: no focus ring, no reduced-motion guard, and touch
 * targets drawn at whatever size the layout happened to want. They're the kind
 * that come back one convenient copy-paste at a time, which is why they're
 * asserted rather than just fixed.
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

/**
 * Opening tags of `<name>`, aware of quotes and JSX braces so a `style={{…}}`
 * containing a `>` doesn't end the tag early.
 */
function openingTags(source: string, name: string): string[] {
  const found: string[] = []
  const re = new RegExp(`<${name}\\b`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length
    let depth = 0
    let quote: string | null = null
    while (i < source.length) {
      const c = source[i]
      if (quote) {
        if (c === quote && source[i - 1] !== '\\') quote = null
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c
      } else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) {
        found.push(source.slice(m.index, i + 1))
        break
      }
      i++
    }
  }
  return found
}

const FILES = walk('src/components/hub')
const UI = walk('src/components/ui')

describe('every control in the hub', () => {
  it('shows where the keyboard is', () => {
    // Before this, `hub/` contained no `focus-visible` anywhere at all: a
    // keyboard user got the UA default outline over a dark surface, or nothing.
    const offences: string[] = []
    for (const path of [...FILES, ...UI]) {
      const source = readFileSync(path, 'utf8')
      for (const tag of openingTags(source, 'button')) {
        if (!tag.includes('focus-visible')) {
          offences.push(`${path} — ${tag.replace(/\s+/g, ' ').slice(0, 70)}`)
        }
      }
    }
    expect(offences).toEqual([])
  })

  it('is big enough to hit', () => {
    // 44px is the floor. The stack card's micro-rating buttons were 32px and
    // the delivery stepper's +/− were 28px.
    const offences: string[] = []
    for (const path of [...FILES, ...UI]) {
      const source = readFileSync(path, 'utf8')
      for (const tag of openingTags(source, 'button')) {
        const sized = /\bh-(\d+)/.exec(tag)
        if (!sized) continue
        const px = Number(sized[1]) * 4
        // `hit-target` extends the tappable area past the drawn size.
        if (px < 44 && !tag.includes('hit-target')) {
          offences.push(`${path} — h-${sized[1]} (${px}px)`)
        }
      }
    }
    expect(offences).toEqual([])
  })
})

describe('anything that moves', () => {
  it('asks whether the visitor wanted it to', () => {
    // canvas-confetti fires a burst of particles across the viewport, and used
    // to do so regardless; GSAP staggered the whole dashboard in on every load.
    const animators = [...FILES, ...UI].filter((path) => {
      const source = readFileSync(path, 'utf8')
      return /\bconfetti\(|gsap\.(from|to|fromTo)\(/.test(source)
    })

    // A guard on the guard: if the imports move, this silently checks nothing.
    expect(animators.length).toBeGreaterThan(0)

    for (const path of animators) {
      expect(readFileSync(path, 'utf8')).toMatch(/reduced|prefers-reduced-motion/)
    }
  })
})
