# Amp Consult v4: weight loss, and an Amp that listens

An implementation plan for two pieces of work on the Amp Consult (`/quizv2`):

- **Part A. Weight loss and weight-loss medication.** The feedback round: a
  weight-loss goal, a jab question that only appears if someone volunteers
  it, a symptom picker that drives the stack, the mapping rules, and review
  moved to the end.
- **Part B. Making Amp listen.** The wider point: the consult asks, but it
  doesn't yet seem to *work anything out*. This part turns Amp from a form
  with a mascot into something that notices patterns, checks its hunches with
  short scenarios, and explains what it concluded.

It keeps the build plan v3 rules: scenes not chat, touch first, collect then
decide, calm when it counts, and rules decide while AI only writes the words.

---

## 1. Decisions to confirm before building

These change what gets built. Each has a recommendation.

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | Where the jab question lives. You asked for a switch on the Weight loss card; the feedback put it on the safety screen because it's health data and needs consent. | **Both, in one flow.** The switch sits on the Weight loss card, as you want. It is treated as health data from the moment it's tapped: held in memory only, never saved to the phone, never sent to AI. The safety screen then shows the medication toggle already on, with its two consents. If they don't consent there, it's discarded. |
| D2 | Seven goal cards or eight. | **Seven.** Weight loss is the seventh card, full width at the bottom of the grid, so it has room to expand with the switch when tapped. No existing goal is removed. |
| D3 | Review before or after the safety check. | **After.** Safety check at step 8, Review at step 9, so Review can show the safety answers and is the last thing before Amp decides. Speed run stays at 9 screens. |
| D4 | What a declined "tailor" consent means. | **Keep-out rules still apply, tailoring doesn't.** Excluding fat burners and high-stimulant pre-workouts is a safety rule, covered by the existing consent. Adding protein, fibre and the rest needs the new tailoring opt-in. |
| D5 | Fat burners for weight loss without a jab. | **Not recommended by default.** They carry the same stimulant load and little evidence. Weight loss without a jab leans on protein and fibre. You can switch this on later if you want to sell them. |
| D6 | Rules for "low appetite" and "tiredness". The feedback gave none. | **Proposed below (A4), for pharmacist sign-off:** low appetite favours small-serve protein (clear whey, bars) and never a mass gainer; tiredness adds vitamin B12/B6 or magnesium, both with register claims about tiredness. |
| D7 | Brand names in copy ("such as Wegovy or Mounjaro"). | **Use them in the helper line only.** Most people know the brand, not "GLP-1". Check with whoever signs off claims. |

---

## Part A. Weight loss and weight-loss medication

### A1. The Weight loss goal card (screen 1)

**What people see**

- A seventh card, **Weight loss**, spanning both columns under the six
  existing cards, with sub-line "Losing fat, with or without a jab". It
  counts towards the three-goal limit and gets a priority number like the
  others.
- Tapping it selects it and the card grows (the shared spring, no second
  bounce) to reveal one row:

  > **Using weight-loss injections or tablets?**  `( ○ )`
  > Such as Wegovy or Mounjaro. You'll confirm this privately in the safety check.

- The switch is an iOS-style on/off control (`role="switch"`, 64px target in
  comfort mode, labelled for screen readers). Deselecting the card clears it.
- Comfort mode: the switch becomes two large buttons, **Yes** and **No**.
- "What's this?" on the card: what the goal covers, and that the medication
  question is optional.

**How it's built**

- `ConsultGoal` gains `'weight'`; `GOAL_LABEL`, the glossary, and the goal's
  AI sub-line key (`aiLabels`) gain it too.
- The grid stays `grid-cols-2`; the seventh tile gets `col-span-2` and an
  expandable body. The switch is a new shared control in `controls.tsx`
  (`Switch` already exists in the circuit check; promote it) so the safety
  screen and the card use the same one.
- The switch writes to a new **transient** field, `weightMeds`, stored with
  the circuit-check answers, not in the saved answers: `persist.ts` strips it
  exactly as it strips `circuit` and `healthConsent` today, and
  `summariseForCopy` never includes it.
- Amp's reaction line after goals never mentions medication (only the goal).

### A2. The flow: safety check before review

