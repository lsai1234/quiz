# CHRGD Quiz — Phase 2 Redesign Proposal

**Status:** Phase 2 of 3. One recommended design, not a menu. Builds on `docs/quiz-audit.md`.
**Decided constraints (from you):** PowerBody API has **no dose/ingredient data**; **hybrid curation** (a hand-vetted, dose-verified "quiz core" powers bundles, the broad feed is shop-only); **bars are a results-page cross-sell**, not in-bundle; **hard safety gate** for pregnancy/breastfeeding/medication; **no fixed completion cap** — optimise for good, meaningful sales.

---

## 1. Design principles

1. **Value before price.** Never ask for a budget before the customer sees what they'd get. The bundle is built at full quality, then presented as three *depths* they choose between (§7). This kills the single worst drop-off point (audit §6.1).
2. **Every question must change the bundle or the conversion.** Anything that does neither is deleted (audit §2). Front-load the questions that most change the bundle; defer refinements to an optional deep-dive.
3. **Lived experience, not self-diagnosis.** No jargon, no "rate your own diet A–F," no clinical self-assessment. People answer about what their day *feels* like (§3).
4. **The engine is data, not branches.** A curated core catalogue with real dose/ingredient data + a named-weight decision matrix (§5) replaces the 250-line magic-number wall. This is what makes the catalogue changeable without a rewrite, and what lets us reason about dosing that PowerBody can't give us.
5. **Honest bundles.** No active-ingredient duplication, real dose caps, and an explicit "no strong match" path instead of budget-filler (§6).

### Target flow size & time (justified, not capped)

| Path | Core questions | Est. time | Why this size |
|---|---|---|---|
| Wellbeing supps | **6** | ~60–75s | Only goal, safety, you, day-pattern, already-taking, format change the bundle |
| Performance supps | **8** | ~90–110s | Adds training (frequency + focus) and caffeine — both genuinely change the stack |
| Drinks–Wellbeing | **6** | ~60–75s | Format/budget removed (implied + value-first); pace added |
| Drinks–Performance | **8** | ~90–110s | Same as performance minus format/budget, plus pace + workout add-ons |

Down from an advertised 9–12 (real 11–18) today. The budget step leaves the flow entirely; the optional deep-dive (2 questions) sits *after* the reveal for people who want sharper picks. **I'm deliberately not shortening below this** — cutting `training` or `already-taking` would measurably worsen the bundle, and worse bundles mean worse retention, which is the opposite of "good sales."

---

## 2. Target flow — exact wording

Entry (unchanged, on the hero): **Everyday wellness · Performance + wellness · CHRGD LQD (drinks)** sets `track` + `drinksMode`. The quiz then opens on the goal.

### Q1 — Goal *(all paths, first tap = primary goal)*
> **What do you most want to sort out?**
> *Tap your main one first — we'll build around it. Add more if they apply.*

- **Performance track options:** Build muscle · Get stronger · Get leaner · More energy · Recover better · Stay hydrated — plus a second row **Everyday wellness:** Sleep · Stress · Focus · Immunity · Skin, hair & nails · Gut · Menopause.
- **Wellbeing track options:** Sleep · Stress · Focus · Immunity · Skin, hair & nails · Gut · Menopause · General health.
- **Type:** multi-select, **first selection stored as `primaryGoal`** (fixes the unwired signal, audit §2). Cap the visible grid; the combined track's 15 options get grouped headers (as today) but the *primary* tap disambiguates.
- **Why:** dominant bundle signal (audit §2). Making the primary explicit lets the engine protect the one thing they care about (§5/§6).

### Q2 — Safety screen *(all paths, NEW, hard gate)*
> **Anything we should factor in?**
> *So we only ever suggest things that are right for you.*

- ☐ Pregnant or breastfeeding
- ☐ Taking prescription medication
- ☐ None of these

- **Type:** multi-select (optional to tick "none").
- **Behaviour:** sets `safetyFlags`. Products with matching `contraindications` are **removed** before scoring (§5, §6). If a *primary* goal loses its only safe product, the results page shows the honest "no strong match — here's what we'd suggest instead / speak to your GP" state.
- **Wording note:** framed as tailoring ("factor in"), not a medical interrogation, to protect conversion while still gating. This is early so it filters everything downstream.

### Q3 — About you *(all paths)*
> **A bit about you.**

