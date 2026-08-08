import { OrderDetail } from '@/components/portal/OrderDetail'

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <OrderDetail id={id} />
}
