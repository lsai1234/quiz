import { ResetPassword } from '@/components/auth/ResetPassword'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Set a new password',
  // The link is single-use and the page is nobody's destination but its own.
  robots: { index: false, follow: false },
}

/**
 * Where a reset link lands.
 *
 * Deliberately its own route rather than a state of `/myhub`: someone arriving
 * here has no session — that is the whole point — and the hub's front door is a
 * sign-in screen they already know they cannot get past.
 */
export default function ResetPasswordPage() {
  return <ResetPassword />
}