- **Weight** (NEW): a slider or 5 bands — *Under 60kg · 60–75kg · 75–90kg · 90–105kg · 105kg+*. Drives protein/creatine serving size and run-out rate (§6/§7). Optional but encouraged ("makes your doses accurate").
- **Age:** Under 25 · 25–34 · 35–44 · 45+ (single tap; **drop the redundant exact-age slider** — audit §2).
- **Sex** (optional): Male · Female · Prefer not to say. Kept because it drives iron/B and bone/collagen priorities, but honestly labelled as optional.
- Name: **moved out of the quiz** to the email/results step (personalisation-only, audit §2) — one fewer field mid-flow.

### Q4 — Training *(performance paths only, merges 2–3 old steps)*
> **How's your training right now?**

- **Single question, single-select frequency:** Just starting (1–2×) · Regular (3–4×) · Serious (5–6×) · Every day.
- **Inline focus follow-up (reframed, replaces the jargon `type`/`trainingFocus`):**
  > **What are you training for?**
  > Build size · Get stronger · Stay fit & conditioned · A sport
  (→ maps to hypertrophy / powerlifting / general / sport internally; "sport" reveals football/rugby/court/other.)
- **Why:** frequency drives cadence + dose; focus is the *only* training signal that changes product selection (audit §2). The old free-for-all `type` multi-select is deleted (it never reached `scoreProduct`).

### Q5 — Your day *(all paths, reframed lifestyle — see §3)*
> **Which of these sound like you?**
> *Pick any — it helps us fine-tune.*

Track-specific chips (desk-bound · on your feet · poor sleep · high-pressure · achy joints/old injuries · often run-down · mostly indoors). Optional. Feeds the soft signals the engine already uses; **drops the inert `active` chip** (audit §2).

### Q6 — Already taking *(all paths, kept — high value)*
> **Already taking any of these?**
> *We'll leave out what you've got — or add ours to try when yours runs out.*

Unchanged mechanically (exclusions + `tryOurs`), which is one of the highest-value signals (audit §2). Wellbeing sees the vitamin set; performance sees protein/creatine/pre-workout/vitamins.

### Q7 — Caffeine *(performance + energy-goal paths; reframed, conditional)*
> **How's caffeine for you?**
> I avoid it · The odd coffee · Daily coffee · I run on it

