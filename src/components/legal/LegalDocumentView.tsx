import type { LegalDocument } from '@/lib/legal/content'

const ACCENT = '#00D4FF'

/**
 * Renders a legal document as readable prose. Server component — the documents
 * are static data, so there's nothing to hydrate.
 *
 * Deliberately plain: generous line height, real paragraph spacing, and a
 * contents list at the top. Terms people can't read are terms that don't inform
 * anyone, whatever they say.
 */
export function LegalDocumentView({ doc, warning }: { doc: LegalDocument; warning?: string | null }) {
  return (
    <article className="max-w-2xl mx-auto px-5 py-10">
      <header className="mb-8">
        <p
          className="text-[10px] font-bold tracking-widest uppercase mb-2"
          style={{ color: ACCENT, fontFamily: 'var(--font-display)' }}
        >
          CHRGD · Version {doc.version}
        </p>
        <h1
          className="text-3xl font-black mb-3"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
        >
          {doc.title}
        </h1>
        <p className="text-sm text-[var(--color-muted)] leading-relaxed">{doc.summary}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-3">
          In effect from {doc.effectiveFrom}.
        </p>
      </header>

      {warning && (
        <div
          className="mb-8 rounded-2xl px-4 py-3 text-xs leading-relaxed"
          style={{
            color: '#fbbf24',
            background: 'color-mix(in srgb, #fbbf24 10%, transparent)',
            border: '1px solid color-mix(in srgb, #fbbf24 30%, transparent)',
          }}
          role="alert"
        >
          {warning}
        </div>
      )}

      <nav className="mb-10 rounded-2xl border border-[var(--color-border)] p-4" style={{ background: 'var(--color-surface)' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2 text-[var(--color-muted)]">Contents</p>
        <ol className="space-y-1">
          {doc.sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-xs text-[var(--color-text-2)] hover:underline">
                {i + 1}. {s.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-9">
        {doc.sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-6">
            <h2
              className="text-lg font-black mb-3"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}
            >
              {i + 1}. {s.heading}
            </h2>
            <div className="space-y-3">
              {s.body.map((p, j) => (
                <p key={j} className="text-sm leading-relaxed text-[var(--color-text-2)]">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
