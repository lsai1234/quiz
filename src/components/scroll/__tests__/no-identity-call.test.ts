import { readFileSync } from 'fs'

/**
 * The quiz no longer asks an AI model for an "identity" at the end.
 *
 * Its name, archetype, description, focus areas and "Routine fit" score were
 * all written by `gpt-4o-mini` (the score invented without seeing the
 * products), and nothing an AI writes may reach a customer. The reveal now
 * opens on the stack's own rule-based name. Both quiz versions finish the same
 * way, so both are checked.
 *
 * Read from source rather than rendered: the call sits in an async function
 * at the end of a long flow, and what matters is that it is not there at all.
 */
const FILES = ['src/components/scroll/Act2Quiz.tsx', 'src/components/quiz/v2/QuizV2.tsx']

/** Source with comments removed, so a note about what was removed can stay. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe.each(FILES)('%s', (path) => {
  const src = code(path)

  it('does not call /api/generate-identity', () => {
    expect(src).not.toMatch(/generate-identity/)
  })

  it('does not set an identity, or carry a fallback one', () => {
    expect(src).not.toMatch(/setIdentity|FALLBACK_IDENTITY|routineFitScore/)
  })

  it('still builds the stack and marks it ready, so Act 3 can finish', () => {
    expect(src).toMatch(/buildStackBlueprint\(/)
    expect(src).toMatch(/personaliseBlueprint\(/)
    expect(src).toMatch(/setStackBlueprint\(blueprint\)/)
    expect(src).toMatch(/finally\s*\{\s*useQuizStore\.getState\(\)\.setStackReady\(true\)/)
  })
})
