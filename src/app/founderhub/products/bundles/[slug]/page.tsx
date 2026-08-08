import { notFound } from 'next/navigation'
import { getResolvedBundle } from '@/lib/bundles/store'
import { BundleEditor } from '@/components/portal/BundleEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function EditBundlePage({ params }: PageProps) {
  const { slug } = await params
  const bundle = await getResolvedBundle(slug)
  if (!bundle) notFound()
  return <BundleEditor initial={bundle} isNew={false} />
}
