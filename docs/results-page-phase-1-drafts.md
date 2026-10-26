# Results page, Phase 1: drafts for 4a, 8 and 9

These are drafts for you to approve. No app code has been changed for any of them. The
only file edited is one row of `docs/rosters/chrgd-roster.csv` (item 8).

Line numbers are as of branch `results-page/phase-1` on 2026-10-21. Other Phase 1 work is
editing some of the same components, so the line numbers may move a little. Each location
also quotes its current string, so it can be found by searching.

---

## 4a Subscription cancellation wording (applied 2026-10-26)

**Status:** approved and applied. Locations 1–6 use the proposed wording below, 6a
the "one flat monthly payment" variant, and the "N-month minimum" branch now prints
the no-minimum wording in every location (receipts included). The emails listed under
"The same phrase outside the results page" were not drafted and are unchanged. The
terms/code disagreements at the end are still open for whoever signs off the terms.

### What actually happens when a subscriber cancels

| Fact | Source |
|---|---|
| There is no minimum term and no cancellation fee. Cancelling always works and is never blocked. | `src/lib/legal/content.ts:235` "There is no minimum term and no cancellation fee. You can cancel whenever you like, from your account"; `src/lib/recharge/mock.ts:224-251` `cancelSubscription` "Cancel, unconditionally"; `src/lib/stack-blueprint/pricing.ts:304-315` "this NO LONGER gates cancelling or pausing" |
| When you cancel, you pay the unpaid balance on goods already sent to you. It is not a fee. | `content.ts:236` "the balance on anything we have already sent you and you have not finished paying for. This is not a charge for leaving"; `mock.ts:474-485` "It is a debt for goods received, NOT a cancellation fee" |
| The balance is never more than the subscriber has paid in total. | `pricing.ts:230` `maxShareOfPaid: 1`; `mock.ts:503-504`; `src/lib/recharge/exit-ledger.ts:196-199`; `content.ts:238-239` "we never ask you for more than you have already paid us … That cap always applies" |
| A balance of £5 or less is waived. | `pricing.ts:204` `minimum: 5`; `mock.ts:518-520` `amount <= config.settlement.minimum`; `content.ts:239` "if the balance comes to £5 or less, there is nothing to pay at all" |
| A first-month discount is not taken back. | `pricing.ts:220` `reclaimIntroDiscount: false`; `content.ts:240` "we do not take it back when you leave" |
| The balance goes down as payments catch up and goes up again each time a multi-month item ships. A date when leaving costs nothing usually comes round every month or two, and the exit screen shows it. | `content.ts:241`; `mock.ts:522-543` `nextFreeExitMonth`; `docs/EXIT_JOURNEY_PROPOSAL.md` §4 Option B, §9 Finding 1 |
| The exact figure, itemised, is shown before confirming. After that the plan ends and nothing more is billed. | `content.ts:242`; `src/lib/recharge/exit.ts:288-362` `quoteExit`; `EXIT_JOURNEY_PROPOSAL.md` §5 and "What Phase 4 built" |
| No balance is charged when: the subscriber is inside a price-increase notice period; we changed their plan because a product became unavailable; their payments already cover what was sent; or they joined under the older terms. | `content.ts:205`, `content.ts:243`; `exit.ts:196-234` `waiverFor` |
| Returns within 14 days of the first order: unopened products can be returned for a refund instead of paying the balance. Opened supplements are not refunded unless faulty. | `content.ts:244`; `exit.ts:46-90` `CoolingOffChoice`; `exit.ts:254-286` `refundForReturned` (the refund is a share of what was paid, proportional to the value returned unopened, and never more than was paid) |
| Pausing exists. From the hub a subscriber pauses for 1, 2 or 3 months. Billing and deliveries stop, there is nothing to settle, and the plan restarts by itself on the return date. | `content.ts:228`, `content.ts:245` "You can pause for up to three months with nothing to settle"; `src/components/hub/CancelSaveFlow.tsx:281-302` (options `[1, 2, 3]`); `mock.ts:216-222` `snoozeSubscription` caps at 3; `src/lib/recharge/resume.ts:1-30` (daily job resumes it) |
| Skipping a box does not cost a payment: the value is credited against the next one. | `content.ts:227` |

