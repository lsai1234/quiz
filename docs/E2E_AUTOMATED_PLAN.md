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

Ten spec files, run at three viewports: a 390px phone (the width of the iPhone
most people are holding), a 1280px laptop (where the three hubs live), and a
360px "narrow" pass over the formatting spec alone — the floor the README
promises when it says to open the app at 360px+.

The widths are not decorative. Both faults in the round below were invisible at
412px, which is what the suite originally used.

| Spec | Product | Journeys |
|---|---|---|
| `01-quiz` | The quiz | Performance track start to finish; the review step reads answers back as labels |
| `02-shop` | The shop | Shelves, categories, dietary filters, product sheet, basket, the £15 minimum enforced server-side, bad variant ids |
| `03-bundles` | Bundles | The shop rail, every seeded bundle page, contents/price/saving, an unknown slug 404ing |
| `04-checkout` | Buying | Shop basket → confirmation; quiz stack as a one-off; quiz stack → subscription → account gate; the `quiz` vs `shop` channel; partner codes refused on a plain basket; postage on the receipt matching postage on the order |
| `05-myhub` | My Hub | Sign-in and its refusals; next box, billing breakdown and the three figures adding up; delivery calendar; stack controls; re-consent notice accept/dismiss/stale-version; exit-charge guards (401, bogus settlement); the empty-hub screen |
| `06-founderhub` | Founders Hub | Gate and refusals; every section reachable; dashboard against the orders API; the review queue and its simulation notice; mock orders blocked for having no address; order detail; UK date order; the settings index and every topic page behind it; partners; the outbox; the supplier integration check |
| `07-partner` | Partners Hub | Create → invite → the one-time link names its owner without spending it → set password → signed straight in → link now spent; sign-in refusals; own-numbers-only; all three tabs |
| `08-share-legal` | Share card, legal | The share sheet; a minted short link opened in a browser that never took the quiz; an invented token; the three legal screens including the honest "no competition is running" |
| `11-subscription-changes` | My Hub | Swapping: alternatives quote their monthly effect, the confirmation quotes old → new, nothing persists until Confirm, backing out is safe, and the quoted figure is the billed figure. Removing and re-cadencing. Eight checks that the browser cannot set its own price |
| `09-formatting` | Everything | The rendered-output inspector over 31 routes, plus the basket drawer, product sheet, finished stack, hub dashboard and partner tabs |
| `10-visual` | Everything | Pixel baselines for the hero, first question, shop, a bundle page, all three gates, the styleguide, the settings index and a settings detail screen |

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
| `clipped-x` / `clipped-y` | Text cut off by any ancestor, with no ellipsis and no clamp |
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
4. **The clip is usually not on the element holding the text.** A badge overflows
   a card three levels up; the badge clips nothing and the card has no text of
   its own. So the check walks up to the nearest clipping ancestor rather than
   comparing an element against itself — which is what it did at first, and why
   it missed both My Hub faults.

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

## What the second round found — My Hub on a real phone

Two layout faults, reported from screenshots of a live account and reproduced
here at 390px. Both are the same underlying shape: **a design-system primitive
that could not express what the call site needed, and silently did something
else instead.**

**5 · The delivery calendar's boxes laid their contents out sideways.**
`Button` wraps its children in a span that was unconditionally `inline-flex
items-center justify-center`. Three My Hub call sites pass several stacked
children and asked for a column in `className` — which reached the button and
never reached its content. So each 160px calendar box laid four stacked rows out
*side by side*, and because the wrapper centres, the row spilled out of **both**
edges at once: dates cut off on the left, prices cut off on the right, up to 82px
each way. `Button` now has a `layout="stack"` prop that puts both the control and
its content on the same axis, and the three call sites use it.
*`src/components/system/Button.tsx`, `DeliveryCalendar.tsx`, `LineManageSheet.tsx`,
`ChangeProductFlow.tsx`*

**6 · The status pill was sliced off mid-word.**
`Badge` is `shrink-0` with `white-space: nowrap` — correct for a status mark, and
a problem when the status is a sentence. A new member's lines read
"Building long-term health · wk 0 of 6", which beside a slot name is wider than a
phone, so it ran out of the card and the card's rounded overflow cut it at the
screen edge. The badge row wraps now, and the pill drops to its own line when it
has to.
*`src/components/hub/StackItemCard.tsx`*

### Why the first round missed them

Worth recording, because both gaps are now closed and the reasons generalise.

- **The clipping check only compared an element against its own text.** It could
  see a paragraph outgrowing its own box, but not a badge overflowing the card
  three levels above it — and in both faults above, nothing in the chain clipped
  its *own* text. The check now finds, for every run of text, the nearest
  ancestor that clips, and measures against that.
- **The state never occurred.** Every hub spec signed in against the seeded demo
  plan, which is two months old, so its lines read "Tell us how it's going" —
  a short pill that fits. The long one only exists in a plan's first week.
  There is now a `brand-new subscriber` block that walks quiz → subscribe →
  account gate → hub and inspects what a member sees on day one.
- **The viewport was too wide.** 412px hid both.

Each fix was verified the honest way round: the new specs were run against the
un-fixed code first and both went red, so they are guarding something.

---

## Testing the supplier integration against the sandbox

`Founders Hub → Settings → Supplier → Test the integration` runs every read-only
call we make to PowerBody, one at a time, and reports each separately — so a
failure names the call rather than the screen. It is `E2E_TEST_PLAN.md` phase B
as a button, and it runs through `getSupplier()` exactly as the app does, so
against a live sandbox account the answers are about the account.

| Check | Answers |
|---|---|
| Which supplier is being read | Whether this run touches PowerBody at all, and the resolved mode/source/credentials |
| API credentials | Whether all three of URL, user and key are set — their SOAP `login` needs all three |
| Find some SKUs | Can the list feed be paged? On a sandbox whose products exist nowhere else, this is the only way to get a code |
| Fetch full product detail | **The one to run before importing anything.** If products come back named after their own SKU, `getProductInfo` is not enabled — and everything imported inherits it |
| Look up one product | The single-SKU path the import screen uses |
| Read stock and cost | The call the daily sync runs |
| Shipped weight | Whether the feed carries one. It normally does not, which is expected and only affects the margin model's delivery estimate |
| Delivery services | Whether the account has more than one service. Until it returns two, delivery options can only be prices we set, not speeds we buy |
| Read orders back | How status and tracking come back to us |
| Read one order | The single-order path, when there is an order to read |
| Place an order | **Never run from here.** Reported as "not run", with no control to make it happen |

It also names PowerBody's sandbox tells when it sees them — placeholder names,
flat prices, stock of exactly 10 or 100 — so none of that is chased as a bug
while the account is still in DEMO.

**Placing an order is deliberately absent.** It is the one call with a
consequence at the other end, and it belongs to Commerce → Review queue, behind
its own confirmation and the Order sending switch. A diagnostics screen that can
place a real order is a diagnostics screen somebody will place a real order from.

The runner is unit-tested against providers that fail in specific ways
(`src/lib/supplier/__tests__/diagnostics.test.ts`): a login failure, an account
with `getProductInfo` off, one shipping service, two, a provider that does not
implement the call at all. A panel that says "all good" whatever the account does
is worse than no panel, because it is trusted.

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
