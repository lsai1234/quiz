# Consult Phase 5: two proposals

The plan asks for two things to be proposed in Phase 5. **Both are approved
(2026-10-28) and built**: the consult keeps its own tiers, and the protein
module is on Deep and Pinpoint, with a measured gap outweighing the plate's
guess, as proposed below. In the same decision the consult claims map was
signed off (`CONSULT_CLAIMS_SIGNOFF`) and every habit fix and GP line was
approved.

## 1. The consult's tiers on the results page (built; kept, 2026-10-28)

**What changed.** A consult stack is no longer re-tiered by price band
(`planTiers`). The depth picker shows the consult's own three tiers, with the
consult's own names (`src/lib/consult/tiers.ts`):

| Picker | Contents | Name on screen |
| --- | --- | --- |
| Essentials | the consult's first 3 | Essentials |
| Standard | its first 5 | Standard (was "Balanced") |
| Complete | its 7 or 8 | Complete |

- **Hero first**, as `consultOffer` puts it: anything of the same family comes
  out, and each tier keeps its size, so Essentials is still three products.
- **Swaps and add-ons.** A product swapped on the page keeps its place in its
  tier; a product they added themselves is in every tier (as the quiz's
  anchors are); a product they took out is gone from all three.
- **Prices.** Each tier shows its real total from the same `calculatePricing`
  as the receipt: no band, so Essentials costs what its three products cost.
  The subscription minimum still applies, so a small tier can read "Monthly
  unavailable", and the bundle discount still follows basket value.
- **Folding.** Two tiers with exactly the same products show once (a small
  consult stack can be three products in all three).
- **Unchanged.** The quiz keeps price bands. A partner claiming a starter
  stack keeps the banded, capped plan, because a starter is a fixed budget.

**The trade-off.** Price bands kept Essentials at about the same money for
everyone; the consult's tiers keep its ranking instead, so Essentials can cost
more for someone whose top three are dear (a protein and a creatine, say).
The recommendation is to keep the consult's ranking: the consult is sold on
"built from your answers", and a tier that drops a top-three product to fit a
band breaks that. If you'd rather keep bands, the alternative is to band the
consult's ranking (take its order, cut at the band), which is a small change
in `consultTierPlans`.

## 2. The protein module in the consult (approved and built, 2026-10-28)

**What it is.** v2's protein check (`docs/QUIZ_V2_PROTEIN.md`): a target from
weight and training, an estimate from one of three doors (just ask me /
pick a day / count it), and the gap, said as a number on the same screen.

**Where it sits.** One scene in the Fuel section, straight after "food" (the
plate) and before Fuel's Pinpoint follow-ups, on Deep and Pinpoint only.
Speed run never sees it.

**Screen counts** (measured with `visibleScenes` on the persona suite):

| Route | Builder (p13) | Ager (p33) | Everyday, Pinpoint (p34) |
| --- | --- | --- | --- |
| Speed | 11 → 11 | 11 → 11 | 11 → 11 |
| Deep | 13 → 14 | 13 → 14 | 13 → 14 |
| Pinpoint | 16 → 17 | 16 → 17 | 16 → 17 |

Phase 6 removes the route choice, so after Phase 6 everyone starts on the
core scenes; the module adds one screen to that path.

**What it feeds** (this is the part that changes Pinpoint's maths, so it
waits for a yes):

- **The protein-gap pattern.** A measured gap of 25g or more nudges
  `protein-gap` *strongly* towards; a met target nudges it *away clearly*;
  "just ask me" nudges nothing (as today). Evidence line: "About 85g a day
  against a 120g target".
- **The engine.** The protein need gets the gap as its source ("About 85g a
  day against 120g"), an answer restated, so it may sit beside a protein with
  its claim.
- **Try this week.** The protein-breakfast fix uses their gap instead of a
  flat 25g: "Put about 35g of protein in your breakfast…", capped at 40g.
- **Privacy.** *Correction:* this said body weight was already collected on
  "about"; it isn't. As in v2, the scene asks for a weight band itself, one
  optional row of chips, and without one there's no number (the estimate
  still shows, against nothing). The weight and the estimate stay on the device
  and in the handoff like every other answer, and are never sent to the AI:
  they aren't on the copy AI's allow list, the evidence line is marked
  `local` so Pinpoint's AI never gets it, and the server refuses gram figures
  as evidence anyway.

**As built** (`src/lib/consult/protein.ts`, `scenes/ProteinScene.tsx`): v2's
sums and options, unchanged (a test holds the grams to v2's bank), with the
consult's own words, which say the number and where it sits and never mention
a product. A small gap (under a scoop) adds 2 to the protein need and nudges
no pattern; a met target adds nothing to the need (it doesn't remove protein
a goal asked for).

**To decide.** (a) Yes or no to the scene on Deep and Pinpoint. (b) Whether a
measured gap should outweigh "Protein at one meal, not three" (the pattern's
current evidence), as proposed, or only add to it.
