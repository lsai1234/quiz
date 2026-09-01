# The quiz copy pass — every change, both quizzes

A read-through of every question, hint, option label and sub-label in both
quizzes, rewriting the ones that read as generated rather than written. Nothing
here changes what any question *asks* or what any answer *means*: option ids,
scoring, `answers` patches and the flow are untouched, so this cannot move the
recommendation. It is only the words.

The v2 bank's copy is pinned by a snapshot (`project.test.ts` → *"reads the same
tomorrow as it does today"*), so every v2 line below also shows up there as a
reviewable diff.

---

## What was actually wrong

Four habits, and it is worth naming them because they are what to watch for in
the next batch rather than a list of one-off typos.

**1. The same sentence four times.** The single loudest tell. Four different
hints in the v2 bank were the same construction with the nouns swapped:

> *"Falling asleep and staying asleep want completely different things."*
> *"The timing points at completely different support."*
> *"A recent change and a long-standing wish need different things."*
> *"A recent change and a long-running one point different ways."*

Any one of them reads fine. Meeting all four in one run is what tells a reader
that nobody wrote this, and no single line looks wrong in review — which is
exactly why it survived.

**2. No contractions.** *"The muscles have not let go"*, *"Eating is not the
issue"*, *"Sleep is not the problem"*, *"there is just not enough of it"*.
Nobody speaks like this. It is the most reliable single signal of machine-written
English and the cheapest to fix.

**3. Hints that describe our machinery instead of their life.** *"Shapes product
selection and dosage approach"*, *"Directs the products we prioritise"*,
*"Different sports have different demand profiles"*. These say a decision is
being made without saying what it is, which is the shape of a sentence written
to fill a field.

**4. Flattery in the option labels.** *"Established athlete"*, *"Elite /
professional level"*, *"Serious athlete"*, *"Yes — bring the kick"*. Somebody
training six days a week does not need us to tell them they are elite, and
somebody training twice a week reads the ladder and knows where they have been
placed on it.

One factual error turned up on the way: v1's goals screen said *"we'll prioritise
by what you choose most"*, and the code has always taken `goals[0]` — the first
one tapped. v2's wording was already right. Fixed.

---

## v1 — step copy (`src/lib/quiz-flow.ts`)

| Step | Before | After |
|---|---|---|
| goals | Pick everything that applies — we'll prioritise by what you choose most. | Pick everything that applies. The first one you tap is the one we lead with. |
| goals (LQD) | …we'll cover it all with ready-made drinks. | …we'll cover the lot with ready-made drinks. |
| safety | So we only ever suggest things that are right for you. | This only ever takes products out of your box — it never adds any. |
| dailyDrinks | Your everyday base — it just helps us size the box. | Just so we send the right number. It doesn't change what's in them. |
| personal | Helps us tailor the doses and picks to you. | Age and weight set the doses. The name is just so we can talk to you properly. |
| frequency | Your frequency shapes the whole stack. | This changes the size of the box more than anything else you'll tell us. |
| frequency (LQD) | Your frequency shapes the whole package. | This changes how much we send more than anything else you'll tell us. |
| type | Pick the one that fits best — we'll tune around it. | Pick the closest one — we build around it. |
| lifestyle (Q) | Tell us about yourself | Anything else going on? |
| lifestyle | Select anything that applies — helps us fine-tune. | Tick anything that applies. Skip it if none of them do. |
| lifestyle (wellbeing, Q) | Tell us about your day-to-day | Anything else going on day to day? |
| lifestyle (wellbeing) | Select anything that applies — context changes what we recommend. | Tick anything that applies — each one changes what we'd send. |
| caffeine | Shapes your pre-workout recommendation. | This decides whether a stimulant belongs in your box at all. |
| trainingTime | Caffeine timing matters — tells us whether to include stimulants. | A stimulant at 7pm becomes a sleep problem, so we need to know. |
| deepDive | Optional — every answer here sharpens the final picks. | Optional — a few more questions, and we can be more specific. |

