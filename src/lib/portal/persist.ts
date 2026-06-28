/**
 * Tiny JSON-file persistence for the Founders Hub.
 *
 * State that founders manage over time (product overrides, removed/imported
 * products, the improvements backlog) is written to JSON files under a `.data/`
 * directory at the project root, so it survives a server restart. This is the
 * single seam to swap for Vercel KV / Postgres later — callers only ever touch
 * `readJson` / `writeJson`.
 *
 * Server-only (uses node fs). Reads are synchronous (called rarely, on hydrate);
 * writes are synchronous too so a crash right after a mutation can't lose it.
 * Anything that can't be read/written falls back gracefully to the in-memory
 * value, so a read-only filesystem degrades to the old in-memory behaviour
 * rather than crashing.
 */
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), '.data')

function fileFor(name: string): string {
  return path.join(DATA_DIR, `${name}.json`)
}

/** Read a JSON file, returning `fallback` when it's missing or unreadable. */
export function readJson<T>(name: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(fileFor(name), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Write a JSON file, creating `.data/` on demand. Best-effort (never throws). */
export function writeJson<T>(name: string, data: T): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(fileFor(name), JSON.stringify(data, null, 2), 'utf8')
  } catch {
    /* read-only fs / sandbox — keep the in-memory value, just don't persist */
  }
}
