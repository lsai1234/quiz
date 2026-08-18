# The automated end-to-end suite

Every product, every journey, no outside service — run with one command.

```bash
npm run e2e                 # everything, both viewports
npm run e2e:reset           # wipe the suite's database first, for a clean slate
npm run e2e -- --headed     # watch it
npm run e2e -- e2e/specs/04-checkout.spec.ts    # one file
npm run e2e:report          # the HTML report from the last CI-style run
```

There is no setup step. No keys, no Stripe account, no supplier credentials, no
email provider. The suite starts its own Next server, points it at the app's own
mock modes and drives a real browser through the product.

This is the sibling of [`E2E_TEST_PLAN.md`](./E2E_TEST_PLAN.md), which is the
manual walkthrough a founder does against a **real** PowerBody sandbox and real
Stripe test keys before the first parcel ships. The two do not overlap by
accident: this suite covers everything that can be proved without money moving,
so that the manual plan's phases C and D are short enough to actually get done.

---

## What "no outside service" means here

Nothing is stubbed at the network edge. Every integration is switched off using
the app's **own** setting for running without it, so the code path under test is
the one that ships when a key is missing — not a test double that only exists in
the suite.

| Service | Switch | What runs instead |
|---|---|---|
| Stripe | `PAYMENTS_SOURCE=mock` | The order is priced server-side and recorded as paid inline; checkout returns the `#mock-checkout` placeholder and lands on the real confirmation screen |
| PowerBody (read) | `SUPPLIER_SOURCE=mock` | The built-in sample catalogue — 34 products |
| PowerBody (write) | `SUPPLIER_ORDERING=simulate` | Orders walk the fulfilment states; nothing is ever sent |
| Shop catalogue | `NEXT_PUBLIC_DATA_SOURCE=mock` | The same sample catalogue, for shop, quiz and hub alike |
| OpenAI | `OPENAI_API_KEY=''` | The deterministic fallback identity and question set |
| Email | `NOTIFY_SOURCE=manual` | Everything queues to the outbox and is listed in Founders Hub → Emails; nothing is sent |
| Google Sheets | credentials unset | Export is inert |

The suite gets its own SQLite file (`.data/e2e.db`) so a run never reads or
corrupts the development database, and its own founder account
(`founder@e2e.test`) so the hub is never running on the demo credentials a
production build refuses.

---

## Coverage

171 tests across ten spec files, run at two viewports — a 412px phone (the
storefront is mobile-first and its README says so) and a 1280px laptop (where
the three hubs actually live).

| Spec | Product | Journeys |
|---|---|---|
| `01-quiz` | The quiz | Performance track start to finish; the review step reads answers back as labels |
| `02-shop` | The shop | Shelves, categories, dietary filters, product sheet, basket, the £15 minimum enforced server-side, bad variant ids |
| `03-bundles` | Bundles | The shop rail, every seeded bundle page, contents/price/saving, an unknown slug 404ing |
| `04-checkout` | Buying | Shop basket → confirmation; quiz stack as a one-off; quiz stack → subscription → account gate; the `quiz` vs `shop` channel; partner codes refused on a plain basket; postage on the receipt matching postage on the order |
| `05-myhub` | My Hub | Sign-in and its refusals; next box, billing breakdown and the three figures adding up; delivery calendar; stack controls; re-consent notice accept/dismiss/stale-version; exit-charge guards (401, bogus settlement); the empty-hub screen |
| `06-founderhub` | Founders Hub | Gate and refusals; every section reachable; dashboard against the orders API; the review queue and its simulation notice; mock orders blocked for having no address; order detail; UK date order; settings resolving to mock; partners; the outbox |
| `07-partner` | Partners Hub | Create → invite → the one-time link names its owner without spending it → set password → signed straight in → link now spent; sign-in refusals; own-numbers-only; all three tabs |
| `08-share-legal` | Share card, legal | The share sheet; a minted short link opened in a browser that never took the quiz; an invented token; the three legal screens including the honest "no competition is running" |
| `09-formatting` | Everything | The rendered-output inspector over 31 routes, plus the basket drawer, product sheet, finished stack, hub dashboard and partner tabs |
| `10-visual` | Everything | Pixel baselines for the hero, first question, shop, a bundle page, all three gates, the styleguide and the hub shell |

Journeys are driven by what a person reads — `getByRole`, accessible names, the
copy on the button — rather than by CSS paths or test ids. That makes the specs
survive a restyle, and it means a control with no accessible name fails the
suite rather than quietly passing it.

