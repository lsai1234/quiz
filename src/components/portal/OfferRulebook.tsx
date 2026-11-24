import { Card } from '@/components/system'
import { Icon } from '@/components/ui/Icon'
import { BUY_CHANNELS, CHANNEL_LABEL, OFFER_RULES } from '@/lib/offer/rulebook'

/**
 * Settings → Offer: every offer against every way to buy, in one table
 * (`lib/offer/rulebook`). The rules themselves live where checkout enforces
 * them; this is them side by side, and a test holds each cell to the code, so
 * what it says is what a customer is charged.
 */
export function OfferRulebook() {
  return (
    <section aria-labelledby="offer-rulebook" data-offer-rulebook>
      <Card>
        <h2
          id="offer-rulebook"
          style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-display)', fontFamily: 'var(--font-display)', color: 'var(--ink-1)' }}
        >
          Where each offer applies
        </h2>
        <p style={{ fontSize: 'var(--text-body-sm)', lineHeight: 'var(--leading-loose)', color: 'var(--ink-2)', marginTop: 'var(--space-2)', maxWidth: '48rem' }}>
          Every offer, against every way to buy. An offer with a switch only applies while it’s on. This table is checked against checkout by the
          test suite, so it can’t say something checkout doesn’t do.
        </p>
        <div style={{ overflowX: 'auto', marginTop: 'var(--space-4)' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '44rem', fontSize: 'var(--text-body-sm)' }}>
            <thead>
              <tr>
                <th scope="col" style={th}>
                  Offer
                </th>
                {BUY_CHANNELS.map((c) => (
                  <th key={c} scope="col" style={{ ...th, textAlign: 'center' }}>
                    {CHANNEL_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OFFER_RULES.map((rule) => (
                <tr key={rule.id} data-offer-rule={rule.id}>
                  <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 'var(--weight-strong)', color: 'var(--ink-1)' }}>
                    {rule.name}
                    {rule.switch && (
                      <span style={{ display: 'block', fontWeight: 'var(--weight-regular)', color: 'var(--ink-3)', fontSize: 'var(--text-meta)' }}>
                        Needs {rule.switch}
                      </span>
                    )}
                    <span style={{ display: 'block', fontWeight: 'var(--weight-regular)', color: 'var(--ink-2)', fontSize: 'var(--text-meta)', marginTop: 'var(--space-1)' }}>
                      {rule.note}
                    </span>
                  </th>
                  {BUY_CHANNELS.map((c) => (
                    <td key={c} style={{ ...td, textAlign: 'center' }}>
                      {rule.channels[c] ? (
                        <span style={{ color: 'var(--ink-1)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                          <Icon name="check" size={14} /> Yes
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink-3)' }}>No</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  )
}

const th = {
  padding: 'var(--space-2) var(--space-3)',
  borderBottom: '1px solid var(--edge)',
  color: 'var(--ink-3)',
  fontSize: 'var(--text-meta)',
  fontWeight: 'var(--weight-strong)',
  verticalAlign: 'bottom' as const,
}
const td = { padding: 'var(--space-3)', borderBottom: '1px solid var(--edge)', verticalAlign: 'top' as const }
