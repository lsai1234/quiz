/**
 * @jest-environment node
 */
/**
 * Every OpenAI chat completion is made with `store: false`, so nothing we send
 * is kept on OpenAI's side as a stored completion. A static check over the
 * source, because a new route that forgets it would otherwise pass every test.
 */
import fs from 'fs'
import path from 'path'

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

it('sets store: false on every chat completion', () => {
  const missing: string[] = []
  let calls = 0
  for (const file of sources(path.join(process.cwd(), 'src'))) {
    const text = fs.readFileSync(file, 'utf8')
    let at = text.indexOf('chat.completions.create(')
    while (at >= 0) {
      calls++
      // The request object is the call's first argument; `store` sits beside `model`.
      if (!/store:\s*false/.test(text.slice(at, at + 600))) missing.push(path.relative(process.cwd(), file))
      at = text.indexOf('chat.completions.create(', at + 1)
    }
  }
  expect(calls).toBeGreaterThan(10)
  expect(missing).toEqual([])
})