So "Cancel or pause anytime" is half true. Pausing and cancelling are both always
available. What it leaves out is that cancelling early can leave a balance on goods
already sent.

### Proposed wording, by location

Each draft states only facts from the table above. None of them is a health claim, and
none uses pressure wording. Where a spot only has room for a few words, the draft uses
"no minimum term". That is true without qualification, and the fuller explanation is one
tap away.

**1. Receipt, one-off view: the "Subscribe & save" nudge**
`src/components/stack-review/PlanReceipt.tsx:534` (one 11px line inside the nudge button)

- Current: `£X/mo · pause or cancel anytime` (or `£X/mo · N-month minimum`)
- Proposed: `£X/mo · no minimum term`

**2. Receipt, subscription view: the line under "Monthly total"**
`PlanReceipt.tsx:424-428` (11px paragraph, room for one or two sentences)

- Current: `Cancel or pause anytime.` (or `N-month minimum (£X total), then cancel anytime.`)
- Proposed: `No minimum term. If you cancel early, you settle any unpaid balance on what's already been sent — never more than you've paid us, and nothing if it's £5 or less.`

**3. "What lands each month": the line under "Flat monthly"**
`src/components/stack-review/SubscriptionProtocol.tsx:140-142` (11px paragraph). This panel
shows items arriving every two or three months, which is why a balance can exist, so it
has the fullest version.

- Current: `Cancel or pause anytime.` (or `N-month minimum, then cancel or pause anytime.`)
- Proposed: `No minimum term. Longer-lasting items are paid off over the months they last, so cancelling early can leave a balance on what's already been sent — never more than you've paid us, and nothing if it's £5 or less. You can pause for up to 3 months with nothing to settle.`

**4. "Tune your monthly plan" sheet footer**
`src/components/stack-review/SubscriptionJourney.tsx:265` (one 11px line above "Looks good →")

- Current: `One predictable payment — items arrive on their own schedule. Cancel anytime.`
- Proposed: `One predictable payment — items arrive on their own schedule. No minimum term; cancelling early settles any unpaid balance on what's already been sent.`
- If that wraps too far, use the shorter version: `… on their own schedule. No minimum term.`

**5. Checkout success receipt** (`CheckoutSuccess.tsx` prints `receiptFromStackCheckout`)
`src/lib/receipt/build.ts:370-376` (one printed receipt note)

- Current: `Cancel or pause any time before your next payment.` (or `N-month minimum term (£X total), then cancel any time.`)
- Proposed: `No minimum term. Pause for up to 3 months, or cancel from your account and settle any unpaid balance on what's already been sent.`
- The same sentence also appears in two other receipt builders in that file. One is the
  order-confirmation receipt (`build.ts:174`); the other is the hub receipt
  (`build.ts:264-266`, "Cancel any time before your next payment from your account."). For
  consistency they should use the same proposed line.

**6. Consent gate (before Stripe)**

6a. `src/components/checkout/PlanBeingBought.tsx:46`. This also shows in `AccountGate.tsx:204`.

- Current: `{n} products · delivered monthly · cancel any time`
- Proposed: `{n} products · delivered monthly · no minimum term`
- Related: "delivered monthly" is also inaccurate for items that ship every two or three
  months. `CheckoutSuccess.tsx:68` already says "each item arrives on its own schedule".
  If you want that fixed too, use `{n} products · one flat monthly payment · no minimum term`.

6b. The billing points in the consent sheet: `CHECKOUT_BILLING_POINTS`, `src/lib/legal/content.ts:150-154`, rendered by `CheckoutConsent.tsx:59`.

