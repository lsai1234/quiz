import { SubscriptionDetail } from '@/components/portal/SubscriptionDetail'

export default async function Member({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  return <SubscriptionDetail userId={userId} />
}
