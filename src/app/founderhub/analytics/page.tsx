import { AnalyticsPage } from '@/components/portal/analytics/AnalyticsPage'

/**
 * Analytics — who comes, where they fall off, and how long the quiz takes them.
 *
 * Its own section rather than a block on the dashboard: the dashboard is what
 * needs a founder today, and this is where a founder goes to work out why a
 * number moved. The dashboard's funnel links here.
 */
export default function Analytics() {
  return <AnalyticsPage />
}
