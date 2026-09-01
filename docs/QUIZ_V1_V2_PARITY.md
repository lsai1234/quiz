# What v1 has that v2 did not

v2 was built as a second arm rather than a rewrite, so it inherited v1's chrome
and none of v1's history. Everything below is a fix, a tweak or a behaviour that
v1 accumulated after launch and v2 shipped without — found by reading the two
components against each other rather than by anything failing, which is the
point: none of these threw, and most of them look exactly like a design choice
from the outside.

Four were applied. Two are deliberate differences. One is a real gap left open
on purpose, and it is named here so it stays visible.

---

## Applied

### The drinks route silently became a box of tubs

**The worst one.** The hero's CHRGD LQD card sets `drinksMode` on the store. v1
reads it: two extra questions, its own copy overrides, and a catalogue filtered
to ready-to-drink. v2 has none of that — and because it finishes by handing the
engine a freshly projected `QuizAnswers`, completing it *overwrote* the flag the
hero had just set.

So a visitor bucketed into v2 who asked for drinks was given powders and
capsules, and nothing anywhere reported a problem.

Fixed by `armForRun`: a drinks run goes to v1 whatever the experiment says. That
is the honest fix rather than the cheap one — the experiment is about the
adaptive question set, and a drinks visitor is not in it.

### "Keep yours, or try ours?"

Ticking something on the supps screen is a **hard exclusion** in `scoreProduct`,
not a penalty: the whole swap group is removed. Right by default; wrong for the
member who takes a supermarket multivitamin and would happily swap.

v1 has had the escape hatch since launch. v2 had no way to say it, and the
absence was invisible — an excluded product looks exactly like a product that
was never a good fit.

`tryOurs` now rides on the interview, pruned on write *and* in the projection,
because the two go stale differently: unticking on the screen, and an edit from
the review that rewrites the answer underneath a preference set before it.

### The "more below" cue

v1 grew a chevron because a follow-up rendered under the options was invisible
on a short window and people pressed Continue without ever seeing it. v2 has the
same shape and more of it — the counted protein day, the try-ours follow-up, the
safety screen behind its consent gate — so it had the same bug and none of the
fix.

### The deeper-context block came through empty on the arm that knew most

The stack personaliser's prompt has a `DEEPER CONTEXT` section, there to carry
*why* this person is low on energy. v1 fills it from the deep-dive follow-ups.

v2 has no deep-dive step, because its entire run is root-cause questions — so
the block arrived empty, and the personaliser worked from **less** on the arm
that had been told **more**. It reads `answers.drivers` now, through the
pre-written `heard` strings the recap already says to the member's face. No
confidence figures go over; a decimal in a prompt reads as precision this has
not got.

### The "did you know?" tidbit

v1's occasional brand aside, keyed to the two v2 questions that hold the same
place in the run. Deliberately **not** the protein check: that screen's footer is
already showing the reader a number about their own diet, and a floating brand
card over the top of it is the one place the chip is an interruption rather than
an aside.

---

## Differences that are correct

**No deep-dive step.** v1 offers AI-written follow-ups from the review screen.
v2's whole run is adaptive, so the step is subsumed rather than missing — and
its one durable output, the lifestyle signal tags, reaches the engine anyway
because bank options write `signals` directly.

**No LQD support.** See above. Not a gap now that drinks runs never reach v2.

---

## Left open, on purpose

**v2 cannot be resumed.** v1 writes each answer to the persisted store as it
goes, so a visitor who leaves mid-quiz is offered *"pick up where you left
off?"* on their next visit. v2 holds `InterviewState` in component state and
writes to the store only at the end.

There is no false promise — `hasQuizProgress` needs `step > 0`, which v2 never
sets, so the prompt correctly stays hidden. But a v2 visitor who comes back
starts over, and a v1 visitor does not, which is a difference in **completion
rate** that has nothing to do with the questions. It is worth knowing about
before reading the experiment's numbers.

It is not fixed here because persisting an adaptive run is not the same job as
persisting a fixed one: a stored `InterviewState` holds option ids from whatever
version of the bank was live when it was written, and a bank edit between two
visits would restore a run referring to questions that no longer exist. That
wants its own change, with a schema version on the stored state and a rule for
what to do when it does not match — which is more than a parity fix.
