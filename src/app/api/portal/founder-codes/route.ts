import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import { createFounderCode, listFounderCodes, revokeFounderCode } from '@/lib/founder-codes/repo'
import { founderCodeState } from '@/lib/founder-codes/codes'
import type { FounderCode, FounderCodeKind } from '@/lib/founder-codes/types'

/**
 * Founder codes, from the Founders Hub.
 *
 * Issuing one is the whole point, and it is why this route sits behind
 * `isPortalAuthed`: a code from here can make an order cost nothing. Every
 * response carries each code's computed state, so the screen never has to work
 * out from three timestamps whether a row is still live.
 */
export const dynamic = 'force-dynamic'

const KINDS: FounderCodeKind[] = ['free', 'cost', 'unlock']

/** A code plus the one derived fact every caller wants. */
function withState(code: FounderCode) {
  return { ...code, state: founderCodeState(code) }
}

async function payload() {
  return { codes: (await listFounderCodes()).map(withState) }
}

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload())
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const action = String(body.action ?? 'generate')

  if (action === 'generate') {
    const kind = String(body.kind ?? '') as FounderCodeKind
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Pick one of the three kinds of code.' }, { status: 400 })
    }
    // Attribution, not authorisation — the session above is what authorises
    // this. Recorded because "who issued the code that made this order free" is
    // a question with exactly one useful answer.
    const founder = await getFounder()
    const note = typeof body.note === 'string' ? body.note.slice(0, 200) : null
    const code = await createFounderCode({ kind, note, createdBy: founder?.email ?? null })
    return NextResponse.json({ ...(await payload()), created: withState(code) })
  }

  if (action === 'revoke') {
    const code = typeof body.code === 'string' ? body.code : ''
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
    await revokeFounderCode(code)
    return NextResponse.json(await payload())
  }

  return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 })
}
