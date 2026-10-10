/**
 * Run work once the response has gone, or right now when there is no response.
 *
 * `after()` is how a route hands back its answer and keeps working — the Stripe
 * webhook must answer Stripe in seconds, and sending an order to PowerBody can
 * take longer than that. But `after()` throws outside a request (a cron's own
 * loop, a test, a script), and work that silently never runs is worse than work
 * that runs late, so there the task is simply awaited.
 *
 * `next/server` is imported lazily for the same reason: it cannot even load
 * outside a server runtime, and this is reached from domain code that tests run
 * directly.
 *
 * Never throws: whatever the task is, it is a follow-on to something that has
 * already succeeded.
 */
export async function runAfterResponse(label: string, task: () => Promise<unknown>): Promise<void> {
  const guarded = async () => {
    try {
      await task()
    } catch (err) {
      console.error(`[${label}] failed after the response:`, err)
    }
  }
  try {
    const { after } = await import('next/server')
    after(guarded)
  } catch {
    await guarded()
  }
}
