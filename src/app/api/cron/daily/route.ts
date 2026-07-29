import { NextResponse } from 'next/server'
import { isCronAuthorised, runDailyJob } from '@/lib/changes/daily'

export const dynamic = 'force-dynamic'
/** Detection walks every active subscription; give it room on a slow supplier. */
export const maxDuration = 300

/**
 * The daily job — the timer and the lock on the door. What a run actually does
 * lives in `lib/changes/daily.ts`.
 *
 * Vercel Cron calls this with GET (see vercel.json); POST is here so a founder
 * or a smoke test can trigger a run by hand with the same secret. `?dryRun=1`
 * computes and reports without writing anything or emailing anyone.
 */
async function handle(req: Request) {
  if (!isCronAuthorised(req.headers)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'
  const startedAt = Date.now()

  try {
    const result = await runDailyJob(dryRun)
    return NextResponse.json({ ok: true, ms: Date.now() - startedAt, ...result })
  } catch (err) {
    // Log loudly and answer 500 so the scheduler's own alerting sees it — a job
    // that quietly returns 200 having done nothing is worse than one that fails.
    console.error('[cron/daily] run failed:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
