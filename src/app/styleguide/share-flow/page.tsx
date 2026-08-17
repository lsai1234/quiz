import { sharePersonas } from '@/lib/share-card/personas'
import { ShareFlowBench } from './ShareFlowBench'

/**
 * The share journey, on a bench.
 *
 * `/styleguide/share` reviews the cards. This reviews the *flow around them* —
 * the tile on the reveal page, the sheet it opens, the card picker, the step
 * after a share, and the bottom rung when a browser will not save.
 *
 * It exists because none of that was reviewable without finishing a quiz. Every
 * change to the sheet was being made blind and signed off from a diff, which is
 * how it accumulated seven stacked blocks with the card as the smallest element
 * on it. `DESIGN.md` says review changes at `/styleguide`; this is where these
 * ones get reviewed.
 *
 * It uses the real components with a real persona payload, so what is on this
 * page is the flow, not a mock of it.
 */

export const dynamic = 'force-static'

export default function ShareFlowStyleguide() {
  const persona = sharePersonas()[0]

  return (
    <main style={{ background: 'var(--color-bg)', minHeight: '100vh', padding: '2rem 0 6rem' }}>
      <header style={{ maxWidth: '30rem', margin: '0 auto 1.5rem', padding: '0 1.25rem' }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.625rem',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
          }}
        >
          Styleguide
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
            margin: '0.4rem 0',
          }}
        >
          Share flow
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.8125rem', lineHeight: 1.6 }}>
          The tile as it sits on the reveal page, and the sheet it opens. The
          competition toggle fakes a live draw so the giveaway card, the prize chip
          and the entry step can be reviewed without switching the real campaign on.
          It fakes it in the browser only — the card image is drawn on the server
          from the real campaign, so the prize block appears on it once the draw is
          actually switched on in Founders Hub, not before.
        </p>
      </header>

      <ShareFlowBench payload={persona.payload} />
    </main>
  )
}
