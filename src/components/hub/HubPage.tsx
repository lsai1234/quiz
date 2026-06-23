'use client'

import { useHubStore } from '@/lib/hub-store'
import { useCatalogueProducts } from '@/hooks/useCatalogueProducts'
import { HubLogin } from './HubLogin'
import { SubscriptionDashboard } from './SubscriptionDashboard'

export function HubPage() {
  const session = useHubStore((s) => s.session)
  const login = useHubStore((s) => s.login)
  const { products, isLoading } = useCatalogueProducts()

  if (!session) {
    return <HubLogin onLogin={(email) => login(email, products)} loading={isLoading} />
  }

  return <SubscriptionDashboard />
}
