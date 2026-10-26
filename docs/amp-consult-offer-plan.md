# Amp Consult and offer plan

Read `docs/amp-consult-report.md` first. This plan builds on it, and on `docs/results-page-plan.md`, which is done.

## Goal

1. Make the consult safe to launch.
2. Change the offer on both quizzes:
   - **The hero** is the core offer: one less obvious product, the best fit for this person, chosen from products the founders have approved.
   - **The stack** is the step up: the hero plus the classics (creatine, protein, electrolytes, multivitamin and so on), in the three tiers.
   - **The bonus** is a free product with the stack, picked for this person from a pool the founders manage in the hub.
   - Both the hero list and the bonus run from the hub, and stay off until we switch them on.
3. Make the consult's payoff as good as its questions.
4. Make the consult's flow pull people through.
5. Build a signature experience: every answer visibly goes somewhere, people watch Amp think, and the read is something they want to share.
6. Make Pinpoint learn from real answers.

## Before you start

- Check that `docs/results-page-plan.md` is in the repo and that the results page reflects it. The investigation ran on commit `105294d` (15 Oct), which is older than that work. If it's missing, stop and tell me.
- The consult stays founder-only until I change the rollout in the hub.
- The hero and bonus switches stay off until I switch them on in the hub.

## How to work

- One phase at a time, in order. A phase is finished when its "Done when" checks pass. Then stop, summarise what changed, show screenshots at 390px of the screens you changed, and wait for me.
  - Consult phases: screenshots for three personas (a builder, an ager, and an everyday person who reaches a hunch).
  - Offer phases: screenshots for both quizzes.
