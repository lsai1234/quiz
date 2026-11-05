import type { Metadata } from 'next'
import { Card, Ground } from '@/components/system'
import { GuideActions, GuideTrainingLink } from '@/components/guide/GuideActions'
import { getOfferSettings } from '@/lib/offer/store'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { getGuide } from '@/lib/guide/store'
import { longDate } from '@/lib/guide/build'
import { GUIDE_COPY } from '@/lib/guide/copy'
import { ROUTINE_COPY } from '@/lib/routine/copy'
import { spokenClock } from '@/lib/routine/ring'
import { NOT_MEDICAL_ADVICE_SENTENCE } from '@/lib/legal/content'

/**
 * The stack guide as a page: the same content as the image and the email, as
 * real text (the image's alt, in effect), with the calendar file and the image
 * to save. Reached only by its token; never indexed.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your stack guide · CHRGD',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

const eyebrow = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-strong)',
  letterSpacing: 'var(--tracking-eyebrow)',
  textTransform: 'uppercase' as const,
  color: 'var(--accent)',
}

export default async function GuidePage({ params }: Props) {
  const { token } = await params
  const guide = await getGuide(token)
  const training = guide ? (await getOfferSettings()).services.training : false

  return (
    <Ground className="my-hub">
      <header style={{ borderBottom: '1px solid var(--edge)' }}>
        <div className="max-w-lg mx-auto flex items-center" style={{ padding: 'var(--space-3) var(--gutter)' }}>
          <CHRGDLogo markSize={20} wordClassName="text-base" />
        </div>
      </header>
      <main className="max-w-lg mx-auto" style={{ padding: 'var(--space-6) var(--gutter) var(--space-8)' }}>
        {!guide ? (
          <Card padding="roomy">
            <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body)' }}>{GUIDE_COPY.notFound}</p>
          </Card>
        ) : (
          <GuideBody guide={guide} training={training} />
        )}
      </main>
    </Ground>
  )
}

function GuideBody({ guide, training }: { guide: NonNullable<Awaited<ReturnType<typeof getGuide>>>; training: boolean }) {
  const timed = guide.routine.moments.filter((m) => m.minutes !== null)
  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: 'var(--stack)' }} data-guide>
      <header>
        <p style={eyebrow}>{GUIDE_COPY.eyebrow}</p>
        <h1
          style={{ marginTop: 'var(--space-2)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-hero)', fontWeight: 'var(--weight-strong)', letterSpacing: 'var(--tracking-display)', lineHeight: 'var(--leading-tight)', color: 'var(--ink-1)' }}
        >
          {GUIDE_COPY.title(guide.firstName)}
        </h1>
        {guide.stackName && (
          <p style={{ marginTop: 'var(--space-2)', color: 'var(--ink-3)', fontSize: 'var(--text-meta)' }}>
            {GUIDE_COPY.madeFor(guide.stackName)} · {GUIDE_COPY.plan[guide.plan]}
          </p>
        )}
        <p style={{ marginTop: 'var(--space-3)', color: 'var(--ink-2)', fontSize: 'var(--text-body)', lineHeight: 'var(--leading-body)' }}>{GUIDE_COPY.intro}</p>
      </header>

      <GuideActions token={guide.token} />
      <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-meta)', marginTop: 'calc(var(--space-2) * -1)' }}>{GUIDE_COPY.remindersNote}</p>

      <Card padding="roomy" glow="accent">
        <h2 style={eyebrow}>{GUIDE_COPY.routineHeading}</h2>
        <ol style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {guide.routine.moments.map((m) => {
            const n = m.minutes === null ? null : timed.indexOf(m) + 1
            return (
              <li key={`${m.minutes}-${m.label}`} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0, width: 'var(--control-sm)', height: 'var(--control-sm)', borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: n ? 'var(--accent)' : 'transparent', border: n ? 'none' : '1px dashed var(--edge-strong)', color: 'var(--ink-on-accent)', fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-body-sm)',
                  }}
                >
                  {n ?? ''}
                </span>
                <div>
                  <p style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body)', fontWeight: 'var(--weight-strong)' }}>
                    {[m.minutes === null ? null : spokenClock(m.minutes), m.label].filter(Boolean).join(' · ')}
                  </p>
                  <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', marginTop: 'var(--space-1)' }}>
                    {m.items.map((i) => (i.days === 'every-day' ? i.title : `${i.title} (${i.daysLabel})`)).join(', ')}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        <p style={{ marginTop: 'var(--space-4)', color: 'var(--ink-3)', fontSize: 'var(--text-meta)' }}>{ROUTINE_COPY.labelFirst}</p>
      </Card>

      <section aria-labelledby="guide-products" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 id="guide-products" style={eyebrow}>{GUIDE_COPY.productsHeading}</h2>
        {guide.products.map((p) => (
          <Card key={p.id} padding="roomy" solid>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-title)', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)', lineHeight: 'var(--leading-tight)' }}>{p.short}</h3>
            {p.type.toLowerCase() !== p.short.toLowerCase() && <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)' }}>{p.type}</p>}
            <dl style={{ marginTop: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 'var(--space-3)', rowGap: 'var(--space-2)', fontSize: 'var(--text-body-sm)' }}>
              <dt style={{ color: 'var(--ink-3)' }}>{GUIDE_COPY.when}</dt>
              <dd style={{ color: 'var(--ink-1)' }}>{[p.time, p.moment, p.daysLabel].filter(Boolean).join(' · ')}</dd>
              <dt style={{ color: 'var(--ink-3)' }}>{GUIDE_COPY.howMuch}</dt>
              <dd style={{ color: 'var(--ink-1)' }}>{p.amount}</dd>
              {p.serving && (
                <>
                  <dt style={{ color: 'var(--ink-3)' }}>{GUIDE_COPY.eachServing}</dt>
                  <dd style={{ color: 'var(--ink-1)' }}>{p.serving}</dd>
                </>
              )}
            </dl>
            <div style={{ marginTop: 'var(--space-4)' }}>
              <p style={{ ...eyebrow, color: 'var(--ink-3)' }}>{GUIDE_COPY.scienceHeading}</p>
              {p.claims.length > 0 ? (
                p.claims.map((c) => (
                  <blockquote key={c.id} style={{ marginTop: 'var(--space-2)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--accent)' }}>
                    <p style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)' }}>“{c.wording}”</p>
                    <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)' }}>{GUIDE_COPY.conditionOfUse(c.condition)}</p>
                  </blockquote>
                ))
              ) : (
                <p style={{ marginTop: 'var(--space-2)', color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)' }}>{GUIDE_COPY.noClaim}</p>
              )}
            </div>
            {p.warnings.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <p style={{ ...eyebrow, color: 'var(--ink-3)' }}>{GUIDE_COPY.safeHeading}</p>
                <ul style={{ marginTop: 'var(--space-2)' }}>
                  {p.warnings.map((w) => (
                    <li key={w} style={{ color: 'var(--ink-2)', fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-body)' }}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
        <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-meta)' }}>{GUIDE_COPY.scienceNote}</p>
      </section>

      {guide.services.length > 0 && (
        <Card padding="roomy">
          <h2 style={eyebrow}>{GUIDE_COPY.servicesHeading}</h2>
          <ul style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {guide.services.map((s) => (
              <li key={s} style={{ color: 'var(--ink-1)', fontSize: 'var(--text-body-sm)' }}>✓ {s}</li>
            ))}
          </ul>
          {training && (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <GuideTrainingLink />
            </div>
          )}
        </Card>
      )}

      <Card padding="roomy">
        <h2 style={eyebrow}>{GUIDE_COPY.checkInHeading}</h2>
        <p style={{ marginTop: 'var(--space-3)', color: 'var(--ink-2)', fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-body)' }}>{GUIDE_COPY.checkIn(longDate(guide.checkInOn))}</p>
      </Card>

      <p style={{ color: 'var(--ink-3)', fontSize: 'var(--text-meta)', lineHeight: 'var(--leading-body)' }}>{NOT_MEDICAL_ADVICE_SENTENCE}</p>
    </article>
  )
}