- Point 2 (`content.ts:152`) is accurate as it stands: "No minimum term and no cancellation fee — cancel whenever you like, from your account."
- Point 3 (`content.ts:153`) still has the wording that the terms corrected on 2026-08-12. It says the balance "falls to zero as your payments catch up". The terms now say it "rises again each time a new multi-month item arrives" (`content.ts:241`; `EXIT_JOURNEY_PROPOSAL.md:640-656`; the re-consent notice `src/lib/legal/campaign.ts:118`). Point 3 also doesn't mention the cap or the £5 waiver.
  - Current: `Because longer-lasting items are spread across the months they last, cancelling early can leave a balance on what has already been sent you. You settle that, and nothing more. It falls to zero as your payments catch up, and you always see the figure before you confirm.`
  - Proposed: `Because longer-lasting items are spread across the months they last, cancelling early can leave a balance on what has already been sent you. You settle that, and nothing more — never more than you have paid us, and nothing at all if it is £5 or less. It goes down as your payments catch up and rises again when a new multi-month item is sent, and you always see the figure, and the next date it would be nothing, before you confirm.`
  - The proposal keeps the three phrases `content.test.ts:134-139` checks for: "no minimum term and no cancellation fee", "balance on what has already been sent" and "before you confirm".
  - No version bump: these points are not part of a hashed legal document. `consent.ts:54-59` hashes `documentText(doc)` of the four documents only.

**7. The terms (`content.ts:231-247`, "Cancelling, and settling what we have already sent you")**

No change is proposed. The terms already describe the settlement accurately. They are the
source the drafts above are written from.

### The "N-month minimum" branch (decision needed)

Every location above has a second branch that prints "N-month minimum (£X total), then
cancel anytime" when any product in the stack has a "Minimum term" set in the hub
(`src/lib/portal/product-edit.ts:229`, `QuizSection.tsx:375`; worked out at
`pricing.ts:2033-2035`). No product sets one today: the global default is 1
(`pricing.ts:315`), and no product data in `src/` sets more.

