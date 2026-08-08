import { SetPassword } from '@/components/partner/SetPassword'

export const dynamic = 'force-dynamic'

/**
 * Deliberately OUTSIDE the `(partner-gated)` group: someone following an invite
 * has no session yet, so a gate here would lock out exactly the people it is for.
 * The link itself is the credential, and it is single-use.
 */
export default function SetPasswordPage() {
  return <SetPassword />
}