- In Phases 7 and 8, stop after each numbered item.
- Propose first before changing payment logic, Stripe objects, the database schema, the Pinpoint maths (priors, pulls, thresholds, evidence), the circuit check, or anything not in this plan.
- Ask before deleting files.
- Keep passing everything that passes today: both persona suites (`npm run test:personas` and the quiz's), `twenty-questions.test.ts`, the red-team tests, the a11y tests (jsdom and e2e), the token tests and the performance budget.
- Stripe test mode only. During development, only send emails to the test allowlist.
- Leave the Meta pixel alone.

## Rules

**Claims and AI**

- **Health claims.** Product wording only comes from `CLAIMS_BY_KIND`, verbatim. A pattern, goal or need can only be linked to a product through the goal-to-claim map (results-page plan, Phase 2), which this plan extends to patterns and needs.
- **AI never writes about** products, ingredients, doses, health or advice. Keep `isClean`, `namesCondition`, `safeLine` and strict schemas on every AI output, including new ones.
- **Never send to OpenAI:** circuit answers, consents, symptoms, the body map, name, email, or free text that fails the medical screen.
- **New health-related copy** (habit fixes, GP lines, product reasons, pattern lines) is scripted, never AI-written. Keep it in one file per type and add it to the review pack.
- **No pressure wording**, same as the results-page plan.

**The offer**

- **Hero copy.** Never call a product "transformational", and never claim most people haven't heard of it. Label it as the less obvious pick (e.g. "Not the obvious pick" / "The one you might not have tried"), and describe it only through approved wording.
- **Heroes need approval.** A product only becomes a hero once a founder has recorded its checks in the hub (Phase 2).
- **Free means free** (CAP Code 3.23–3.25). The bonus never comes with a higher stack price, a smaller stack saving or an extra delivery charge. Wherever "free" appears, its conditions appear next to it.

## Rules for Phases 7 and 8 (the signature experience)

- **Workshop first.** Build each piece in the consult workshop (`/styleguide/consult`) with live controls and fake data. Show me there before wiring it into the flow.
- **No heavy libraries.** Use the existing spring and tokens (`motion.ts`), SVG and canvas. No 3D, physics or animation libraries. Ask before adding any dependency.
- **Performance.**
  - Lazy-load each piece. The first-scene budget (256 KB JS / 560 KB total / 4 s) doesn't move. Report the KB each piece adds.
  - Animate transform and opacity only, with no layout work per frame.
  - The bar is smooth on a mid-range Android phone and an iPhone, in Safari, Chrome and Instagram's in-app browser.
- **Fallbacks for everything:**
  - a still version under reduced motion
  - a button alternative for every drag or draw (comfort mode and keyboard)
  - a text description of every visual for screen readers, with `aria-live` for changes
- **Same state, same picture.** Every visual is computed from the consult state, so replaying the steps gives the same picture. Nothing is invented: only plot what they've told us.
- **Visual tests.** Playwright screenshots of each piece's key states at 390px, in default, reduced-motion and comfort modes, compared on every change.
- **Claims and privacy.**
  - Visuals never predict how someone will feel. "Try this week" changes the picture of their day, not an energy forecast.
  - Share cards and challenge links never carry health information: no circuit answers, medication, weight-loss tailoring, symptoms or GP lines.

## Decisions (defaults; I may change them)

**Offer**

- The hero is the core offer and comes first. The full stack plus the bonus is the step up. The hero is also the first product in every tier.
- The hero is the default selection in the sticky bar.
- With the hero switch off, the core offer uses today's top pick (the last-chance pick), labelled "Your top pick".
- The hero keeps today's last-chance pricing rules (free or reduced delivery within the margin floor), controlled by the existing hub setting, renamed "Hero offer".
- The bonus is first order only, one per customer, and on stacks only (not the hero alone). On a subscription it ships in the first box only.
- A code and the bonus don't combine: the customer gets whichever is worth more, and the receipt says which.
- The bonus is skipped when it would take the order below the margin floor.

**Consult**

- Drop the route choice at the start. Amp invites people into Pinpoint once it has a lead. Speed run stays available as a link.
- Fully charged shows the read, not product lists. Products appear once, on the results page, in the consult's tiers.
- The top pinpointed pattern names the result and the share card.
- Habit fixes and GP lines are scripted, and only go live once reviewed.
- No voice, photo uploads or tracker screenshots. Propose removing that code (Phase 10).
- Amp is rebuilt in code (Phase 7), replacing the Rive plan.
- The read becomes a story (Phase 8).
- QuizV2 is retired once its protein module is in the consult.

---

## Phase 1: Consult launch blockers

**Safety**

1. **Exclusions reach the order.** Carry the consult's excluded ingredient families onto the order and subscription so `src/lib/changes/safety.ts` honours them. For example, if someone on blood thinners has a vitamin D that sells out, it must never be swapped for a D3 + K2. Store this only with the circuit consent. Propose the field and how it's protected.
2. **Record health consent** at checkout for consult customers. Write the circuit consent's `{accepted, version, at}` into the existing `health-data` consent record, instead of `healthDataConsent: null`.
3. **Survive a reload.** The results page reads `chrgd-consult-handoff`, so the exclusions and the pharmacist note survive a hard reload.
4. **"Change my answers" works for customers.** It must not go to the founder-gated `/quizv2?review=1`.
5. **Pharmacist note.** Separate wording for prescription medicine and for weight-loss medication.

**Data**

6. **Analytics.**
   - `consult_stop.reason` records `circuit` instead of `pregnancy` or `kidney-liver`.
   - `/api/analytics` stops logging event props to the console.
   - Consult events carry the consult arm (`consultArmFor`).
   - The hub's consult and quiz funnels exclude `internal` sessions.
7. **Minimise.**
   - `fetchSceneCopy` sends only the fields the copy prompt uses.
   - Set `store: false` on every OpenAI call.
   - A daily cron deletes `consult:*` kv rows older than 30 days.
8. **Drafts for me to review (don't publish):**
   - a consult section for `docs/DPIA.md`
   - an update to the privacy notice's AI section (`src/lib/legal/content.ts`) covering scene wording, reading free text and Pinpoint (voice and uploads are being removed)
9. **Prompt fingerprint.** The fingerprint in `persona-suite.test.ts` covers every prompt and model in use, including Pinpoint, tell and notes.

**Housekeeping**

10. Fix the stale paths and status lines in §9.2 of the report:
    - the budget script
    - `QUIZ.md` and `QUIZ_V2_ADAPTIVE.md`
    - `AMP_CONSULT_PLAN_V5.md`
    - `FOUNDERS_HUB.md`
    - the count in `personas.ts`
    - the comment in `experiments/consult.ts`

    Replace the hero's "~90 seconds" with the real time for whichever door it shows.

**Review pack**

11. Export `docs/consult-review-pack.csv`: every piece of health-related content, one row each. Columns: where it's used, current wording, and blank "Approved / Change to / Notes" columns. Include:
    - circuit items, outcomes and keep-out reasons
    - weight-loss rules and lines
    - the creatine-for-older-adults rule
    - pattern names, lines and "because" lines
    - the engine's reason strings
    - glossary entries
    - stop-screen copy
    - each `CLAIMS_BY_KIND` claim, with the products that would carry it, so it can be checked against labels

    Later phases add their new copy to the same file.

**Done when**

- [ ] A test subscription from a blood-thinner consult stores its exclusions, and a simulated sell-out never swaps in a vitamin K product.
- [ ] A consult checkout writes a health-data consent record, with its version and time.
- [ ] A hard reload on the results page keeps the pharmacist note and the exclusions.
- [ ] No pregnancy or kidney-liver value appears in `analytics_events` or the logs.
- [ ] The review pack exists.

## Phase 2: Offer, part 1 (hub setup, everything off)

1. **Hero approval on each product.** Add a "Hero" setting to each product in the hub, with fields for its checks:
   - legal to sell in GB, including novel food status
   - safety and contraindications reviewed
   - wording approved (the claim it can carry, or none)
   - checked by, and date

   The setting only takes effect once every check is complete. Add a list view of hero products and their status.
2. **Hero switch.** Settings → Offer → "Hero products", off by default. Off means the core offer uses today's top pick.
3. **Free bonus.** Settings → Offer → "Free bonus", off by default.
   - **The pool:** founders add or remove specific products.
   - **Settings:** minimum stack subtotal, margin floor (£ and %), first order only, which tiers qualify, and how it combines with codes.
   - **Economics per pool product:** list price, PowerBody cost including VAT, and the margin left on three example stacks with and without it. Reuse `src/lib/last-chance/economics.ts`.
   - Propose defaults for the minimum and the floor from those numbers.
4. **Rename** the hub's "Last-chance offer" settings to "Hero offer".
5. **Review pack:** add the bonus terms (Phase 4) and a row for each product flagged as a hero.

**Done when**

- [ ] Both switches exist and are off.
- [ ] Switching them on with no approved heroes and an empty pool changes nothing on either quiz.
- [ ] A hero setting with any check missing has no effect.

## Phase 3: Offer, part 2 (selection logic, both quizzes)

Build one shared module, used by both engines (`stack-blueprint/factory.ts` for the quiz, `consult/engine.ts` for the consult) through a small adapter each.

1. **Pick the hero.**
   - Switch on: the best-fitting approved hero for this person, after every exclusion (circuit, safety flags, caffeine, vegan, age, already taking). If none fits, fall back to the top pick.
   - Switch off: the top pick, as today.
   - The hero goes first in every tier.
2. **Hero reason.** Claims-aware, like every product: it names a pattern or goal only where the claims map backs it. Otherwise it gets a reason that isn't about health, or none.
3. **Pick the bonus, per tier.** The best-fitting product from the pool that:
   - passes every exclusion
   - isn't already in that tier
   - is in stock
   - keeps the order above the margin floor

   Ties go to the lower cost to us. If nothing qualifies, there's no bonus.
4. **Same answers, same result.** The same answers always give the same hero and bonus.
5. **Server check.** `/api/cart` recomputes the hero offer and the bonus from the catalogue and settings. If the bonus no longer qualifies, the customer is told before paying.
6. **First order only.** Propose how this is enforced for guest checkout, and what happens if it's only caught after payment.

**Done when**

- [ ] Tests prove the hero and the bonus never break an exclusion, the bonus is never already in its tier, the margin floor holds, and every fallback works.
- [ ] Both persona suites include hero and bonus expectations.
- [ ] With both switches off, every existing test and persona result is unchanged.

## Phase 4: Offer, part 3 (results page, checkout and fulfilment, both quizzes)

1. **The core offer moves up.** The last-chance block at the foot of the page goes. After "Your read" (consult) or "Built from your answers" (quiz), show:
   - **Start here: the hero.**
     - "Not the obvious pick" (or "Your top pick" with the switch off)
     - the product and its reason
     - the verbatim claim, if it has one
     - what you get: servings, cost per serving, how long it lasts
     - the delivered price, and "Start with this"
   - **Or get the full stack.**
     - The hero plus the classics, with the depth picker as now.
     - "Comes with a free {bonus}" on tiers that qualify, with the bonus's reason and conditions, and the difference: "£X more for the full stack and a free {bonus}".
     - Tiers that don't qualify say what would: "Free {bonus} on stacks from £{minimum}".
2. **Sticky bar and receipt.**
   - The sticky bar follows the chosen option, with the hero selected by default.
   - The receipt shows "Free: {product} · £0.00". Add "Worth £{price}" only where that's its normal price in the shop.
   - The stack saving and delivery don't change with the bonus.
3. **Codes.** When a code is worth more than the bonus, the code applies and the receipt says: "Your code is worth more than the free {bonus}, so you've got the code." Otherwise the bonus stays and the code box says why the code wasn't applied.
4. **Checkout.** Propose how the bonus appears in Stripe: a £0 line on a one-off order, and on a subscription's first payment only.
5. **Fulfilment.** The bonus SKU goes to PowerBody with the order, its cost is recorded, and the hub's order view marks it "Bonus".
6. **Terms.** Draft the bonus terms for my review: first order, one per customer, minimum spend, while stocks last, what happens on a return, and first box only on a subscription. Link them wherever "free" appears.

**Done when**

- [ ] Three stacks checked (under, at and over the minimum): totals add up, the Stripe charge matches the page, the bonus shows as a free line, and the PowerBody test order includes it.
- [ ] Switching the bonus on and off changes no stack price, stack saving or delivery charge.
- [ ] Every "free" has its conditions next to it.
- [ ] Both quizzes show the same offer structure.

## Phase 5: Consult payoff

1. **Fully charged becomes "Your read".** Phase 8 turns this into a story; here, get the content and data right.
   - For each pinpointed or partly pinpointed pattern, show its name, its line and the evidence in the person's own words ("You said…", "Flat by 3pm", "Last coffee about 4pm").
   - Show the AI "found" line where it's available, and "Did Amp get you?".
   - Remove the three tier lists, then "See my stack".
   - On Speed and Deep runs with nothing pinpointed, keep `profileInWords` and the hexagon, as now.
2. **Results page for consult stacks.**
   - The You scene shows the read from step 1, instead of `identityFor`'s goal-based name, archetype and description. The Phase 4 offer follows it.
   - "What we checked" uses the engine's "Kept out" and "Skipped" notes.
   - Show unmet goals honestly, e.g. "Nothing we stock is right for focus, so here's what to try instead", followed by the matching habit fix.
   - Use the consult's own tiers and names, with the hero first; don't re-tier with `planTiers`. Propose how this fits the price bands and the depth picker.
3. **Pattern identity.** The top pinpointed pattern names the result and the share card ("Wired and tired"). If nothing is pinpointed, use the goal-based stack name.
4. **Claims-aware matching.** Extend the goal-to-claim map to the 16 needs and 16 patterns.
   - A product's reason (the hero's included) can name a pattern or need only if the map backs it. Otherwise give a reason that isn't about health (e.g. "You said you don't eat oily fish"), or no reason.
   - Patterns with no claimable product get habit fixes only.
   - List every product reason that changes.
5. **"Try this week".** Up to three free habit fixes per person, drawn from their top patterns and worked out from their own answers. For example:
   - lights-out time for seven hours of sleep, from their wake time
   - a caffeine cut-off, from their bedtime
   - time outdoors, for "Indoor life"
   - protein at breakfast, when they only get it at dinner

   Script them in `src/lib/consult/habits.ts`, each with its source (NHS where possible), and add them to the review pack. Give each line an approval flag, and only show approved lines. Each fix also records how it would change the day ring (e.g. move the last cup to 13:00), for Phase 8.
6. **"Worth a GP check".** Scripted lines for answer combinations a supplement shouldn't paper over, e.g. broken nights most nights, losing the thread most days, or flagging while eating less. Keep the wording calm and never diagnostic. Source the lines from NHS pages, add them to the review pack, and use the same approval flag.
7. **Protein module.** Port v2's protein module (`docs/QUIZ_V2_PROTEIN.md`: target, estimate, gap) into the Fuel section as one scene on Deep and Pinpoint. It feeds the protein-gap pattern and a grams line in "Try this week". Propose where it sits and how it changes screen counts.

**Done when**

- [ ] For all three personas, every product reason, hero included, passes the claims map.
- [ ] Unapproved habit fixes and GP lines don't show.
- [ ] Results-page tiers match what the consult built.

## Phase 6: Consult flow

1. **No route choice at the start.** Everyone starts the core scenes. The first scene gets a small "Short on time? Do the 1-minute version" link that switches to Speed run.
2. **Hunch-led invite to Pinpoint.**
   - After the core scenes, before the circuit check: if any lead has p ≥ 0.5, Amp invites them in with "I've got a hunch about your {area}. About {n} quick questions and I'll know for sure." and two buttons: **Check it** · **Build my stack now**.
   - {n} is the model's expected number of questions.
   - If no lead qualifies, carry straight on.
   - Keep "Pinpoint it" on the review for anyone who skipped.
3. **Early teaser.** After the Rest section, if a lead has p ≥ 0.5, Amp's reaction teases it with a scripted line per pattern, e.g. "I've got a theory about your afternoons. Hold that thought." Name the area, never a cause.
4. **Reactions that connect answers.**
   - Write a scripted library of combination reactions: two or three answers that together point at a pattern, e.g. under 7 hours of sleep and 3+ coffees.
   - When a combination fires, its reaction replaces the single-answer reaction.
   - Pass the combination to the copy AI so its `react` line can connect the answers too, under the same guards.
5. **Browser back.** One history entry per scene, so the phone's back gesture goes back a screen (or undoes the last Pinpoint answer) instead of leaving the page.

**Done when**

- [ ] `flow.test.ts` covers the new start, the invite, the teaser and back-gesture behaviour.
- [ ] `twenty-questions.test.ts` still passes.

## Phase 7: Signature experience, part 1 (the consult)

Stop after each numbered item.

1. **Motion foundation.**
   - A shared-element system: when a scene is answered, its answer animates into its place on the day ring (item 3) as the next scene arrives. Use FLIP with the existing spring.
   - Add real-user performance monitoring to analytics: web-vitals (INP, LCP, CLS), plus long animation frames where the browser supports them. Show it in a hub panel by device type.
2. **Amp, alive.** Rebuild Amp in SVG with a small procedural rig, replacing the Rive plan:
   - eyes that follow the finger, blinks, and squash and stretch on taps and Next
   - live reactions while inputs are being dragged: eyelids droop as bedtime gets later, a jitter as cups stack, a glow that follows the energy level, a squint as the sun moves, a flex as training days are added
   - moods from the Pinpoint model: curious when it's unsure, leaning in when a lead passes 0.5, a spark when a hunch is confirmed
   - the existing states and micro-reactions keep working
   - Android haptics as now. Investigate whether iPhone haptics can be done reliably, and don't ship them if not.
3. **The day ring.** Amp's ring becomes a 24-hour dial of their day that fills in as they answer:
   - the sleep arc, from the sleep window
   - caffeine: the last cup at their last-caffeine time when known, otherwise just a count
   - training: at their training time when known, otherwise days a week
   - daylight as a glow
   - the energy curve (item 4) around the edge, with the dip marked

   Only plot what they've told us. Also build a larger version for the read (Phase 8). Propose how it sits with the Pinpoint reticle and the battery progress meter. Text alternative, e.g. "Sleep 23:30 to 06:00, last coffee about 16:00, energy dips around 15:00".
4. **Shape your day.** Replace the energy battery with a curve from 06:00 to midnight. They draw it with a finger, then fine-tune it by dragging points.
   - Comfort mode and keyboard get preset shapes instead: Steady all day · Slow starter · 3pm dip · Second wind at night · Not sure.
   - Extract: afternoon level (this keeps the existing 1–10 energy answer), dip time and depth, a slow morning, an evening rise.
   - Propose how these feed Pinpoint as evidence, like a probe answer marked `drawn`. This touches the maths, so propose it first, with `twenty-questions.test.ts` results before and after.
5. **Watch Amp think.** Replace the pattern map and the "What I'm thinking" sheet with a live constellation of the eligible patterns:
   - each node's size and glow follow its probability
   - contenders drift towards Amp; ruled-out patterns dim and fall away
   - after each answer, pulses travel from the answer into the patterns it moved, sized by how much they moved
   - the current question lights up the patterns it's splitting (from the information-gain calculation)
   - a counter, e.g. "Narrowing it down: 9 → 4 → 2"
   - under reduced motion: a ranked list with bars
6. **Small delights.**
   - The cup counter as a physical stack: cups drop, settle, and wobble at 4+. Use a few lines of custom physics, not a library.
   - Optional synthesised UI sounds (Web Audio), off by default behind a speaker toggle. Only keep them if they add something in testing.

**Done when** (for each item)

- [ ] It works in the workshop, in all three modes, with visual tests.
- [ ] The budget holds, and the added KB is reported.

## Phase 8: Signature experience, part 2 (the read and sharing)

Stop after each numbered item.

1. **Your Read, the story.** After the charge-up, a full-screen story built from the Phase 5 content.
   - Tap or swipe to advance (no auto-advance timers), with progress segments at the top. Swipe down to skip straight to the stack.
   - The cards:
     1. **Your day:** the day ring assembling.
     2. **What I spotted:** their top pattern, with evidence lines appearing one by one in their own words, then "Did Amp get you?".
     3. **Joining the dots:** the constellation settling on the result, and what was ruled out.
     4. **Try this week:** the approved habit fixes. Tapping one changes the ring to show it (the last cup slides earlier, the sleep arc stretches).
     5. **Start here:** the hero first, then the classics clicking into battery cells, with the bonus as a gift cell when it qualifies. Verbatim claims only.
     6. **Share.**
   - With nothing pinpointed, show fewer cards: their day, their profile in words, the offer.
2. **Share any card.**
   - Render any card as a 1080×1920 image with the existing story-card renderer.
   - Share through the phone's share sheet where the browser supports sharing files; otherwise save the image. Test in Safari, Chrome and Instagram's in-app browser.
   - Propose which patterns can appear on a shared card (e.g. leave out the weight-loss ones).
   - The giveaway's share bonus works as now. No change to entries.
3. **Trace it back.**
   - On the results page, "Why this?" on a product draws an animated path from the product back through the patterns or needs to the answers that put it there. Line thickness shows how much each answer counted.
   - Only show links the claims map backs. Anything else collapses into "From your answers".
   - Keep the provenance data in the browser only, never in the kv payload.
4. **Ask Amp on the results page.**
   - Build it like `/api/consult/explain`, so it answers only from approved text. Here that's their offer (hero, stack, bonus and its terms, verbatim claims, servings, how long each lasts, prices, delivery, subscription terms) plus an FAQ file I'll approve.
   - Structured output `{found, answer, action?}`. The only actions are swap, remove and compare, and they call the results page's existing functions.
   - Run the medical screen first, with the GP/pharmacist line when it trips. Store no text, and log calls in the AI log like the other routes.
   - Suggested questions as chips, e.g. "How long will these last?", "Is there a cheaper version?", "Can I swap the capsules?"
5. **Challenge links and compare.**
   - Every shared card carries a link. The landing page shows only what the card showed, e.g. "Sam is Wired and tired. What are you?" (with a first name only if it was on the card), and starts the consult.
   - After their read, the friend gets a compare card: the two day rings side by side or overlaid, and what they share or don't ("You're both 3pm crashers", "Night owl vs early riser"). The compare card is shareable too.
   - Link previews (Open Graph images) show the card in Instagram DMs and WhatsApp.
   - Store only the card's content against the token. Tokens expire after 90 days, and the sharer can delete theirs. Propose the storage first.
   - Don't change the competition's entries.

**Done when** (for each item)

- [ ] It works in the workshop, in all three modes, with visual tests.
- [ ] Shared images and links carry no health information.

## Phase 9: Make it learn

1. **Events.** No free text, and nothing from the circuit check.
   - Consult:
     - `consult_probe` {probeId, answer}
     - `consult_verdict` {patternId, verdict}
     - `consult_invite` {shown, accepted}
     - `consult_tell` {surface, picks}
     - `consult_whats_this` {key}
     - `consult_curve` {dip hour, afternoon level, evening rise}, rounded
     - `consult_story` {card, action}
     - `consult_share` {card}
     - `consult_trace` {kind}
     - `consult_ask` {found, action}
     - `consult_challenge` {opened, started, completed}
   - Offer, both quizzes:
     - `offer_view` {heroSource: approved | top pick}
     - `offer_choice` {hero | tier}
     - `bonus_shown` {productId, tier}
     - `bonus_blocked` {reason: margin | stock | code | minimum}
     - `bonus_claimed` {productId}
2. **A "Pinpoint quality" view in the hub.**
   - Per pattern: how often it's put to people as a hunch, the That's me / Partly / Not me split, and "Did Amp get you?" when it's in the read.
   - Per probe: the answer split, how often it's asked, and the average information it gained.
   - How many runs end with nothing pinpointed.
   - How often the drawn curve settles a pattern without probes.
3. **An "Offer" view in the hub.**
   - hero alone vs stack, and purchases by option
   - bonus cost per order, and margin per order
   - per hero product: shown, chosen, bought
4. **Calibration proposal.** How to re-estimate priors and pulls from real verdicts, and how many completed runs that needs. No automatic changes.
5. **Check-in re-run.**
   - For buyers who opt in ("Save my read so Amp can check in"), store their patterns and probe answers with the order.
   - The check-in email (results-page plan, Phase 5) links to a 60-second re-run of 3–4 of their own probes. It shows what's changed on their day ring and suggests stack changes.
   - Propose storage, consent wording and retention first.

**Done when**

- [ ] Events fire once each in test runs of both quizzes.
- [ ] Both hub views show test data, with founder sessions excluded.

## Phase 10: Tidy

1. Propose removing voice and uploads (shelf scan, tracker read): components, routes, prompts, tests, consent copy and feature flags. Don't delete anything until I agree.
2. Propose removing the Rive code once the new Amp is live.
3. Propose removing QuizV2, its experiment and its hub settings, now the protein module lives in the consult.
4. Propose removing last-chance code the hero offer no longer uses.
5. Remove dead code: `PlaceholderScene` and the `placeholder` blocks, the unread `aiReasons` field, and anything earlier phases left unused.

**Done when**

- [ ] Everything in "How to work" still passes.
- [ ] Nothing was deleted without my OK.
