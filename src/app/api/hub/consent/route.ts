import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import {
  listConsents,
  recordConsent,
  requestMetadata,
  validateConsent,
  consentErrorMessage,
} from '@/lib/legal/consent'
import { checkoutDocuments } from '@/lib/legal/content'
import { noticeFor, standingOf } from '@/lib/legal/campaign'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { syncPortalRuntime } from '@/lib/portal/store'

export const dynamic = 'force-dynamic'

/**
 * Re-consent, from the member's side.
 *
 * GET  → whether they are behind, and what to say about it
 * POST → record that they accepted the current terms
 *
 * The notice this drives is deliberately NOT blocking. A member who declines
 * carries on under the terms they already agreed to, and everything they pay for
 * keeps working. Gating a service someone is paying for behind terms they are
 * entitled to refuse is coercion dressed as compliance, and it would also
 * poison the consent it collected — an acceptance given to get past a wall is
 * not much of an acceptance.
 */
export async function GET() {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  await syncPortalRuntime()
  const consents = await listConsents(user.id)
  const versions = consents.flatMap((c) => c.documents.filter((d) => d.id === 'terms').map((d) => d.version))
  const standing = standingOf({ userId: user.id, email: user.email ?? null, acceptedTermsVersions: versions })

  return NextResponse.json({
    standing,
    notice: noticeFor(standing),
    documents: checkoutDocuments(getPricingConfig()),
  })
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  await syncPortalRuntime()
  let body: { accepted?: boolean; termsVersion?: string; disclaimerVersion?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validated against the documents WE are currently serving, never what the
  // payload claims — the same rule the checkout consent follows, and for the
  // same reason: a consent record is evidence, and evidence the client wrote is
  // not evidence.
  const result = validateConsent(
    { accepted: body.accepted === true, termsVersion: body.termsVersion ?? '', disclaimerVersion: body.disclaimerVersion ?? '' },
    getPricingConfig(),
  )
  if (!result.ok) {
    return NextResponse.json({ error: consentErrorMessage(result.error) }, { status: 400 })
  }

  await recordConsent({
    userId: user.id,
    context: 're-consent',
    documents: result.documents,
    ...requestMetadata(req),
  })
  return NextResponse.json({ ok: true })
}
