import { notFound } from 'next/navigation'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getProductBundle } from '@/lib/bundles/store'
import { ProductBundleEditor } from '@/components/portal/ProductBundleEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function EditProductBundlePage({ params }: PageProps) {
  // Checked here, not only in the hub's layout: Next sends this segment's
  // output in the page data even when the layout shows the sign-in screen
  // instead (see products/item/[id]/page.tsx).
  if (!(await isPortalAuthed())) return null
  const { slug } = await params
  const bundle = await getProductBundle(slug)
  if (!bundle) notFound()
  return <ProductBundleEditor initial={bundle} isNew={false} />
}
