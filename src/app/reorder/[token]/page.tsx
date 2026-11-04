import type { Metadata } from 'next'
import { Card, Ground } from '@/components/system'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'
import { ReorderBox, type ReorderLine } from '@/components/checkin/ReorderBox'
import { getGuide } from '@/lib/guide/store'
import { getResolvedCatalogue } from '@/lib/catalogue/resolve'
import { defaultVariantId } from '@/lib/catalogue/variants'
import { inStockOnly } from '@/lib/catalogue/filters'
import { REORDER_COPY } from '@/lib/checkin/reorder-copy'
import { GUIDE_COPY } from '@/lib/guide/copy'

/**
 * Reorder a one-off box from its guide (Option 2): as it was, or `?without=`
 * the products they've stopped. Products the shop no longer sells drop out.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reorder · CHRGD',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ without?: string }> }

export default async function ReorderPage({ params, searchParams }: Props) {
  const [{ token }, { without }] = await Promise.all([params, searchParams])
  const guide = await getGuide(token)
  const leaveOut = new Set((without ?? '').split(',').filter(Boolean))
  let lines: ReorderLine[] = []
  if (guide) {
    const { products } = await getResolvedCatalogue()
    const sellable = new Map(inStockOnly(products).map((p) => [p.id, p]))
    lines = guide.products.flatMap((g) => {
      const p = sellable.get(g.id)
      if (!p || leaveOut.has(g.id)) return []
      const variantId = defaultVariantId(p)
      const price = p.variants.find((v) => v.id === variantId)?.price ?? p.basePrice
      return [{ productId: p.id, variantId, title: g.short, price }]
    })
  }
  const leftOut = guide ? guide.products.filter((p) => leaveOut.has(p.id)).map((p) => p.short) : []
  const seed = guide ? { day: guide.routine.day, goals: [], firstName: guide.firstName, stackName: guide.stackName } : null

  return (
    <Ground className="my-hub">
      <header style={{ borderBottom: '1px solid var(--edge)' }}>
        <div className="max-w-lg mx-auto flex items-center" style={{ padding: 'var(--space-3) var(--gutter)' }}>
          <CHRGDLogo markSize={20} wordClassName="text-base" />
        </div>
      </header>
      <main className="max-w-lg mx-auto" style={{ padding: 'var(--space-6) var(--gutter) var(--space-8)' }}>
        {!guide ? (
          <Card padding="roomy">
            <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body)' }}>{GUIDE_COPY.notFound}</p>
          </Card>
        ) : lines.length === 0 ? (
          <Card padding="roomy">
            <p style={{ color: 'var(--ink-2)', fontSize: 'var(--text-body)' }}>{REORDER_COPY.empty}</p>
          </Card>
        ) : (
          <ReorderBox lines={lines} without={leftOut} seed={seed} />
        )}
      </main>
    </Ground>
  )
}
