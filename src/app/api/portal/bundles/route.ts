import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import type { PrebuiltBundle } from '@/lib/bundles'
import {
  getPortalBundles,
  createBundle,
  editBundle,
  setBundlePublished,
  reorderBundles,
  removeBundle,
  restoreBundle,
  deleteBundle,
  duplicateBundle,
} from '@/lib/bundles/store'

export const dynamic = 'force-dynamic'

/** All bundles (including drafts/removed) with live pricing + readiness. */
export async function GET() {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { bundles, source } = await getPortalBundles()
  return NextResponse.json({ bundles, source })
}

type Action =
  | { action: 'create'; bundle: PrebuiltBundle }
  | { action: 'edit'; slug: string; patch: Partial<PrebuiltBundle> }
  | { action: 'publish'; slug: string; published: boolean }
  | { action: 'reorder'; slugs: string[] }
  | { action: 'remove'; slug: string }
  | { action: 'restore'; slug: string }
  | { action: 'duplicate'; slug: string; newSlug: string; newName: string }

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Action
  try {
    body = (await req.json()) as Action
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    switch (body.action) {
      case 'create':
        if (!body.bundle?.slug) return NextResponse.json({ error: 'bundle.slug required' }, { status: 400 })
        await createBundle(body.bundle)
        break
      case 'edit':
        if (!body.slug || !body.patch) return NextResponse.json({ error: 'slug and patch required' }, { status: 400 })
        await editBundle(body.slug, body.patch)
        break
      case 'publish':
        await setBundlePublished(body.slug, !!body.published)
        break
      case 'reorder':
        if (!Array.isArray(body.slugs)) return NextResponse.json({ error: 'slugs[] required' }, { status: 400 })
        await reorderBundles(body.slugs)
        break
      case 'remove':
        await removeBundle(body.slug)
        break
      case 'restore':
        await restoreBundle(body.slug)
        break
      case 'duplicate':
        if (!body.newSlug || !body.newName) return NextResponse.json({ error: 'newSlug and newName required' }, { status: 400 })
        await duplicateBundle(body.slug, body.newSlug, body.newName)
        break
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

/** Permanently delete a founder-authored bundle. */
export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { slug?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  try {
    await deleteBundle(body.slug)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
