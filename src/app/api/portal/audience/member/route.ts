import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { eraseAddress, subjectAccessRecord } from '@/lib/audience/rights'
import { isPlausibleEmail } from '@/lib/audience'

export const dynamic = 'force-dynamic'

/**
 * One person's record — for answering the two requests that arrive by email and
 * have a one-month clock on them.
 *
 * GET  — everything we hold for this address (UK GDPR Art. 15).
 * DELETE — erase them (Art. 17), keeping only the fact that they opted out.
 *          `lib/audience/rights.ts` explains why that exception is not a
 *          loophole: without it the address could be collected again tomorrow
 *          and start receiving exactly what they asked us to stop.
 */
export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = new URL(req.url).searchParams.get('email') ?? ''
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'Give an email address to look up.' }, { status: 400 })
  }

  return NextResponse.json(await subjectAccessRecord(email))
}

export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = new URL(req.url).searchParams.get('email') ?? ''
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ error: 'Give an email address to erase.' }, { status: 400 })
  }

  const result = await eraseAddress(email)
  console.info(`[audience] erasure: ${result.email}, ${result.consentsDeleted} consent rows, at ${new Date().toISOString()}`)
  return NextResponse.json(result)
}