---

## The formatting pass

`09-formatting.spec.ts` is the answer to "some of the text and icons is
formatted wrong". The unit suite already holds the **source** to the design
rules — tokens only, no emoji in the member-facing tree, contrast floors — and
all 2,841 of those tests were green while the faults below were on screen. What
it cannot see is the page after React has run.

`e2e/support/inspect.ts` reads the live DOM and reports:

| Check | Catches |
|---|---|
| `mojibake` | UTF-8 read as Latin-1 — `Â£4.95`, `weâ€™ll` |
| `raw-entity` | `&amp;` reaching the screen as characters |
| `placeholder` | `undefined`, `NaN`, `[object Object]` rendered |
| `template` | An uninterpolated `${…}` |
| `money` | `£4.9`, `£4.956`, `£ 4.95` |
| `ambiguous-date` | A slash-separated date, whose order depends on the reader's machine |
| `spacing` | Double spaces, a space before punctuation |
| `glyph` | Emoji, and `✕ ▲ ★ ✓` typed where a drawn icon belongs |
| `raw-id` | An internal enum shown instead of its label |
| `icon-size` / `icon-aspect` | A 24-grid glyph drawn tiny, or squashed |
| `icon-stroke` / `icon-fill` | A literal hex where the token should be |
| `icon-colour` | A glyph the same colour as what it sits on |
| `clipped-x` / `clipped-y` | Text cut off with no ellipsis and no clamp |
| `unnamed-control` | A control a screen reader announces as nothing |

Three distinctions took real calibration, and each was a page of false positives
first. They are worth knowing before extending it:

1. **Truncation that announces itself is a decision, not a defect.** An ellipsis
   or a `-webkit-line-clamp` is a designer choosing to cut. What is reported is
   text that simply stops.
2. **`scrollWidth` is not a measure of text.** Every button in the design system
   carries a sheen band and every raised card a bloom, both wider than the box on
   purpose. The check measures the text's own rectangles with a `Range` instead.
3. **A leaked id is the whole label; an id in prose is English.** "A stim-free
   lift" and "a plant-based protein" are sentences. `16-24` on its own is a bug.

The last test in the file injects one of every fault and asserts each is
reported, so "all green" keeps meaning something.

### Not covered here, deliberately

**Rendered contrast.** The design's surfaces are translucent over a lit ground
with three drifting blooms, so the effective background under a given word is
genuinely different from frame to frame and from scroll position to scroll
position. A rendered-contrast check would be noisy, and a noisy test gets turned
off. `src/app/__tests__/contrast.test.ts` holds the tokens instead, which is
where the guarantee actually lives — see `DESIGN.md` §"The specular invariant"
for why the token-level floor is sufficient.

---

## The visual pass

Baselines live in `e2e/snapshots/` and are **platform-specific**: font
rasterisation differs between machines, so a baseline taken on a Mac will not
match one taken in this container. The committed set is Linux/Chromium.
`npm run e2e:update-snapshots` re-takes them — look at the images before
committing.

Animations are parked at their first frame, and screens showing today's date or
an order reference are deliberately **not** screenshotted. The receipt, the order
pages and the delivery calendar move on their own, and a suite that goes red
every morning is a suite people turn off. Those screens are covered by the
formatting pass and by their journeys instead.

The highest-value baseline is `/styleguide`: a regression in `Button`, `Field`,
`Badge` or `Modal` shows up there before it shows up on the thirty screens that
use them.

---

## What this suite cannot reach

Honest limits, each with where it is covered instead.

| Out of reach | Why | Covered by |
|---|---|---|
| Anything after the card | `PAYMENTS_SOURCE=mock` never opens a Stripe page | `E2E_TEST_PLAN.md` phase C |
| Renewals, dunning, test clocks | Needs Stripe test clocks | phase C2 |
| The settlement charge on exit | In mock mode nothing is collected — the exit records `paid: false` and logs a warning, by design | phase C3b.6–8 |
| Delivery address end to end | Stripe is what collects an address; mock orders correctly have none | phase C, phase D |
| Social sign-in | Providers only appear once credentials are set, and the callback is a server-to-server exchange a browser test cannot stub | `docs/SOCIAL_LOGIN_SETUP.md` |
| The real PowerBody catalogue and real orders | Sandbox account | phases B and D |
| Real-device GPU cost of the glass | Headless Chromium cannot answer it | `DESIGN_ROLLOUT.md` phase 3 |

