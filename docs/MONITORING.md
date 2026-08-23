# Monitoring

**Founders Hub → Monitoring.** Two questions, in the order you ask them: is
anything broken right now, and what has been failing.

Everything here is first-party — our own table, our own page, no third-party
account and nothing to pay for. That was the requirement ("something I can view
in Founders Hub"), and at this volume it is also the right call: the whole thing
is one table, one page and a cron sweep.

---

## The two halves, and why both exist

### 1. System health — the failures that never throw

The dangerous failures in this app do not raise exceptions. They are absences:

| What happens | What throws | How you'd find out without this |
|---|---|---|
| Stripe's webhook stops arriving | nothing | a customer emails asking where their parcel is |
| `CRON_SECRET` unset, so the daily job 401s forever | nothing | subscriptions quietly stop advancing |
| Emails queue and never send | nothing | you notice the Emails page is long |
| Production deployed with mock payments | nothing | you take orders that never charge |

An error log would show a reassuring green nothing in every one of those cases.
So the health block asks the database a question per failure instead of waiting
for an event, and each check names what to do and links to where you'd do it.

Checks: recent criticals · stuck checkouts · failed orders · outbox · daily job ·
payment configuration. They live in `src/lib/monitoring/health.ts`.

### 2. The error log — grouped, not listed

Every error is reduced to a **fingerprint** — a hash of its *shape* (surface +
normalised message + top application stack frame), not its text. Four hundred
occurrences of one broken checkout is one row with a count of four hundred, not
four hundred rows burying the second, rarer bug on page nine.

Normalising strips the ids, amounts and timestamps that make each occurrence
textually unique while describing one fault. It is tuned to avoid both failure
modes, and both are tested in `__tests__/fingerprint.test.ts`:

- too eager → two unrelated bugs merge, and fixing one "resolves" the other
- too shy → the same bug appears once per order id and nothing collapses

Each group can be **resolved** (fixed) or **muted** (known, not worth seeing). A
resolved fault that recurs *stays resolved* while its count and "last seen" keep
climbing — otherwise "resolved" would undo itself the next day as cached clients
kept hitting the old bundle. That is why triage state lives in its own
`error_groups` table, which outlives the pruning of the events beneath it.

---

## What gets captured, and from where

Four sources, covering the paths that would otherwise each be a blind spot.

| Source | Catches | File |
|---|---|---|
| `instrumentation.ts` → `onRequestError` | **every** unhandled server error, in any route handler, Server Component or server action | `src/instrumentation.ts` |
| `reportError(...)` | errors that are *caught and handled*, so never throw out of the request | `src/lib/monitoring/report.ts` |
| `error.tsx` / `global-error.tsx` | React render crashes — invisible to `window.onerror` | `src/components/monitoring/SurfaceError.tsx` |
| `window.onerror` + `unhandledrejection` | throws outside React, and the rejected promise nobody awaited | `src/lib/monitoring/client.ts` |

The first two are **not** redundant, and the distinction is the important one:

> `onRequestError` only ever sees failures nobody caught. A Stripe webhook that
> catches its own error and answers `200` has failed **silently and
> successfully** — the framework sees an ordinary response and there is nothing
> to report. That is exactly the failure that costs you an order you already took
> money for.

So the money paths call `reportError` explicitly on their handled error paths:
the Stripe webhook (both branches), `checkout/finalize`, and the daily cron. All
three report at `critical`.

### Severity

`critical` means *money or an order is at risk right now*. It is the only
severity that raises the dashboard banner, and it stays meaningful only because
nothing else is allowed to use it — the public `/api/errors` sink caps a
browser's claim at `error` no matter what it posts.

### The dashboard banner

`HealthBanner` renders on the hub front page and **shows nothing when everything
is fine**. That is deliberate: a permanent green tick becomes furniture within a
week, and then the day it turns red it is still furniture.

---

## Privacy

Same posture as the analytics table. Events carry the per-visit `sessionId` from
`sessionStorage` and nothing else — no IP, no cookie, no name. `userId` is set
only for errors raised inside an already-authenticated request. Messages, stacks
and context are length-bounded on the way in. A visitor with Do Not Track or
Global Privacy Control still has crashes reported — a crash is diagnostics, not
surveillance, and they deserve a working site — but with the session id dropped,
so nothing can group their visit.

## Retention and cost

Occurrences are pruned to 30 days by the daily cron, which also writes the
heartbeat the cron check reads. Group rows are kept: they are tiny and they carry
the triage state that must outlive the evidence.

The public sink is rate-limited per instance, and the client reporter caps itself
at 10 reports per page-load with local de-duplication — between them a render
loop cannot turn one bad component into a five-figure row count.

## If you outgrow it

Add Sentry alongside, don't replace this. `reportError` is a single seam; point
it at both. The thing worth keeping is the health block, which no error tracker
does, because it is about this business's specific silent failures.
