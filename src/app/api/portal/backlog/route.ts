import { NextResponse } from 'next/server'
import { isPortalAuthed, getFounder } from '@/lib/portal/guard'
import {
  listItems,
  createItem,
  updateItem,
  reorder,
  deleteItem,
  BACKLOG_APPS,
  type BacklogApp,
  type NewBacklogItem,
  type BacklogItem,
} from '@/lib/portal/backlog'

export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ items: await listItems() })
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const founder = await getFounder()
  let body: NewBacklogItem
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!BACKLOG_APPS.includes(body.app as BacklogApp)) {
    return NextResponse.json({ error: `app must be one of ${BACKLOG_APPS.join(', ')}` }, { status: 400 })
  }
  const item = await createItem(body, founder?.name ?? 'Founder')
  return NextResponse.json({ item })
}

export async function PATCH(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string; patch?: Partial<BacklogItem>; orderedIds?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  // Reorder mode: an explicit ordering of ids.
  if (body.orderedIds) {
    return NextResponse.json({ items: await reorder(body.orderedIds) })
  }
  if (!body.id || !body.patch) return NextResponse.json({ error: 'id and patch required' }, { status: 400 })
  const item = await updateItem(body.id, body.patch)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item })
}

export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!(await deleteItem(body.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
