import { NextResponse } from 'next/server'
import { isCronAuthorised, runDailyJob } from '@/lib/changes/daily'
import { recordCronHeartbeat } from '@/lib/monitoring/health'
import { pruneOldEvents } from '@/lib/monitoring/repo'
import { reportError } from '@/lib/monitoring/report'

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

    // The heartbeat is what `health.ts` reads to answer "is the cron still
    // firing?". Vercel says nothing when a schedule stops, and the usual cause
    // — an unset CRON_SECRET closing this route in production — fails silently
    // and forever, so the absence of this write is itself the alarm.
    // A dry run deliberately does not write one: it is a founder poking the job
    // by hand, and letting it satisfy the check would mask a dead schedule.
    if (!dryRun) {
      const pruned = await pruneOldEvents()
      await recordCronHeartbeat({ at: new Date().toISOString(), ok: true, ms: Date.now() - startedAt })
      return NextResponse.json({ ok: true, ms: Date.now() - startedAt, prunedErrorEvents: pruned, ...result })
    }

    return NextResponse.json({ ok: true, ms: Date.now() - startedAt, ...result })
  } catch (err) {
    // Log loudly and answer 500 so the scheduler's own alerting sees it — a job
    // that quietly returns 200 having done nothing is worse than one that fails.
    console.error('[cron/daily] run failed:', err)
    // Recorded both ways: the heartbeat so the health check can say "it ran and
    // it failed" rather than the much vaguer "it has not run", and the error log
    // so the stack is there to read.
    if (!dryRun) await recordCronHeartbeat({ at: new Date().toISOString(), ok: false })
    await reportError(err, {
      surface: 'cron',
      severity: 'critical',
      path: '/api/cron/daily',
      context: { dryRun },
    })
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