That branch would contradict the terms ("There is no minimum term", `content.ts:235`) and
the code, which never blocks a cancel (`mock.ts:224-251`; `pricing.ts:304-315` "it will not
stop anyone leaving, and the terms now promise it won't"). The recommendation is to use the
no-minimum wording in both branches, so the results page can never state a minimum term.
The receipt and email tests that check for "3-month minimum term" (`build.test.ts:364-366`,
`commerce.test.ts:177`) would then change with it.

### Where the terms and the code disagree (for whoever signs off the terms)

These came up while checking the facts. Nothing has been changed.

1. **The "we changed your plan" waiver lasts 60 days in code, but the terms have no time limit.** `exit.ts:176-187` (`withinDays = 60`) against `content.ts:243` ("if you are cancelling after we changed your plan ourselves"). Either the code drops the limit, or the terms add it. Adding it narrows a promise, so it would mean a `TERMS_VERSION` bump and re-consent (`versions.ts:15`).
2. **When the 14 days start.** The terms say "within 14 days of your first order" (`content.ts:244`). The code counts from the first subscription order's `createdAt` (`exit.ts:126-138`), while its own comment says the regulations start "when the goods arrive". The order date comes before delivery, so the code's window is shorter than a window counted from delivery.
3. **The £5 is typed into the terms.** `content.ts:239` hardcodes "£5" instead of reading `settlement.minimum`, even though the rest of the terms are built from live config. It is correct while the setting is 5. `settlement` isn't editable from the hub today.

### The same phrase outside the results page (not drafted)

- `src/components/hub/BillingSummary.tsx:90-91`: "No minimum term — cancel or pause anytime. As things stand you'd settle around £X…". This one is accurate, because the balance follows in the same sentence.
- `src/components/order/OrderConfirmation.tsx:347-348`: "No minimum term. Cancel any time from your account before your next payment — you'll only settle the balance on anything already sent to you." Also accurate, and a good model for the drafts above.
- `src/lib/notify/templates.ts:201-202` (subscription confirmation email) and `:476` (failed payment email, "you can cancel any time from your account").
- `src/components/styleguide/compare/plan.ts:97` (styleguide only).

---

## 8 Roster fix and hub steps

### The row

`docs/rosters/chrgd-roster.csv:42`, before the fix:

```
P53879,SciTec,Zinc Bisglycinate - 100 tabs,magnesium,swap,FALSE,0,100,TRUE,daily,30,capsule,vegan,FALSE,copper deficiency risk long-term,zinc bisglycinate 15mg,115,1,P53879
```

How the importer reads it (`src/lib/supplier/roster-csv.ts:203-281`,
`src/lib/supplier/roster-import.ts`):

- `swapGroup` is the only column that classifies the product (`roster-csv.ts:231-243`).
- `matrixCell`, `top25`, `consumption`, `occPerMonth` and `flavourVariants` are not read
  anywhere. `matrixCell` is a position label within a group (`default-…`, `premium`,
  `budget`, `swap`, `format-…`) and does not name the group.
- Stack slots and goals come from the keyword classifier, not the group. No keyword matches
  "zinc", so this product gets the default: slot `health`, goal `health`
  (`src/lib/supplier/mapping.ts:81-87`).
- How it is taken comes from the group (`mapping.ts:96-125`, `rhythmForSwap`). Under
  `magnesium`, the import gives it "as needed, for sleep, winding down". The sheet says
  `daily`.
- `actives` parses as `zinc bisglycinate`, 15 mg. The zinc dose cap is keyed `zinc`
  (`src/lib/quiz-core/bundle-rules.ts:21-27`), so it doesn't apply under any group.
- "copper deficiency risk long-term" is kept as a customer-facing warning
  (`roster-csv.ts:139-150`).

### What I changed

The `swapGroup` value only, `magnesium` → `general`:

```
P53879,SciTec,Zinc Bisglycinate - 100 tabs,general,swap,FALSE,0,100,TRUE,daily,30,capsule,vegan,FALSE,copper deficiency risk long-term,zinc bisglycinate 15mg,115,1,P53879
```

I left `matrixCell` as `swap`. No code reads it and it doesn't encode the group.

### Why `general`

There is no `zinc` swap group (`src/lib/catalogue/types.ts:52-94`). I ran the importer on
this row under each candidate group (scratch script, not committed):

| Group | Register claims shown (`CLAIMS_BY_KIND`, `src/lib/consult/claims.ts:65-79`) | Customer tag (`PRODUCT_TYPE_LABELS`, `product-type.ts:21-52`) | Scoring | How taken (import) |
|---|---|---|---|---|
| `magnesium` (before) | "Magnesium contributes to a reduction of tiredness and fatigue", "Magnesium contributes to normal muscle function". **Wrong nutrient.** | "Magnesium". **Wrong.** | All magnesium bonuses: sleep goal, wake-up and driver affinities (`factory.ts:288`, `:309`, `:319`, `goal-map.ts`, `driver-map.ts:38-73`); counted as "foundational" (`scoring.ts:151`); excluded when someone already takes magnesium (`factory.ts:266`); swappable with the other magnesium products, six in the roster (`factory.ts:173`); the consult treats it as a sleep product (`knowledge.ts:71`) | As needed, sleep, winding down |
| `zma` | zinc immune, zinc cognitive, **plus a magnesium claim** | "ZMA". **Wrong**: this product contains no magnesium or B6. | ZMA sleep and recovery affinities | As needed, sleep, winding down |
| `vitamin-c` | **Vitamin C claims. Wrong.** | "Vitamin C". **Wrong.** | Vitamin C scoring | As needed, feeling run down |
| `general` (now) | none | "Supplement" (neutral) | No group bonuses. Health slot only, from the classifier. | Daily, as the sheet says |

`general` is the only existing group that doesn't give the product another nutrient's claims,
name or scoring. The importer's own rule points the same way: "A group the engine has no
equivalent for is NOT mapped to something adjacent — being wrong about what a product is for
is worse than admitting we do not know" (`roster-csv.ts:44-47`).

### What `general` costs

- **Hub readiness warning.** The product shows "Tagged correctly: Missing: swap group" and
  "Needs a look" (`src/lib/portal/readiness.ts:59`). The import adds a matching note
  (`roster-import.ts:156-158`). Both are expected.
- **No swap alternatives** in a stack (`factory.ts:173`).
- **The AI fill puts the wrong group back.** `general` counts as blank
  (`src/lib/catalogue/review.ts:113-121`), so "Suggest tags" or "Fill the blanks with AI"
  will propose a group for it. The keyword fallback maps "zinc" to `vitamin-c`
  (`src/lib/portal/ai-classify.ts:45`, applied by `gapPatch` at `:156` and `QuizSection.tsx:198`).
  The hub steps below cover this.
- **One roster test now fails.** `src/lib/supplier/__tests__/roster-csv.test.ts:217-226`
  ("classifies every product — none fall through to \"general\"") asserts that no roster row
  is `general`. The test passed before only because the zinc was filed as magnesium. I don't
  own that test file, so I haven't changed it. Proposed replacement:

  ```ts
  it('classifies every product — only the zinc is left in "general", on purpose', () => {
    // A product left in `general` gets no swap alternatives and no targeted
    // scoring. P53879 (zinc bisglycinate) is the one deliberate exception: the
    // engine has no zinc group, and every neighbouring one (magnesium, zma,
    // vitamin-c) would give it another nutrient's claims and scoring.
    const { rows } = parseRosterCsv(csv)

    expect(rows).toHaveLength(48)
    expect(rows.filter((r) => r.swapGroup === 'general').map((r) => r.sku)).toEqual(['P53879'])
    expect(rows.filter((r) => r.unrecognisedSwapGroup !== null)).toEqual([])
  })
  ```

### Alternative: a dedicated `zinc` swap group (code change, proposal only)

A `zinc` group would give the product a correct tag ("Zinc"), clear the readiness warning,
stop the AI fill re-filing it, and let the roster test pass unchanged. It would need:

1. `src/lib/catalogue/types.ts:52-103`: add `'zinc'` to `SwapGroup` and `SWAP_GROUPS`.
2. `src/lib/supplier/roster-csv.ts:33-39`: add it to `VALID_SWAP_GROUPS`.
3. `src/lib/portal/ai-classify.ts:19` (`VALID_SWAP`) and `:45`: split `/vitamin c|zinc/` so
   that zinc alone maps to `zinc`. A product named "Vitamin C + Zinc" should still match
   vitamin C first.
4. `src/lib/supplier/mapping.ts:35-79`: a `\bzinc\b` rule after the `zma` rule. It could also
   get a "Best taken" entry in `ANCHOR_BY_SWAP` (`:98`).
5. `src/lib/catalogue/product-type.ts:21`: `zinc: 'Zinc'`. TypeScript requires this, because
   the map covers every group.
6. `src/lib/stack-blueprint/approved-claims.ts:8`: the map covers every group, so it needs an
   entry. Proposed: `zinc: []` (like `accessory`) until claims are signed off, so the AI
   copywriter has nothing to work from.
7. `src/lib/consult/claims.ts:65`: leave `zinc` out of `CLAIMS_BY_KIND` until whoever signs
   off claims has checked the label against the register. `zinc-immune` and `zinc-cognitive`
   already exist (`claims.ts:58-59`; condition "At least a source of zinc").
8. Add no scoring at first: no `GOAL_AFFINITY` or `DRIVER_AFFINITY` entries and no
   `KINDS` entry in `consult/knowledge.ts`. Scoring would then be the same as `general`, and
   linking a goal to the product would be a separate, reviewed decision.
9. Change the roster row to `zinc`, and in the hub pick `zinc` instead of `general`.

With no product in the sample catalogue using the group and no scoring added, the persona
snapshot should stay the same. That would need checking by running the snapshot test.

### Hub steps

The CSV fix doesn't change a product that is already in the hub. A re-import never touches
a product that is on sale (see below). So the live product has to be changed in the Founders
Hub:

1. Founders Hub → **Products** (`/founderhub/products`).
2. In **Search products** ("Name, brand, flavour, size, SKU or PowerBody id…"), type
   `P53879`. Open **Zinc Bisglycinate - 100 tabs** (SciTec). Its page is
   `/founderhub/products/item/<id>`. The id is probably `zinc-bisglycinate-100-tabs`
   (`roster-import.ts:109`), with a suffix if that id was already taken.
3. Go to the **Quiz & subscription** section (`QuizSection.tsx:221-225`).
4. **Swap group** (`QuizSection.tsx:260`): change `magnesium` to **`general`** (the last
   option). The field hint reads "“General” means nothing — and no alternatives." That is
   the intended result.
5. Optional, same section: **Taken**. If it reads "When needed" with "Needed when: Sleep"
   and "Best taken: Winding down", those values came from the magnesium group at import. To
   match the sheet (`daily`), set **Taken → Every day** and **Days a week → Every day**, and
   set **Best taken → Any time**. This changes how a monthly plan of the product is sized.
   It doesn't change its price.
6. Click **Save N changes**. The confirmation reads "Saved — the quiz uses it from the next
   recommendation." For a product still waiting for review, a founder edit counts as
   checked (`src/lib/portal/product-edit.ts:455-466`, `review.ts:228-237`), so no "Looks right" is needed for that field.
7. Don't use **Suggest tags** (on-sale products) or **Fill the blanks with AI** (products
   waiting for review) on this product afterwards. Either one fills a `general` swap group
   with a guess, and for zinc the guess is `vitamin-c`. If one gets used anyway, set Swap
   group back to `general` before saving. ("Suggest" changes nothing until Save. "Fill the
   blanks" writes to a pending product straight away.)
8. Optional: check **Shop listing → Category** (`ListingSection.tsx:160`). If PowerBody
   couldn't be reached at import, the category was set to the swap group's name
   (`roster-import.ts:337`: `category: supplier?.category || row.swapGroup`). It would then
   read "magnesium", and the shop shows the category as a section heading and in search
   suggestions (`ShopSection.tsx:81`, `ShopSearchSuggestions.tsx:21`). If it does, change it
   to the category your other vitamins and minerals use.
9. After saving, the product shows "Needs a look" ("Missing: swap group"). That is expected
   with `general` and doesn't block anything.

### Does a re-import of the roster overwrite it?

`src/app/api/portal/products/import-csv/route.ts:241-320` and `src/lib/portal/store.ts:646-675`:

- **Product on sale: never overwritten.** A re-import reports it as "already" and leaves it
  exactly as it is. The hub edit survives any re-import, with the old CSV or the new one.
- **Product still waiting for review: overwritten from the sheet.** The roster fields are
  refreshed: slots, goals, **swap group**, dietary tags, formats, stimulants,
  contraindications, warnings, actives, subscription, priority, short reason. Any field that
  changed is un-checked for review. With the fixed CSV that writes `general`, which is
  correct. An **old copy** of the CSV would put `magnesium` back. So only re-import from the
  fixed file.
- **Removed product:** left alone.

---

## 9 Competition terms (draft)

**Not published.** None of this has been entered in the hub or changed in code.

### Where the terms are

- The page is `src/app/legal/competition/page.tsx` (`/legal/competition`). It isn't in
  `src/lib/legal/content.ts`. Despite its name, `src/lib/legal/campaign.ts` is the
  subscription re-consent campaign and has nothing to do with the competition.
- Every term on the page comes from the campaign settings (`src/lib/competition/campaign.ts:32-80`).
  These are stored in the key-value store and edited in **Founders Hub → Settings →
  Competition** (`/founderhub/settings/competition`, `src/components/portal/CompetitionSettings.tsx`).
- I couldn't see the stored values. `/legal/competition` returns a 500 on the dev server at
  :3200 with "Cannot open database because the directory does not exist", so the drafts are
  written against the code.

| Page section (fixed heading) | Body comes from | Hub field |
|---|---|---|
| Prize (`page.tsx:73-76`) | `campaign.prize` | Prize |
| How to enter (`:78-81`) | `campaign.mechanic` | How to enter |
| Closing date (`:83-92`) | `campaign.closesAt`, shown as a date only; "To be confirmed." if empty (fixed text) | Closing date (a date picker) |
| How winners are picked (`:94-97`) | `campaign.winnerSelection` | How winners are picked |
| Free entry — no purchase necessary (`:99-103`) | `campaign.freeEntryRoute` + the form | Free entry route |
| Your email (`:105-108`) | `campaign.emailUse` (has a default, `campaign.ts:102-103`) | Your email (offers and news) |
| Promoter (`:110-114`) | `promoterName`, `promoterAddress` | Promoter name / address |
| Footer (`:116-118`) | `platformDisclaimer` (has a default) | Platform disclaimer |

Fixed text in the code: the headings above, "To be confirmed.", "This promotion has closed.
Entries are no longer being accepted." and "There isn't a giveaway on at the moment…".

### What the code does today, which the terms have to match

- **Draw.** "Draw a winner" in the hub (`CompetitionSettings.tsx:337-345`) picks one entry
  at random with `crypto.randomInt`. It only picks from entries a founder has marked
  verified, never test entries. Entries are weighted by tickets: 1, plus 10 for sharing,
  plus 3 for following (`src/lib/competition/entries.ts:91-95`, `:428-466`).
- **Redraw.** The winner is marked `won`, and the draw only picks from `verified` entries,
  so pressing "Draw a winner" again leaves the previous winner out (`entries.ts:446-466`).
  A redraw needs no code change. Nothing records when the winner was emailed or when 14 days
  is up, so a founder tracks that by hand.
- **Contacting the winner.** Nothing sends an email automatically; a founder does it by
  hand. The results page tells email entrants "We'll email you if you win."
  (`GiveawayEntryView.tsx:513`). Entries imported from Instagram/TikTok tags are stored as a
  social handle with no email address (`entries.ts:398`, channel `instagram`), and they can
  be drawn too.
- **Closing time.** The hub date picker stores the date as 00:00 UTC at the **start** of the
  chosen day (`CompetitionSettings.tsx:152`: `new Date('YYYY-MM-DD').toISOString()`). Entries
  are refused from that moment (`campaign.ts:164`; `src/app/api/competition/enter/route.ts:36-44`).
  The page prints only the date. So "Closing date: 30 November 2026" really means entries
  stopped at midnight going into 30 November, not at the end of it.

### Current → proposed

Square brackets mark choices only you can make.

**1. A defined prize**

- Current: whatever is typed in the hub **Prize** field. Its hint already warns: "“Up to
  £200” needs a defined structure before this can go live." (`CompetitionSettings.tsx:45`).
  The code comments and docs describe the promotion as "win up to £200" (`campaign.ts:7`,
  `docs/SHARE_CARD_BLUEPRINT.md:719`).
- Constraint: `prize` is also the headline on the share card, the entry screen and the
  button chip. The amount is extracted from it (`src/lib/share-card/format.ts:327-354`,
  `GiveawayEntryView.tsx:109-110`, `ShareStackButton.tsx:151`, `src/lib/competition/prize.ts`).
  A full prize definition can't go in that field without breaking the card.
- Proposed **Prize** field (hub, short headline): `Win £200 of supplements`. One fixed prize,
  not "up to".
- Proposed prize definition, shown under the Prize heading on the terms page:

  > One winner. The prize is [£200 of CHRGD products, chosen by the winner from the CHRGD
  > shop at the prices shown on the day they order / a single-use £200 CHRGD shop code],
  > delivered free to a UK address. [It must be claimed and used within [30] days of the
  > winner accepting.] There is no cash alternative, and the prize cannot be transferred or
  > exchanged. [Subscriptions are not included.]

- Where it goes:
  - **Recommended (small code change, not made):** add a hub field "Prize details"
    (`prizeDetails`). Changes: `campaign.ts` (interface, `EMPTY_CAMPAIGN`, `REQUIRED_FOR_LIVE`),
    `CompetitionSettings.tsx` `FIELDS`, and print it under `campaign.prize` at `page.tsx:75`.
    Making it required for Live means the promotion can't go live without a defined prize.
  - **No-code fallback:** start the "How winners are picked" text with the definition. It
    would then sit under the wrong heading.

**2. Winner contacted by email, 3. a draw date, 4. a redraw after 14 days**

All three go in the hub field **How winners are picked** (`winnerSelection`), which needs no
code change. Its hint already asks for "When, how, how they are told, and what happens if
they cannot be reached." (`CompetitionSettings.tsx:49`).

- Current: whatever is typed there (unknown, see above).
- Proposed:

  > The winner will be drawn at random on [draw date — for example 7 days after the closing
  > date], from all valid entries received before the closing date. Each entry is one ticket,
  > plus any bonus tickets described under "How to enter". We will email the winner at the
  > address they entered with, within [2] working days of the draw[, or send a direct message
  > from @getchrgd_ if they entered by tagging us on Instagram or TikTok]. The winner has 14
  > days from that email to reply and accept the prize. If they do not reply within 14 days,
  > the prize is forfeited and we will draw a new winner in the same way, who will also have
  > 14 days to reply[, up to [3] times].

- The draw date has to be typed in as a calendar date, because there is no draw-date
  setting. If it should always be "closing date + N days", that is a code change: a
  `drawDate` field, or the page working it out from `closesAt`.

**Closing date line (fixed text in `page.tsx:83-92`, linked to the draw date)**

- Current: `Closing date` / `30 November 2026`
- Proposed, either:
  - (a) text only, matching what the code does: `Entries close at midnight at the start of 30 November 2026 (UK time).` In British Summer Time the code's cut-off is 1am UK time, so for a summer promotion this needs (b).
  - (b) a code change to store the end of the chosen day, UK time (`CompetitionSettings.tsx:152`), and print `Entries close at 11:59pm on 30 November 2026 (UK time).`

### Does this need a version bump?

No version applies.

- The competition page isn't a versioned legal document. `LegalDocumentId` is only `terms`,
  `disclaimer`, `privacy` and `health-data` (`content.ts:96`), and `versions.ts` has no
  competition entry.
- Entries don't record which terms they were made under. `competition_entries` has no
  terms-version column (`docs/results-page-report.md` §6).
- Editing the hub fields changes the live page straight away, for everyone, including
  people who have already entered. While the competition Status is **Off**, the page
  shows none of the terms (`page.tsx:59-71`). So these fields can be filled in safely
  while the competition is off.
- The subscription `TERMS_VERSION` is unaffected.
- If you want a record of when the terms changed, a "Last updated" date on the page would
  be a small code change. Whether terms can change while a promotion is running is a
  question for whoever signs off the wording.

### Not drafted, but missing from the page (for whoever signs off)

- **Eligibility.** There is no section on who may enter: minimum age, UK residents only,
  people connected to the promoter.
- **The winner's name.** Whether and how it is made available after the draw.
- **The closing time** (above).
