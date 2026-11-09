import type { Metadata } from 'next'
import { JoinPage } from '@/components/hub/join/JoinPage'
import { HUB_PLAN_COPY } from '@/lib/hub-plan/copy'

export const metadata: Metadata = {
  title: HUB_PLAN_COPY.pageTitle,
  description: HUB_PLAN_COPY.intro,
}

/** The member hub on its own (`lib/hub-plan`): what's inside, the price, joining. */
export default function ShopHubPage() {
  return <JoinPage />
}