## v1 — options and follow-ups (`src/components/scroll/Act2Quiz.tsx`)

| Where | Before | After |
|---|---|---|
| experience (hint) | Shapes product selection and dosage approach | Doses go up with the years, not just the sessions |
| experience | Just getting started / Under 6 months | Under 6 months / Still finding the routine |
| experience | Building consistency / 6 months – 2 years | 6 months to 2 years / It has stuck |
| experience | Established athlete / 2+ years | More than 2 years / Training is just part of the week now |
| strengthFocus (hint) | Directs the products we prioritise | Size and strength want different things from a stack |
| sportType (hint) | Different sports have different demand profiles | A 90-minute match and a 90-second sprint ask for different things |
| stim (hint) | Some athletes prefer to control caffeine separately | You already get plenty — this is only about whether we add more |
| stim | Yes — bring the kick / No — stim-free please | Yes, include one / No, keep it stim-free |
| sleepQuality (hint) | Shapes which sleep support we recommend | Getting off and staying asleep need different things |
| stressPattern (hint) | Helps us target the right support | When it lands tells us more than how bad it is |
| collagenOk (hint) | We'll only recommend products you can actually take | There is a plant-based version, so this is not a dead end |
| frequency | Casual — just getting started | When it fits |
| frequency | Regular training | Most weeks, most of the time |
| frequency | Serious athlete | Training is planned around, not fitted in |
| frequency | Elite / professional level | Something most days, rest days aside |
| caffeine | 3+ coffees, used to pre-workout | Three or more, and pre-workout doesn't touch me |
| diet | Convenience-led — good and bad days | Some good days, some not |
| dailyDrinks | A single go-to drink — easy does it | One go-to drink, same time most days |
| dailyDrinks | Morning and later — the sweet spot | One in the morning, one later |
| workoutAddOns | A hit of energy & focus before you train | One before you train, on training days only |
| name field | Personalises your results | Optional — it just puts your name on the results |
| weight field | Makes your protein & creatine doses accurate | Optional — protein and creatine are dosed by bodyweight |
| deep-dive offer | Go deeper for sharper picks / A couple of extra questions, written for you — we'll fine-tune every choice in your stack. | Answer a couple more? / Written from what you have just told us. They narrow down the picks we are still deciding between. |

## v2 — the question bank (`src/lib/quiz-v2/bank/`)

| Question | Before | After |
|---|---|---|
| energy-when (hint) | The pattern says more than the tiredness does. | When it hits tells us more than how bad it is. |
| energy-afternoon (hint) | An afternoon wall is usually built earlier in the day. | An afternoon crash is usually built at breakfast. |
| energy-drain (hint) | Different demands need different support. | We are after what actually empties the tank, not how full it started. |
| energy-duration (hint) | A recent change and a long-running one point different ways. | Something that started in March is a different problem to something that always has been. |
| day-shape (hint) | Where you spend it changes what your body runs short of. | Daylight, movement and hours are the three this decides. |
| energy-drain | Nothing obvious, and that is the odd part | Nothing obvious, which is the annoying part |
| energy-afternoon | Eating is not the issue | Eating isn't the issue |
| sleep-quality | Sleep is not the problem | Sleep isn't the problem |
| sleep-quality | The hours are there, the rest is not | The hours are there, the rest isn't |
| energy-afternoon | Whatever is nearest, if anything | Whatever's nearest, if anything |
| training-blocker | Never quite hitting it | Never quite hit it |
| recovery-window | Muscles have not let go | The muscles still haven't let go |
| recovery-window | The energy has not come back | The energy hasn't come back |
| training-shape | Serious lifting volume | Most days of the week |
| recovery-window (hint) | Tells us whether to spend the budget on recovery or on output. | This decides whether your box leans on recovery or on output. |
| sweat-rate (hint) | Electrolytes only earn their place if you actually lose them. | Electrolytes are only worth the money if you are actually losing them. |
| plateau-shape (hint) | Strength and size stall for different reasons. | A stuck bench and a stuck mirror have different causes. |
| sleep-problem (hint) | Falling asleep and staying asleep want completely different things. | Getting off and staying off are two different problems. |
| wind-down (hint) | The wind-down decides a lot of what happens after it. | What you do in that hour usually decides the night. |
| stress-timing (hint) | The timing points at completely different support. | The hour it lands is the useful bit. |
| screen-time (hint) | Sustained screen work has its own cost. | Hours of screen is its own kind of tired. |
| illness-rate (hint) | Frequency tells us whether this is maintenance or catch-up. | Twice a winter and every other month are not the same ask. |
| exposure (hint) | Tick everything that applies — exposure is half of it. | Tick everything that applies — most of this is who you are around. |
| gut-timing (hint) | Habits and timing, not symptoms — we are not a clinic. | Habits and timing, not symptoms — we're not a clinic. |
| fibre (hint) | Fibre first; a probiotic works better on top of it than instead of it. | A probiotic works better on top of decent fibre than in place of it. |
| skin-change (hint) | A recent change and a long-standing wish need different things. | Something that changed recently is worth treating differently. |
| priority (hint) | Wherever this is landing hardest is where we start. | Whichever you pick is what we build the box around first. |
| daylight (hint) | The UK makes this the most common gap there is. | Between October and March the UK doesn't make enough of it to matter. |
| sleep-problem | It does not seem to count | It doesn't seem to count |
| sleep-problem | There is just not enough of it | There just isn't enough of it |
| fibre | Barely any, if I am honest | Barely any, if I'm honest |
| tried-before (hint) | Tell us what did not work and we will not send it again. | Tell us what didn't work and we won't send it again. |

