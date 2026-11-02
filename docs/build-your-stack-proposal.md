# Build your stack: more free products at more points (proposal)

Status: proposal, 2026-11-02. Nothing here is built. What is built is the
"Build your stack" ladder on the results page, which shows only the lines
checkout already applies (`src/lib/offer/ladder.ts`):

| From | One-off | Subscribed |
| --- | --- | --- |
| £40 | Delivery £2.95, not £4.95 | Delivery £2.95 (on the monthly total) |
| £40 (hub: bonus minimum) | Free gift, first order, its conditions beside it | Free gift in the first box |
| £50 | 8% off | Its own 13 / 15 / 20% instead |
| £100 | Free delivery | Free delivery (on the monthly total) |

You asked for free products at more points. That changes what an order
contains and costs, so per the plan's rules it needs your call before it's
built: the margin floor, the Stripe £0 lines, the PowerBody order and the free
gift terms all move with it.

## Options

| | What | For | Against |
| --- | --- | --- | --- |
| **A (recommended)** | A second gift rung: one more free product from the same hub pool at a higher line (say £100 one-off, or the Complete depth subscribed). Same rules as today's gift: first order only, one per customer, while stocks last, skipped if it would take the order under the margin floor. | Reuses everything the bonus already has (pool, per-person pick, £0 Stripe line, PowerBody line, terms, hub economics). The ladder gets one more line and nothing else changes shape. | A second £0 line per order; the hub's bonus economics view needs the second rung's cost. |
| B | A free accessory (shaker, pill case) at a line, not a supplement. | Cheap, no claims or exclusions to check, nothing to fit to the person. | New SKUs at PowerBody, stock to hold; a shaker for someone who only takes capsules is clutter. |
| C | "Spend £X, choose a free product" from a short list. | Feels generous; the customer picks. | A product they choose must still clear every exclusion and the margin floor, so the list varies per person and the choice needs its own screen. |

## What A needs

1. Hub: a second rung on Settings → Offer (minimum, and which depths or plans
   it applies to), with its own cost line in the bonus economics.
2. Selection: `chooseBonus` picks a second product from the pool, never one
   already in the stack or already the first gift, after every exclusion.
3. Checkout: a second £0.00 line (one-off; first payment only on a
   subscription); `/api/cart` re-checks both.
4. Fulfilment: both SKUs to PowerBody; the hub's order view marks both "Bonus".
5. Terms: the free gift terms page covers two rungs; "free" keeps its
   conditions beside it everywhere, the ladder included.
6. Tests: both rungs never break an exclusion, never double up, and the margin
   floor holds at every depth.

Tell me A, B or C (and the line for the second rung) and I'll build it.