- `scenes.json`: `circuit` moves before `review`. Both stay in the **Check**
  section, so the charge meter doesn't change shape.
- **Review** gains a **Safety** card: "None of these apply", or "Weight-loss
  medication · feeling: nausea, constipation", and so on. Tapping it jumps back
  to the safety check and returns to review (the existing edit round trip).
- **Looks right** on review starts the analysis. Stop screens (pregnancy,
  kidney or liver, under 18) still happen at the safety check, before review.
- Speed run: goals, about you, training, energy, sleep, caffeine, shelf,
  safety check, review. Nine screens.
- `SCRIPT_VERSION` goes to 4. A consult saved mid-way on version 3 resumes on
  the same scene with its answers; the order change only affects what comes
  next.

### A3. The safety check additions (screen 8)

A new toggle in the list, in the same calm style, no AI, no jokes:

> **Weight-loss medication (injections or tablets)**

- If they switched it on at the goal card, it arrives already on, with the
  line "You mentioned this on the first screen."
- Switching it on expands two things inline, in this order:

1. **A second consent tick**, unticked by default:
   > Use this to tailor my recommendations.

   The existing consent covers keeping products out. This one covers adding
   products because of the medication. It's versioned separately
   (`tailorConsent: { accepted, version, at }`).
2. **A symptom picker**, shown once the tailoring tick is on:
   > Anything you've noticed since starting it?
   > `Low appetite` `Nausea` `Constipation` `Tiredness` `None of these`

   Chips, multi-select, with "None of these" clearing the rest, like the shelf
   check.

- Without the tailoring tick, the symptoms stay hidden and the medication
  only keeps things out (D4).
- Pregnancy still stops the consult whatever else is switched on.

### A4. The rules (stack engine)

The rules run once, at the end, like every other rule. They live in
`circuit.ts` (keep-out) and `engine.ts` (needs), with the ingredient and kind
tags in `knowledge.ts`.

**Keep out (any jab user, with the existing consent)**

| Kind | Why (shown on the handoff screen) |
|------|-----------------------------------|
| Fat burners | "your food intake is already lower, and these add side effects for no real benefit" |
| High-stimulant pre-workouts | same |

Implemented as a new circuit flag `weight-meds` in `FILTERS`, excluding a new
ingredient tag `fat-burner` (on the fat-burner kind) and `stimulant`.

**Tailor (jab users who ticked "tailor my recommendations")**

| When | Then | Build note |
|------|------|------------|
| On a jab | Protein and a multivitamin, both in **Essentials** | New "pinned" needs: guaranteed a place in Essentials, ahead of scored picks |
| Constipation | Adds fibre | `fibre` kind already meets `gut`; boost it. Needs fibre products in the catalogue (A5) |
| Nausea | Clear whey instead of normal whey, and adds electrolytes | Within the protein family, rank `protein-clear` above `protein-whey` and drop `protein-mass` |
| Training 3+ times a week | Adds creatine | Counts from the training week, as the engine already does |
| Low appetite (proposed, D6) | Small-serve protein: clear whey or bars; never a mass gainer | Same family ranking as nausea |
| Tiredness (proposed, D6) | Vitamin B12/B6 or magnesium | Both carry register claims about tiredness |

Tier order for a jab user, so Essentials always makes sense:
**protein → multivitamin → the symptom pick** (fibre for constipation,
electrolytes for nausea), then creatine and the rest in Standard and Complete.

**Pharmacist note.** Jab users get the note that travels with the stack:
"Tell whoever prescribes your weight-loss medication about any supplements."
Tablet users (oral semaglutide) also get: "Take your tablet as your
prescriber says, apart from supplements." Both need pharmacist sign-off.

**Weight loss without a jab** (goal only): protein ×3, fibre ×2, basics ×1 in
`GOAL_NEEDS`. No fat burners (D5).

### A5. Catalogue

- **There are no fibre products in the catalogue today.** You mentioned
  adding some from suppliers. Each needs `swapGroup: 'fibre'` so the engine
  scores it, and a claims check (fibre claims depend on the exact fibre, such
  as oat beta-glucan).
- One clear whey and one electrolyte product today. Two or three of each give
  the engine a real choice and a fallback when one is out of stock.
