import { sharePersonas } from '@/lib/share-card/personas'
import { encodeSharePayload } from '@/lib/share-card/codec'
import { FORMATS, buildShareCardView, type ShareFormat } from '@/lib/share-card/format'

/**
 * Every card, every format, at true pixel size.
 *
 * The renderer runs inside Satori, which fails by producing a wrong-looking PNG
 * rather than by throwing. `format.test.ts` pins everything that can be
 * asserted — row counts, what each format shows — and this page is the rest:
 * the part only a person can sign off.
 *
 * The images come from the real image route rather than from an inline render,
 * so what is on this page is byte-identical to what a customer downloads. And
 * the personas come from `share-card/personas.ts`, the same list the render test
 * uses, so a preview that looks right cannot be a preview of a different card.
 *
 * The `?d=` payload in each URL is the stateless path from §3.5 of the
 * blueprint — the one that works with no database — which is exactly what a
 * styleguide needs.
 */

export const dynamic = 'force-static'

const FORMAT_IDS = Object.keys(FORMATS) as ShareFormat[]

/** Widths to show each format at on the page. The story is shown small enough to
 *  see whole; the OG at roughly the size a chat client unfurls it. */
const PREVIEW_WIDTH: Record<ShareFormat, number> = { story: 260, square: 320, og: 400, entry: 260 }

export default function ShareCardStyleguide() {
  const personas = sharePersonas()

  return (
    <main style={{ background: 'var(--ground-base)', minHeight: '100vh', padding: 'var(--space-8)' }}>
      <header style={{ maxWidth: '60rem', margin: '0 auto var(--space-8)' }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-micro)',
            letterSpacing: 'var(--tracking-eyebrow)',
            textTransform: 'uppercase',
            color: 'var(--accent)',
          }}
        >
          Styleguide
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-display)',
            letterSpacing: 'var(--tracking-display)',
            color: 'var(--ink-1)',
            margin: 'var(--space-2) 0',
          }}
        >
          Share card
        </h1>
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-body)', maxWidth: '46rem' }}>
          Six stacks the renderer has to survive, in all three formats, rendered by the
          same route a customer downloads from. The layout adapts to what each card is
          carrying: a card with a partner code trades a product row and some of the
          picture for the code band.
        </p>
        <p style={{ color: 'var(--tone-attention)', fontSize: 'var(--text-body)', maxWidth: '46rem', marginTop: 'var(--space-3)' }}>
          The art set does not exist yet. Every card below is falling back to a CHRGD
          product render — see <code>docs/SHARE_CARD_ART_BRIEF.md</code> for what the six
          images have to be. Judge the layout here, not the pictures.
        </p>
      </header>

      <div style={{ maxWidth: '60rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        {personas.map((persona) => {
          const encoded = encodeSharePayload(persona.payload)
          return (
            <section
              key={persona.id}
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--edge)',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-6)',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-title)',
                  letterSpacing: 'var(--tracking-title)',
                  color: 'var(--ink-1)',
                  margin: 0,
                }}
              >
                {persona.id}
              </h2>
              <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-body-sm)', margin: 'var(--space-2) 0 var(--space-5)' }}>
                {persona.note}
              </p>

              <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {FORMAT_IDS.map((format) => {
                  const view = buildShareCardView(persona.payload, format)
                  const spec = FORMATS[format]
                  const width = PREVIEW_WIDTH[format]
                  return (
                    <figure key={format} style={{ margin: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/share/image?format=${format}&d=${encoded}`}
                        alt={`${persona.id} — ${format}`}
                        width={width}
                        height={Math.round((spec.height / spec.width) * width)}
                        style={{ borderRadius: 'var(--radius-row)', border: '1px solid var(--edge)', display: 'block' }}
                      />
                      <figcaption
                        style={{
                          color: 'var(--ink-3)',
                          fontSize: 'var(--text-micro)',
                          fontFamily: 'var(--font-display)',
                          letterSpacing: 'var(--tracking-eyebrow)',
                          textTransform: 'uppercase',
                          marginTop: 'var(--space-3)',
                        }}
                      >
                        {format} · {spec.width}×{spec.height} · {view.lineup.length} of {persona.payload.lineup.length}
                        {view.artIsPlaceholder ? ' · placeholder art' : ''}
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
