import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getBundleBySlug, SEED_BUNDLES } from '@/lib/bundles'
import { BundleLandingPage } from '@/components/bundles/BundleLandingPage'

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return SEED_BUNDLES.map((b) => ({ slug: b.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const bundle = getBundleBySlug(slug)
  if (!bundle) return { title: 'Bundle — CHRGD' }
  return {
    title: bundle.metaTitle,
    description: bundle.metaDescription,
    openGraph: {
      title: bundle.metaTitle,
      description: bundle.metaDescription,
      type: 'website',
    },
  }
}

export default async function BundlePage({ params }: PageProps) {
  const { slug } = await params
  const bundle = getBundleBySlug(slug)
  if (!bundle) notFound()
  return <BundleLandingPage bundle={bundle} />
}
