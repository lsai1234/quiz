import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  getDataSourceSetting, getPortalPricingOverrides, getQuizExperiment, syncPortalRuntime,
} from '@/lib/portal/store'
import { getPaymentSource } from '@/lib/payments'
import { armFor, parseArm, parseBucket, ARM_COOKIE, BUCKET_COOKIE } from '@/lib/experiments/assignment'

// Public, non-sensitive config so the customer-facing client can mirror the
// portal's runtime data-source mode and pricing overrides (see PortalSync).
export const dynamic = 'force-dynamic'

export async function GET() {
  await syncPortalRuntime()
  const [jar, experiment] = await Promise.all([cookies(), getQuizExperiment()])

  /**
   * Which quiz this visitor gets.
   *
   * Resolved here rather than in the proxy because this is the first place that
   * can see BOTH the visitor's bucket cookie and the founder's setting. It rides
   * on a request the root layout already makes on every page load, so the arm is
   * known while the visitor is still on the hero — seconds before Act 2 mounts.
   * No extra round trip, no flash of the wrong quiz, and the homepage stays
   * statically rendered because nothing in the page itself reads a cookie.
   */
  const quizArm = armFor(
    parseBucket(jar.get(BUCKET_COOKIE)?.value),
    experiment,
    parseArm(jar.get(ARM_COOKIE)?.value),
  )

  return NextResponse.json({
    dataSourceMode: await getDataSourceSetting(),
    pricingOverrides: await getPortalPricingOverrides(),
    /**
     * Whether checkout will take real money. The decision itself stays
     * server-side — this is only so the UI can say "Demo checkout" rather than
     * "Checkout" honestly, without importing a payments module into the browser.
     * A boolean, not the mode or the credentials: nothing here is a secret and
     * nothing here can be used to change the outcome.
     */
    paymentsLive: getPaymentSource() === 'stripe',
    quizArm,
    /**
     * The two settings the v2 quiz itself needs at runtime. Deliberately not the
     * whole config: the mode and the split percentage are the founder's business
     * and telling the browser them would let anyone read the experiment design
     * off the network tab.
     */
    quizAiSteer: experiment.aiSteer,
    quizBudget: experiment.budget,
  })
}