Only shown when a stimulant product could plausibly enter the bundle (performance track, or `energy` goal). **Not shown to pure sleep/stress/wellbeing users** (audit §2 — it's inert for them, and asking is friction). High-caffeine reveals the stim-preference follow-up as today.

### Q8 — Format *(supps paths only; reframed)*
> **How do you like to take things?**
> Powders & shakes · Capsules & tablets · Don't mind

Drives the −format-mismatch weight. **Skipped in drinks mode** (implied). "Bars" is removed from here — bars are a results-page cross-sell, not a stack format (your decision).

### LQD-only: pace *(drinks paths)*
> **How many drinks on a normal day?** One · A couple · Three+
Keeps box-sizing (audit §2). **`drinkVariety` is deleted** (near-inert). **`workoutAddOns` is simplified** to a single opt-in "Add drinks around training?" that only toggles the pre-workout line (the protein/recovery options were inert — audit §2).

### Then: **Reveal → tier choice → deep-dive (optional)**
Budget is no longer a question — the reveal presents three depths (§7). The optional AI deep-dive (2 questions) stays, offered *after* the reveal.

---

## 3. Reframing — self-diagnosis → lived experience

| Today (asks a judgement) | Redesign (asks an experience) | Why |
|---|---|---|
| Diet: "On point / Room for improvement" (self-grade) | **"How do most of your meals happen?"** — Cooked from scratch · Decent but rushed · Grab whatever's easy · All over the place | Removes the value-judgement; same signal, no self-criticism |
| `trainingFocus`: "Hypertrophy / Powerlifting" (jargon) | **"What are you training for?"** — Build size · Get stronger · Stay fit · A sport | Plain language a non-lifter can answer instantly |
| Caffeine: "High tolerance / used to pre-workout" | **"I run on it"** | Same bucket, human phrasing |
| `immuneBaseline`: "Catch everything going round" *(and it changes nothing)* | Either **delete** or **make it drive dose** (see §6 — higher immune load → include the vitamin-C/D booster) | Today it's copy-only (audit §2). If kept, it must change the bundle |
| Sleep follow-up: "Hard to switch off / wake during the night" | Keep — already lived-experience and it *does* steer product (magnesium vs blend) | Good as-is |
| `dailyDrinks`: "no need to hit it exactly" | **"On a normal day, how many drinks?"** — One / A couple / Three+ | Remove the hedge that invites hesitation |

---

## 4. Deletions & merges

| Change | Item | Reasoning (audit ref) |
|---|---|---|
| **Delete** | `budget` as a quiz step | Money-before-value = top drop-off (§6.1). Replaced by value-first tiers on the reveal (§7) |
| **Delete** | `drinkVariety` | Near-inert — only trims under `reconcile && staples` (§2) |
| **Delete** | `workoutAddOns` protein/recovery options | Inert — can't add a product goals didn't already yield (§2). Kept only as a single pre-workout toggle |
| **Delete** | `exactAge` slider | Engine discards to bracket; AI-only (§2) |
| **Delete** | `lifestyle: active` chip | Never read (§2) |
| **Delete/Repair** | `immuneBaseline` | Copy-only today (§2). Delete, or wire to dose (§6) |
| **Merge** | `type` (multi) + `trainingFocus` → one "what are you training for?" | `type` never reaches scoring; only focus does, and only when a single type is picked (§2) |
| **Merge** | `frequency` + `experience` → one training question with an inline experience follow-up only at high frequency | Keeps the one place experience matters, drops a standalone screen |
| **Move** | `name` → results/email step | Personalisation-only (§2) |
| **Make conditional** | `caffeine`, `trainingTime` | Inert for non-training / no-stim users (§2). Only ask when a stim product can enter |
| **Wire up** | `primaryGoal` (first goal tap) | Declared but unset today (§2); needed for §5/§6 |
| **Add** | Bodyweight, safety screen | Dosing accuracy + UK safety/compliance (audit §7 gaps 1–2) |

Net: performance path goes from ~15 real decisions to ~8; wellbeing from ~13 to ~6.

---

## 5. Decision matrix (data, not code)

The heart of the redesign. Three data files replace the branching in `factory.ts`. All are portal-editable (the pattern already exists for `PRICING_CONFIG`).

### 5.1 Curated "quiz core" product schema
This is the **dose/ingredient layer PowerBody can't give us** — hand-maintained for the small quiz-core set only.

```yaml
# quiz-core/products.yaml  (example entries)
- id: mag-glycinate
  slot: sleep
  swapGroup: magnesium
  goals: [sleep-better, less-stress, recovery]
  format: capsule
  actives:                              # the key new data
    - { name: magnesium_elemental, mg: 100, form: glycinate }
  servingsPerContainer: 30
  evidence: strong                      # authorised claim exists (§9 compliance)
  contraindications: []
  effectOnset: short
- id: ashwagandha-ksm66
  slot: sleep
  swapGroup: adaptogen
  goals: [less-stress, menopause]
  actives: [{ name: ashwagandha_ksm66, mg: 600 }]
  evidence: moderate
  contraindications: [pregnancy, breastfeeding]     # → safety gate
- id: sleep-blend
  slot: sleep
  swapGroup: sleep-support
  actives:                              # blends declare ALL actives → ingredient dedup
    - { name: magnesium_elemental, mg: 60, form: glycinate }
    - { name: l_theanine, mg: 200 }
    - { name: ashwagandha_ksm66, mg: 300 }
  evidence: moderate
  contraindications: [pregnancy, breastfeeding]
```

### 5.2 Goal → slot / product map
```yaml
# quiz-core/goal-map.yaml
sleep-better:
  primarySlot: sleep
  coreSwapGroups: [magnesium, sleep-support]   # ranked preference
  addOnSwapGroups: [adaptogen]
  minEvidence: moderate
skin-hair-nails:
  primarySlot: recovery
  coreSwapGroups: [collagen]
  addOnSwapGroups: [vitamin-c]
  veganAlternative: null                # ← explicit: no plant match today → triggers "no strong match" (§6)
muscle:
  primarySlot: protein
  coreSwapGroups: [protein-whey, protein-plant, protein-clear]
  companionSlots: [performance]         # creatine rides along for muscle/strength
  minEvidence: strong
```

### 5.3 Scoring weights (named — replaces the magic numbers)
```yaml
# quiz-core/scoring.yaml
weights:
  primaryGoalMatch:     40
  secondaryGoalMatch:   18
  foundationalBase:     10     # omega-3, vit-D, multivit for anyone
  evidence: { strong: 15, moderate: 8, weak: 0 }
  doseAdequate:         12     # meets the clinically-meaningful threshold in actives
  doseUnderdosed:      -25     # below threshold → strongly deprioritised
  dietBoost:             8
  ageBoost:              8
  formatMatch:          10
  formatMismatch:      -15
  marginTiebreak:        3
hardGates:                     # -Infinity, in order
  - contraindicatedBySafetyScreen     # NEW — pregnancy/meds
  - dietaryConflict                   # vegan/veggie
  - stimulantConflict                 # caffeine none / stim no
  - alreadyTaking (unless in tryOurs)
  - narrowUseWithoutGoal              # fat-burner, mass, menopause, adaptogen, probiotic…
tieBreakers: [evidenceTier, doseAdequacy, marginPriority, priceFit]
```

`score(product) = Σ applicable weights`, gates first. The old `recommendationPriority×10` base (which PowerBody pins at 5 for everything) is demoted to a **tie-breaker only** — so quiz-core ranking is driven by evidence + goal fit + dose, not an un-informative priority number.

### 5.4 Price tiers (value-first)
```yaml
# quiz-core/tiers.yaml — presented on the RESULTS page, not asked up front
tiers:
  essentials:  { maxCore: 3, priceCapHint: 40,  subDiscount: 0.15 }
  balanced:    { maxCore: 5, priceCapHint: 70,  subDiscount: 0.20, badge: Recommended }
  complete:    { maxCore: 7, priceCapHint: null, subDiscount: 0.25, badge: "Best value" }
```
Build the ideal `complete` bundle once; **each tier is a prefix** of it (core-first, ranked), so the customer sees exactly what more money adds. Removes the guess-your-spend problem.

---

## 6. Bundle construction rules

Applied after scoring, in order:

1. **Core + optional add-ons.**
   - **Core** = the ranked, deduplicated products that serve the chosen goals (primary goal protected — always in core if a safe product exists).
   - **Add-ons** = boosters (`isBoosterEligible`) shown *separately* on the reveal as "add if you want to go further," never auto-billed. Creatine for a muscle goal sits in core; collagen-for-joints as an add-on, etc.

2. **One source per active ingredient (fixes the headline defect).**
   Maintain a running set of `actives` across selected products. Reject a candidate that reintroduces an active already present, unless it's an intentional companion *and* stays under the dose cap. This is what stops persona 8's **double magnesium + double ashwagandha** and persona 14's **double immune cover** (audit §4) — the current swap-group dedup can't see across groups.

3. **Total daily dose caps (summed across the whole bundle).**
   ```yaml
   doseCaps:
     caffeine_mg:            200
     magnesium_elemental_mg: 400
     vitamin_d_iu:          4000
     zinc_mg:                 25
     vitamin_c_mg:          1000
     ashwagandha_ksm66_mg:   600
   ```
   If adding a product would breach a cap, drop the lower-scoring contributor. (Requires the §5.1 `actives` data — the reason curation matters.)

4. **No budget-filler.** A product may only enter core if `score ≥ threshold` (a real relevance floor), **not** merely because budget remains. This removes the conf-0 creatine / conf-5 sleep-blend artefacts (audit §4). If a tier's `maxCore` isn't reached because nothing else clears the floor, **show a smaller bundle** — an honest 4-item stack beats a padded 7.

5. **"No strong match" path.** If a primary goal has no safe, adequately-dosed core product (e.g. vegetarian skin/hair — audit §4 P10), the reveal says so plainly and offers the nearest supporting pick or a shop link — never a silent degrade with copy promising a product that doesn't exist.

6. **Cross-sell (drinks ↔ supps ↔ bars).**
   - **Supps mode:** each drinkable slot offers a "prefer this as a drink?" swap to the LQD/powder equivalent (same swap group).
   - **Drinks mode:** offer capsule "boosters" for slots with no good RTD (audit: slots fall away today — instead surface them as an add-on).
   - **Bars:** results-page cross-sell only (your decision) — "Add a protein bar for busy days" on the cart, driven by `primaryGoal ∈ {muscle, energy, recovery}`, never in the core logic.

---

## 7. Cadence logic

Subscription cadence per product = consumption rhythm × usage × the answers that set frequency. Keeps today's model (`sizeConsumption`, `pricing.ts`) but fixes two defects.

| Cadence | Driven by | Answer inputs |
|---|---|---|
| `daily` (protein, creatine, vitamins) | 30×/mo × usage | **bodyweight** scales protein servings/day (>90kg → 1.5–2 scoops) → faster run-out → tighter cadence |
| `per-workout` (pre-workout, intra) | `workoutsPerMonth(frequency)` | training frequency |
| `as-needed` (electrolytes, sleep, immune) | trigger frequency | sweat (asked), sleep/immune (inferred from goals + day-pattern) |

**Two fixes:**
- **Never let flat monthly > one-off** (audit §4 P7: £29.99 → £50.98/mo). When a product's servings can't cover a month's use in one unit, ship a **larger size less often** or bill the true amortised rate — but cap the headline monthly so "subscribe & save" is always actually a saving. Add a guard test.
- **Pace-aware drinks sizing** (already partly there via `paceDailyFactor`) extended so the box lands near the chosen pace instead of "stretches to 45 days" oversupply (audit §4 P13).

Cadence copy on the reveal is expectation-setting, not a rigid schedule ("one tub lasts ~6 weeks — we'll send the next just before you run out").

---

## 8. Results page (built to convert)

1. **Personalised reasoning per product, tied to their actual answers.**
   > "Creatine — *because you're training 5× for size.* The most-researched strength supplement there is; a daily 5g keeps you topped up." Pull the *specific* answer (goal, frequency, bodyweight) into each line. Reuse the reason engine but ground it in the new signals.

2. **Expectation-setting on timeframe.** Use `effectOnset` to set honest timelines so nobody judges a slow-build product too early:
   - Immediate (pre-workout, electrolytes): "you'll feel this the first session."
   - Short (sleep, energy, gut): "give it 1–3 weeks."
   - Long (omega-3, vit-D, collagen): "works quietly — 6–12 weeks."
   - None (protein, creatine): "you won't *feel* it; it's doing the work regardless."

3. **Value-first tier selector** (replaces the budget question): Essentials / Balanced / Complete as prefixes of one bundle, with the subscribe-&-save rate rising by depth. The customer chooses spend *after* seeing worth.

4. **Compliant claims only** (§9). Every reason line drawn from the approved-claims register; the `isClaimSafe` gate (already in `autopopulate.ts`) enforced on the reveal too.

5. **Strongest single objection-handler — risk reversal on the subscription:**
   > **"Start with month one. Swap anything that isn't working, or cancel in a tap — no call, no email."**
   The #1 objection to a personalised subscription is "what if it's not right for me / what if I'm locked in." Answer it once, prominently, with a genuine swap-and-cancel promise (the hub already supports swaps). This beats another discount for trust-building.

---

## 9. Compliance review (UK — GB NHC register / ASA / CAP)

UK advertising can only use **authorised** health claims (GB nutrition & health claims register, mirroring EFSA), in approved wording, and **no medicinal claims** (treat/prevent/cure). Botanicals (ashwagandha, sage, red clover) are **"on hold" — no authorised claims**, so any health claim on them is a breach. Below, current copy that risks it, with compliant swaps. **This needs sign-off from someone with regulatory authority before launch — I'm flagging risk, not giving legal clearance.**

| Product / copy today | Risk | Compliant alternative |
|---|---|---|
| **Ashwagandha** "helps your body handle stress and wind down" (`mock-catalogue.ts:515`) | 🔴 Botanical on hold — **no authorised claim**. Stress/sleep claims are unauthorised | Structure-neutral: "A traditional adaptogen, 600mg KSM-66." No function claim. Or drop from quiz claims entirely |
| **Sleep blends** "deeper sleep," "switch off," "sleep deeper" (`mock-catalogue.ts:484,453`) | 🔴 No authorised sleep claim for magnesium/theanine; "sleep" borders medicinal | Use the authorised magnesium claims: "Magnesium contributes to normal muscle function and to a reduction of tiredness and fatigue." Frame theanine as non-claim |
| **Collagen** "supports skin, hair and nails" (`mock-catalogue.ts:322`) | 🔴 No authorised collagen skin/hair claim | Lean on the added **vitamin C**: "Vitamin C contributes to normal collagen formation for the normal function of skin." Attribute the claim to the authorised nutrient, not collagen |
| **Probiotic** "probiotic," "support digestion & immunity" (`mock-catalogue.ts:581`) | 🔴 "Probiotic" is itself a non-authorised health claim in the UK; digestion/immunity claims unauthorised for cultures | "Live cultures." Any immune claim must come from an added authorised nutrient (e.g. added vitamin) |
| **Greens** "fill nutritional gaps," "support gut health" (`mock-catalogue.ts:613`) | 🟠 Unauthorised general-health/gut claims | Only claim authorised nutrients present (e.g. added vitamins); otherwise descriptive only |
| **Pre-workout** "boosts energy, focus and blood flow" (`mock-catalogue.ts:188`) | 🟠 "Energy/focus" ok only via authorised nutrients (caffeine authorised for alertness/endurance with conditions); "blood flow" unauthorised | "Caffeine helps improve concentration and endurance performance" (authorised, with the 3mg/kg conditions + caffeine warnings). Drop "blood flow" |
| **Menopause blend** "hormonal balance, hot flushes" (`mock-catalogue.ts:646`) | 🔴 Botanical + symptom claim → unauthorised/medicinal | Descriptive botanical listing + authorised nutrient claims only (B6 "contributes to the regulation of hormonal activity" is authorised — use that precise wording) |
| **Multivitamin** "keep you performing at your best" (`mock-catalogue.ts:420`) | 🟠 Vague performance claim | Map to specific authorised claims (e.g. "Vitamin B12 contributes to normal energy-yielding metabolism") |
| **Creatine** "most researched strength supplement" (`mock-catalogue.ts:152`) | 🟢 Fine — factual, and creatine has an **authorised** performance claim | Can add: "Creatine increases physical performance in successive bursts of short-term, high-intensity exercise" (authorised, 3g/day conditions) |
| **Omega-3 / Vit-D / Vit-C / Zinc / Magnesium / Protein** | 🟢 Authorised claims exist | Use exact register wording (heart/brain/immune/bone/muscle as applicable) |
| Quiz "Did you know?" tidbits (`quiz-sell.ts`) and the `84` fit-score fallback | 🟠 Any health tidbit must clear the same bar; a fabricated fit score is a misleading-claim risk | Route all tidbits through the approved-claims gate; make the fit score real or remove it |

**Structural recommendation:** extend the existing `APPROVED_CLAIMS` gate (`autopopulate.ts:34-53`, already hard-gating card copy) to **also** gate (a) the results-page reason lines and (b) the quiz tidbits — so no surface can emit an unapproved claim. Curate the quiz-core around ingredients that *have* authorised claims; treat botanicals (ashwagandha, menopause blends) as descriptive-only or keep them shop-side.

---

## 10. Open questions & assumptions (for your review)

1. **Quiz-core SKU list.** The hybrid model needs the actual hand-picked, dose-verified set. I've assumed roughly the mock catalogue's shape (protein, creatine, pre-workout, electrolytes, omega-3, vit-D, multivit, magnesium, vit-C/zinc, collagen, probiotic, greens, + LQD drinks). **Which real PowerBody SKUs form the core?** I can turn that into the §5.1 data once you have it.
2. **Regulatory sign-off.** §9 is a risk flag, not clearance. Is there a person/agency who signs off claims? The safest path is curating around authorised-claim ingredients and treating botanicals as descriptive-only — confirm you're OK dropping function claims on ashwagandha/menopause botanicals.
3. **Ashwagandha & menopause botanicals.** Keep them in the quiz (descriptive-only, no claim) or move shop-side? Affects the sleep/stress and menopause bundles directly.
4. **Bodyweight sensitivity.** OK to ask weight (bands, not exact) for dosing accuracy? It's the single biggest efficacy lever, but some audiences find it sensitive — bands + "makes your doses accurate" is my proposed mitigation.
5. **Returns/guarantee for the objection-handler (§8.5).** The "swap or cancel in a tap" promise needs to match your real policy. Confirm the cancel/swap terms so the copy is truthful.
6. **Dose-cap values (§6.3)** are sensible defaults (supplemental ULs / label norms), not medically signed-off. Confirm or have them reviewed.

---

*Phase 2 ends here. On your go-ahead I'll produce Phase 3 (`docs/quiz-implementation-plan.md`): phased, individually shippable, instrumentation-first, ordered by impact ÷ effort, with tests and an A/B design.*
