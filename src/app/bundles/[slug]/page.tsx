import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getResolvedBundle, getPublicBundle } from '@/lib/bundles/store'
import { BundleLandingPage } from '@/components/bundles/BundleLandingPage'

// Bundles are database-backed (founders can add/edit/unpublish them) and priced
// from the live catalogue, so this route resolves per-request.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const bundle = await getResolvedBundle(slug)
  if (!bundle) return { title: 'Bundle — CHRGD' }
  return {
    title: bundle.metaTitle || `${bundle.name} | CHRGD`,
    description: bundle.metaDescription,
    openGraph: {
      title: bundle.metaTitle || `${bundle.name} | CHRGD`,
      description: bundle.metaDescription,
      type: 'website',
    },
  }
}

export default async function BundlePage({ params }: PageProps) {
  const { slug } = await params
  const resolved = await getPublicBundle(slug)
  if (!resolved) notFound()
  return <BundleLandingPage bundle={resolved.bundle} />
}