## v2 — the protein check and the recap

| Where | Before | After |
|---|---|---|
| basis, lifting | You lift — that moves this number more than most people expect. | You lift, which moves this number a long way up. |
| basis, deficit | You're eating less to lose weight, which changes this more than it looks. | You're eating less to lose weight, which is exactly when this matters most. |
| basis, active | You're active most weeks, and that shifts what you need. | You train most weeks, so this sits above the standard figure. |
| basis, sedentary | Worth a look even if you're not training — most people are under. | Worth a look even if you don't train — most people are under. |
| weight row | It is the one thing we need to say anything useful about the amount — skip it and we will keep it general. | It's the one thing we need before we can say anything useful about the amount. Skip it and we'll keep it general. |
| recap: sleep-debt | you are running on less sleep than you need | you're running on less sleep than you need |
| recap: stress-load | you are carrying a lot at the moment | you're carrying a lot at the moment |
| recap: wired-evening | you are still wired when you should be winding down | you're still wired when you should be winding down |
| recap: sedentary-slump | you are sitting for most of the day | you're sitting for most of the day |
| recap: training-load | you are training hard and often | you're training hard and often |
| recap: recovery-debt | you are not bouncing back between sessions | you're not bouncing back between sessions |
| recap: illness-frequency | you pick things up more often than you would like | you pick things up more often than you'd like |
| recap: micronutrient-gap | your diet leaves some everyday gaps | there are some everyday gaps in what you eat |
| loading | Building around what you told us… | Putting your box together… |
| name field | Personalises your results | Optional — it just puts your name on the results |
| weight field | Makes your protein & creatine doses accurate | Optional — protein and creatine are dosed by bodyweight |

## Left alone, deliberately

- **The goals grid and the two track cards.** They are the top of both funnels
  and identical between the arms on purpose — a wording change there moves the
  numbers for reasons that have nothing to do with the questions underneath.
- **The safety screen's reassurance.** It is doing legal work as well as
  conversational work, and it reads fine.
- **The verdict copy in `protein.ts`.** Every line is pinned by tests that check
  it never states a deficiency, always carries the `≈`, and stays proportionate
  to the gap. It was written against those rules and still reads well.
- **`diet` / `how-meals-happen`.** *"No judgement — it just points us at the
  right gaps"* is exactly right, and the option labels there are the best in
  either quiz.
