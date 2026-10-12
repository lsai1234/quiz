/**
 * Read a newline-delimited JSON reply one line at a time, as it arrives.
 *
 * The pull streams its progress ("Asking PowerBody about 3 SKUs…") because
 * finding an id past their list's ceiling can take a minute, and a screen that
 * shows nothing for a minute is indistinguishable from one that has hung. One
 * object per line, so a chunk that ends mid-line is held over rather than
 * dropped, and a line that does not parse is skipped rather than fatal — the
 * result line is what matters, and a garbled progress line must not lose it.
 *
 * A reply with no readable body (an error answered as plain JSON before the
 * stream began, or a test double) is read whole and split the same way, so the
 * caller has one path for both.
 */
export async function readNdjson(res: Response, onLine: (line: Record<string, unknown>) => void): Promise<void> {
  const emit = (raw: string) => {
    const line = raw.trim()
    if (!line) return
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed === 'object') onLine(parsed as Record<string, unknown>)
    } catch {
      /* a progress line that did not parse is not worth stopping for */
    }
  }

  const reader = res.body?.getReader?.()
  if (!reader) {
    const text = await res.text().catch(() => '')
    for (const line of text.split('\n')) emit(line)
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) emit(line)
  }
  emit(buffer + decoder.decode())
}
