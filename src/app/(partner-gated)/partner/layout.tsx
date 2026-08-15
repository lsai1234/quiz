import { getSessionPartner } from '@/lib/partners/auth'
import { canSendFromHub } from '@/lib/notify'
import { PartnerLogin } from '@/components/partner/PartnerLogin'

export const dynamic = 'force-dynamic'

/**
 * The gate on the partner realm.
 *
 * Checked here rather than per page, so a new screen added under this group
 * cannot ship unguarded by being forgotten.
 *
 * `/partner/set-password` deliberately lives in a SEPARATE route group
 * (`(partner-open)`) so it does not inherit this layout — someone arriving on
 * an invite has no session yet, which is the entire point of the link. Route
 * groups do not appear in the URL, so both still sit under `/partner`.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  // Whether a reset link can actually be emailed is resolved here, on the
  // server, and handed down — the sign-in screen offers a self-serve reset only
  // when there is something to send it with.
  if (!(await getSessionPartner())) return <PartnerLogin canResetPassword={canSendFromHub()} />
  return <>{children}</>
}
