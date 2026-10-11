'use client'

import { Badge, Button, Card, Skeleton } from '@/components/system'
import { SUPPLIER_SETTINGS_HREF } from '@/lib/portal/product-links'
import { daysSince, shortDate } from './lookup'
import { Row, Stack, TextLink, bodyText, metaText } from './ui'

export interface SupplierStatus {
  /** What the founder chose in Settings → Supplier. */
  mode?: 'auto' | 'mock' | 'powerbody'
  /** What actually answers: the sample catalogue or PowerBody. */
  effective?: 'mock' | 'powerbody'
  hasCredentials?: boolean
  /** PowerBody answered like their DEMO sandbox. Learnt from a lookup, not asked. */
  demo?: boolean
}

export interface IndexStatus {
  products: number
  complete: boolean
  updatedAt: string | null
}

/**
 * What every lookup on this page depends on, said before the first one.
 *
 * The old tab's errors — "PowerBody timed out", "SKU not found" — were mostly
 * one of three standing conditions showing through: the sample catalogue
 * answering instead of PowerBody, the index never built (so every code is a
 * slow search), or the account still on PowerBody's DEMO sandbox. Each is
 * shown here, plainly, with the button that changes it.
 */
export function StatusStrip({
  supplier,
  index,
  indexError,
  onOpenIndex,
  onShowSkus,
  showingSkus,
}: {
  supplier: SupplierStatus | null
  index: IndexStatus | null
  indexError: boolean
  onOpenIndex: () => void
  onShowSkus: () => void
  showingSkus: boolean
}) {
  const sample = supplier?.effective === 'mock'
  const quietSkus = !sample && !supplier?.demo

  return (
    <Card padding="tight" as="section">
      <Stack gap="var(--space-3)">
        <Row align="start" gap="var(--space-3)">
          <span style={{ ...metaText, minWidth: 'calc(var(--space-8) * 3)' }}>Answering</span>
          <div className="min-w-0 flex-1">
            <SupplierLine supplier={supplier} />
          </div>
        </Row>

        <Row align="start" gap="var(--space-3)">
          <span style={{ ...metaText, minWidth: 'calc(var(--space-8) * 3)' }}>Product index</span>
          <div className="min-w-0 flex-1">
            <Row>
              <IndexLine index={index} error={indexError} sample={sample} />
              <Button size="sm" variant={index && index.products === 0 && !sample ? 'primary' : 'ghost'} onClick={onOpenIndex}>
                {index && index.products > 0 ? 'Refresh the index' : 'Build the index'}
              </Button>
            </Row>
          </div>
        </Row>

        <Row>
          {/* The diagnostics are where "why won't it answer" is settled call by
              call — linked from here rather than repeated. */}
          <TextLink href={SUPPLIER_SETTINGS_HREF}>Run the checks</TextLink>
          <span style={metaText}>— every PowerBody call, one at a time, under Settings → Supplier → Test the integration.</span>
        </Row>

        {/* On the sample catalogue or a DEMO account there is no other way to
            find a code that exists, so it is a real button there and a quiet
            one everywhere else. */}
        <Row>
          <Button size="sm" variant={quietSkus ? 'ghost' : 'secondary'} onClick={onShowSkus} aria-expanded={showingSkus}>
            Show me some SKUs
          </Button>
          {!quietSkus && (
            <span style={metaText}>
              {sample ? 'Codes from the sample catalogue, to try the page with.' : 'Codes the DEMO account actually has.'}
            </span>
          )}
        </Row>
      </Stack>
    </Card>
  )
}

function SupplierLine({ supplier }: { supplier: SupplierStatus | null }) {
  if (!supplier) return <Skeleton height="var(--space-5)" width="60%" />
  const settings = <TextLink href={SUPPLIER_SETTINGS_HREF}>Settings → Supplier</TextLink>

  if (supplier.effective === 'mock') {
    const wantedLive = supplier.mode === 'powerbody' || supplier.mode === 'auto'
    return (
      <Stack gap="var(--space-1)">
        <Row>
          <Badge tone="attention" dot>
            Sample
          </Badge>
          <span style={bodyText}>The built-in sample catalogue — nothing is asked of PowerBody.</span>
        </Row>
        <span style={metaText}>
          {wantedLive && supplier.hasCredentials === false
            ? 'Live PowerBody is chosen, but no PowerBody login is set, so the sample answers. Add the API login, then check '
            : 'Switch to Live PowerBody in '}
          {settings}.
        </span>
      </Stack>
    )
  }

  if (supplier.demo) {
    return (
      <Stack gap="var(--space-1)">
        <Row>
          <Badge tone="attention" dot>
            PowerBody DEMO
          </Badge>
          <span style={bodyText}>PowerBody’s answers look like their DEMO sandbox account.</span>
        </Row>
        <span style={metaText}>
          A DEMO account cannot look products up. Only PowerBody can switch it to live — ask your account manager. The
          checks in {settings} show exactly what it answers.
        </span>
      </Stack>
    )
  }

  return (
    <Row>
      <Badge tone="positive" dot>
        Live PowerBody
      </Badge>
      <span style={metaText}>Lookups ask PowerBody’s API. Change it in {settings}.</span>
    </Row>
  )
}

function IndexLine({ index, error, sample }: { index: IndexStatus | null; error: boolean; sample: boolean }) {
  if (error && !index) {
    return <span style={metaText}>Could not read the index just now — lookups still work, just slower.</span>
  }
  if (!index) return <Skeleton height="var(--space-5)" width="40%" />
  if (sample && index.products === 0) {
    return <span style={metaText}>Not built — not needed while the sample catalogue answers.</span>
  }
  const count = index.products.toLocaleString('en-GB')
  if (index.products === 0) {
    return (
      <span style={bodyText}>
        Not built — so every code is searched for one id at a time, which can take minutes a code. Build it once and
        lookups are instant.
      </span>
    )
  }
  const when = shortDate(index.updatedAt)
  const age = daysSince(index.updatedAt)
  if (index.complete) {
    return (
      <span style={bodyText}>
        {count} PowerBody products indexed{when ? `, read in full on ${when}` : ''}.
        {age !== null && age > 7 ? ' Over a week old — refresh it so new products are in it.' : ''}
      </span>
    )
  }
  return (
    <span style={bodyText}>
      {count} PowerBody products indexed — partly read, so lookups past it are slower. Carry on building it to finish.
    </span>
  )
}
