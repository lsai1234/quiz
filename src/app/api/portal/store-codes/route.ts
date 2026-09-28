import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { createStoreCode, deleteStoreCode, listStoreCodes } from '@/lib/store-codes'

/**
 * Store discount codes, from the Founders Hub.
 *
 * GET lists them; POST `{ action: 'create', name, percent }` or
 * `{ action: 'delete', code }`. Every response carries the full list, so the
 * screen never has to patch its own copy.
 */
export const dynamic = 'force-dynamic'

async function payload() {
  return { codes: await listStoreCodes() }
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

  const action = String(body.action ?? '')

  if (action === 'create') {
    const result = await createStoreCode({
      name: typeof body.name === 'string' ? body.name : '',
      percent: typeof body.percent === 'number' ? body.percent : Number(body.percent),
    })
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 })
    return NextResponse.json({ ...(await payload()), created: result.code })
  }

  if (action === 'delete') {
    const code = typeof body.code === 'string' ? body.code : ''
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
    if (!(await deleteStoreCode(code))) {
      return NextResponse.json({ error: 'That is not one of the store codes.' }, { status: 404 })
    }
    return NextResponse.json(await payload())
  }

  return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 })
}