Two flags widen it a little:

- `HUB_DEMO_SUBSCRIPTION=off npm run e2e` — in mock-payments mode a hub sign-in
  with no plan is handed the demo one, which is what makes the hub walkable at
  all. This turns that off so the empty-hub screen is tested.
- `E2E_REUSE_SERVER=1` — keep a dev server between runs while iterating on a
  single spec. Off by default on purpose: a wedged dev server once kept serving
  pages while 404ing every API route, and twelve specs failed for reasons that
  had nothing to do with them.

---

## Two things that will bite you

**Use `localhost`, not `127.0.0.1`.** Next's dev server treats the numeric host
as a different origin from the one it bound to and refuses the client's own HMR
and RSC requests. The page renders and never hydrates, so every button is inert
and every spec fails on a screen that looks perfectly correct.

**Routes compile on demand.** Next builds an API route the first time something
asks for it, and under Turbopack a request arriving during that first compile
can come back as a plain 404. `e2e/support/warmup.ts` runs as `globalSetup` and
asks for every route the suite depends on before the first spec does.

---

## What the first runs found

Four defects, none of which the 2,841-test unit suite could see, because all
four are properties of the rendered page or of a real browser's behaviour.

**1 · The quiz review showed an age bracket's id instead of its label.**
`Alex · 16-24 · 60–75kg` where every other row read back a label. The `You` row
was the only one not passed through `labelOf`, so it printed the enum. The
options are now a module-level `AGE_DATA` table that both the step and the
review read from — the step cannot drift from the summary again.
*`src/components/scroll/Act2Quiz.tsx`*

**2 · Founders Hub dates took their format from the reader's machine.**
Three timestamps — the order header, the order timeline, the orders list — used
a bare `toLocaleString()`, which on a US-defaulted browser renders an order
placed on the 8th of November as `11/8/2026`: the same string a UK reader takes
as the 11th of August. Every other date in the codebase names `en-GB`. They now
go through a shared `formatStamp`, and the `ambiguous-date` check stops it
coming back.
*`src/components/portal/OrdersList.tsx`, `OrderDetail.tsx`*

**3 · Every shared stack link was the 2,600-character fallback.**
The share sheet mints a short `/s/<token>` link and falls back to a long URL
carrying the whole stack base64'd in its query string. The mint was guarded by a
one-shot ref *and* cancelled by an effect cleanup — a contradiction under React
Strict Mode, which runs the effect, cleans it up, and runs it again: the first
call's cleanup cancelled the only mint the guard would ever allow. The short
link came back and was thrown away. The suite copied the link the way a member
would and found a 2,600-character URL — which is what gets pasted into an
Instagram story, and what puts the stack in every link preview and referrer on
the way. The spec now asserts the link is under 120 characters.
*`src/components/share-card/ShareSheet.tsx`*

**4 · The product sheet is a modal with no modal semantics.** *(reported, not
fixed)* `ShopProductSheet` is a bare `fixed inset-0` div: no `role="dialog"`, no
`aria-modal`, no accessible name, unlike `@/components/ui/Sheet` which has all
three. A screen reader is given no indication that a layer opened over the shop,
and there is no role to select it by — `e2e/support/shop.ts` scopes it by class
and says so. This is a small change to product code that was not part of the
brief, so it is left as a decision rather than made quietly.

One more thing worth a look, also not changed: the Founders Hub order page
titles itself with the internal id (`ord_cd75a…`) and does not show the
`CHRGD-…` reference anywhere. A customer quoting their reference cannot be
matched to an order from that screen.

---

## Extending it

- `e2e/support/quiz.ts` drives the quiz. Answers are keyed on the question as
  displayed; an unmapped question falls through to "first option", which keeps
  the walk working when a step is added and makes that step's own spec the place
  to pin it down.
- `e2e/support/accounts.ts` makes customers, founders and partners. Accounts are
  unique per call — a shared fixture account would make specs depend on the
  order they ran in.
- `e2e/support/shop.ts` wraps the basket and sheet gestures, since neither has a
  URL of its own.
- `e2e/support/inspect.ts` is the formatting inspector. Add a rule and add a case
  to the self-test in the same commit.

Anything reaching for `page.waitForTimeout` as a synchronisation tool is a bug
waiting to happen — every wait in the suite is on a condition, apart from a few
hundred-millisecond settles after a tab switch.
