import { notFound } from 'next/navigation'
import { getProductBundle } from '@/lib/bundles/store'
import { ProductBundleEditor } from '@/components/portal/ProductBundleEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function EditProductBundlePage({ params }: PageProps) {
  const { slug } = await params
  const bundle = await getProductBundle(slug)
  if (!bundle) notFound()
  return <ProductBundleEditor initial={bundle} isNew={false} />
}