- A readiness check in the hub (Products → readiness) should flag any kind the
  rules depend on with nothing in stock.

### A6. Privacy and consent

- Medication and symptoms are special category health data. They are held
  in memory only, never saved to the phone, never in any AI prompt, and never
  in analytics events.
- The saved handoff payload (kept 30 days) carries what the rules did: the
  tiers, what was kept out, the reasons and a `tailored` flag. The reasons for
  jab-driven picks are worded without naming the medication ("To keep protein
  up while you're eating less").
- The hub's consult viewer shows those payloads. Limit it to founders who need
  it, and add this to the DPIA along with the new consent wording.

### A7. Tests

- **Persona suite:**
  - jab with nausea (clear whey, electrolytes, no whey or fat burner);
  - jab with constipation (fibre);
  - jab training four times a week (creatine);
  - jab without the tailoring tick (keep-out only);
  - jab and pregnant (stop);
  - weight loss without a jab (protein, fibre, no fat burner).
- **Unit:**
  - the card expands and clears its switch;
  - the switch value never reaches `localStorage` or an AI request;
  - the symptoms stay hidden until the tailoring tick is on;
  - review shows the safety card and the edit round trip works.
- **Browser:** a keyboard-only run through the new card and safety toggles;
  axe on both, at both sizes.

---

## Part B. Making Amp listen

### Why it doesn't feel like listening yet

Each screen asks one thing, and Amp's reaction repeats the last answer back.
Nothing connects one answer to another until the charge profile at the very
end, and even then it's a chart. The AI rewrites questions but never *draws a
conclusion*. People feel heard when someone:

1. **notices** something they didn't say outright;
2. **checks** it with a sharp, specific question;
3. **says what they concluded**, and lets them correct it.

That loop is the design. The rules do the noticing, a new kind of scene does
the checking, and the AI puts it into words.

### B1. Hunches: what Amp can notice (rules)

A new module, `lib/consult/hunches.ts`. A hunch is a named pattern across
answers. Each has:

- a plain statement ("Your training is outpacing your sleep");
- **evidence**, the answers that raise or lower it, giving a confidence from 0
  to 1;
- a **check**, the scenario that would confirm or rule it out (B2);
- the **needs** it moves if confirmed, as extra weight in the existing
  scoring;
- a **safety class**: lifestyle only. No hunch may name or imply a medical
  condition. The list is fixed, reviewed, and tested like the exclusions.

A starting set:

| Hunch | Evidence (from answers) | Check | Moves |
|-------|------------------------|-------|-------|
| Recovery gap | 4+ sessions, under 7h sleep, or "hard" sessions | Morning after leg day | recovery, magnesium, protein |
| Caffeine rebound | 3+ caffeinated drinks and afternoon energy ≤4 | The 3pm moment | keeps caffeine out, lifts energy basics |
| Indoor life | Daylight "hardly", or shift work from Tell Amp more | A normal weekday lunchtime | vitamin D |
| Plant-based gap | Plant-based plate and trains 3+ | What's in your post-workout meal | plant protein, B12 |
| Under-fuelled training | Trains hard, small plate, low energy | What you eat before a session | protein, carbohydrate-electrolyte |
| Weekend warrior | Training clustered on 1–2 days, sport | The day after a match | recovery, joints |
| Wired and tired | Poor sleep, high caffeine, focus goal | Lying in bed at 11pm | sleep support, caffeine out |
| Eating less | Weight loss goal, or low appetite | A normal lunch now | protein priority, small serves |
| Joint load | Sore spots and 4+ sessions or ageing | Stairs after training | joint support, omega-3 |

A hunch's confidence is recalculated after every answer (cheap, pure, tested).
Hunches that reach **0.7** count as noticed. Between **0.35 and 0.7** they're
candidates for a check. **Contradictions** are hunches too: energy 8/10 with
five coffees is flagged as "might be the coffee talking" and checked.

### B2. Scenario checks: how Amp tests a hunch (new scene type)

A new interaction, `scenario`, registered like every scene (C1). One vivid,
everyday moment, three or four answers, one tap:

> **It's 3pm on a Tuesday. What's happening?**
> `Reaching for another coffee` · `Hunting for something sweet` ·
> `Fine, cracking on` · `Could nap at my desk`

> **The morning after leg day, you're…**
> `Fresh` · `A bit stiff` · `Walking down stairs sideways`

- **Chosen by value, not by script.** At fixed points (after the Move, Rest
  and Fuel sections) the flow asks the hunch engine for the candidate whose
  answer would change the stack most. It works this out by running the engine
  both ways, which is cheap. If nothing would change the stack, no scenario
  is shown.
- **Capped:** up to 3 on Deep charge, 1 on Speed run, never in the safety
  check, never two in a row.
- **Looks different on purpose.** A small illustrated vignette (inline SVG:
  a clock at 3pm, a staircase), the question in the display face, answers as
  tiles. Amp is in the *thinking* state while it's on screen.
- **Then Amp says what it concluded,** in the reaction line of the next
  screen: "Thought so. That's the coffee wearing off, not you."
- **Stored like any answer** (`answers.checks: { [hunchId]: answerKey }`), so
  back, review, resume and the saved payload all work unchanged. The flow
  engine gains dynamic insertion: `visibleScenes` includes the checks already
  chosen for this consult.

### B3. Amp's notes: making the noticing visible (UI)

The "listening" moment has to be *seen*.

- **A notes chip** under the charge meter: `Amp's noticed 2 things`. It
  appears once the first hunch is noticed.
- **The moment it forms:** two evidence chips ("4 sessions", "6h sleep")
  slide in and a bolt joins them into one card, "Recovery gap". About a
  second long, with a haptic tick on Android and instant under reduced
  motion. This is the one new signature animation.
- **Tapping the chip** opens a sheet listing each note with its evidence and
  a **Not quite** button. Tapping it drops the hunch to zero, and Amp says
  "Got it, crossing that off." Corrections are part of listening.
- **Screen readers:** a polite live region announces "Amp noticed: recovery
  gap."
- **Comfort mode:** the chip becomes a full-width button, and the forming
  animation is a simple fade.

### B4. Reactions that connect answers (V4 upgrade)

Today's reaction restates the last answer. New rule, in order:

1. a hunch just formed → react to the pattern ("Four sessions on six hours'
   sleep. That's a recovery gap; I'll look at it.");
2. a scenario was just answered → say the conclusion;
3. otherwise → restate, as now.

The rules pick *what* to react to and pass the AI the hunch id and its
evidence. The AI words it within the existing 48-character schema. Each hunch
has a scripted line as the fallback.

### B5. "Tell Amp more" feeds the hunches

The understand route gets a new pick kind, `signal`, with a fixed list of
lifestyle signals:

- night shifts;
- desk job;
- travels a lot;
- skips breakfast;
- long commute;
- new parent;
- training for an event.

"I work nights" becomes a confirmable card, **Works night shifts**. Once
added, it feeds *Indoor life* and *Wired and tired*. The list never includes
health conditions, and the medical screen still runs first.

### B6. Review: what Amp worked out

Review (now the last screen, A2) opens with **What I worked out**: two to
four noticed hunches as cards. Each says the conclusion, its evidence, and
what it will change ("I'll lean on recovery"), with **Not quite** on each.
The answer cards and the safety card follow. Nothing is decided until
**Looks right**.

### B7. Results that explain themselves

- The analysis steps name the hunches: "Recovery gap → matching recovery",
  instead of generic steps.
- Fully charged shows a **because** line under each stack item, from its
  hunch. Any health wording uses register claim IDs only.
- The payload gains `because: { [sku]: hunchId[] }` for the results page to
  use later (optional, like the profile today).

### B8. The AI's job in all this

| AI does | Rules do |
|---------|----------|
| Words the noticing lines, the reaction and the "what I worked out" cards, within schemas and length limits | Decide which hunches exist, their confidence and what they change |
| Writes a variant of each scenario to suit the person (same answers, same meaning) | Choose which scenario to show, and when |
| Maps free text to the fixed signal list | Own the signal list, the safety class and every product decision |

Safety carries over from v3:

- structured outputs with a pinned model;
- scripted fallbacks for every line;
- the banned-word filter;
- the medical screen before any text is sent;
- nothing from the safety check or medication ever sent to AI.

The persona suite gains hunch expectations (who should and shouldn't be
noticed as what). The red-team set gains attempts to get the AI to infer a
condition ("sounds like you might be anaemic"), which must fail.

### B9. Knowing whether it works

- **In the hub:**
  - how often each hunch fires;
  - how often it gets **Not quite** (a hunch corrected more than 30% of the
    time needs its rule fixed);
  - scenario completion time and drop-off.
- **One optional tap on Fully charged:** "Did Amp get you?"
  (`Pretty much` / `Not really`).
- **The A/B that decides:** consult with hunches against without, measured on
  consult → results → subscription, using the funnel that exists (H12).

---

## 2. Build map

Sizes as in plan v3 (S ≈ 1 day, M ≈ 2–3, L ≈ 4–5).

### Phase 1: weight loss (ships first)

| ID | Build | Track | Size | Done when |
|----|-------|-------|------|-----------|
| W1 | Weight loss goal card with expanding switch | Widget | M | Card expands and collapses cleanly; the switch works by touch, keyboard and screen reader; comfort mode shows Yes/No |
| W2 | Transient medication field | Safety | S | Never in `localStorage`, AI requests or analytics (tested) |
| W3 | Safety check before review; review shows safety | UX | M | 9 screens on Speed run; edit round trip from review keeps every answer |
| W4 | Medication toggle, tailoring consent, symptom picker | Safety | M | Symptoms hidden until consent; toggle arrives pre-set from the card |
| W5 | Keep-out and tailoring rules, pinned Essentials | Brain | M | Every rule in A4 has a persona that passes |
| W6 | Pharmacist notes for injections and tablets | Safety | S | Note travels to the handoff and results |
| W7 | Fibre, clear whey and electrolyte stock | Brain | S | Readiness check shows each kind in stock (after your supplier import) |
| W8 | Tests, axe and keyboard pass for Phase 1 | Quality | S | All green |

### Phase 2: hunches underneath (no visible change yet)

| ID | Build | Track | Size | Done when |
|----|-------|-------|------|-----------|
| L1 | Hunch engine and the starting set | Brain | L | Same answers always give the same hunches; every hunch has personas for and against |
| L2 | Hunches feed the stack engine | Brain | M | A noticed hunch changes the stack as its table says, and only then |
| L3 | Value-of-information picker | Brain | M | Picks the check that changes the stack most; shows none if nothing would |
| L4 | Dynamic scene insertion in the flow engine | Brain | M | Back, review, resume and speed run all handle inserted checks |

### Phase 3: listening you can see

| ID | Build | Track | Size | Done when |
|----|-------|-------|------|-----------|
| L5 | Scenario scene with illustrated vignettes | Widget | L | One tap to answer; works at 200% text and in comfort mode |
| L6 | Amp's notes chip, forming animation and sheet | UI | L | The forming moment reads at a glance and is instant under reduced motion |
| L7 | Connected reactions | Amp | S | Reacts to patterns first, scenarios second, answers last |
| L8 | Review opens with "What I worked out" | UX | M | Not quite drops the hunch and the stack follows |
| L9 | Explained analysis and "because" lines | UI | M | Every product in Complete has a because line or none, never a made-up one |

### Phase 4: AI and quality

| ID | Build | Track | Size | Done when |
|----|-------|-------|------|-----------|
| L10 | AI wording for hunches, scenarios and review insights | Brain | M | Schema-checked with scripted fallbacks, visible in the hub's AI log |
| L11 | Tell Amp more signals | Brain | S | "I work nights" becomes a confirmable card that feeds a hunch |
| L12 | Persona and red-team additions | Quality | M | A safety failure blocks the release, as now |
| L13 | Hunch analytics and "Did Amp get you?" | Quality | S | Fire and correction rates visible in the hub |

Phase 1 is about 8–10 build days and can ship on its own. Phases 2–4 are
about 25–30 more.

---

## 3. What's needed from you

1. **Fibre products** from your suppliers, and ideally a second clear whey and
   electrolyte, in the catalogue with their swap groups.
2. **Pharmacist sign-off** on the jab rules in A4, the two proposed symptom
   rules (D6) and the injection and tablet notes.
3. **Consent wording** for "Use this to tailor my recommendations", and a DPIA
   update for medication and symptoms.
4. Your call on **D1–D7** above.
