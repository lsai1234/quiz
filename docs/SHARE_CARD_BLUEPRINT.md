# The share card — build blueprint

**Status:** Phases 0–1 landed. Phases 2–6 planned; review before each lands.
**Owner:** —
**Branch:** `claude/quiz-results-share-card-8xu3dp`

---

## 1. What this is

When someone finishes the quiz they get a stack. Right now that stack lives on
`StackReviewPage` and dies there unless they buy. This adds a **Share** button that
turns their result into a single, beautiful, downloadable image — the CHRGD version of
a Spotify Wrapped card — plus a short link that previews as that same image anywhere
it is pasted.

It serves three jobs, and they pull in different directions, so they are named
separately:

| Job | Who | What "working" means |
|---|---|---|
| **Vanity** | The customer who just finished | They want to post it. It has to look expensive. |
| **Reach** | Influencers and partners | Their code is on the card and in the link, and they can pull all three sizes without asking us. |
| **Entry** | The competition | A post can be verified as an entry, and the entry is attributable. |

The card is **not** a receipt and **not** a product page. It shows what someone's stack
is and why, and it says nothing about price.

---

## 2. What goes on the card

The brief was "really clearly showing all of the things that you've got, why you've got
them." That is the whole design problem: a lineup with a reason attached to each line,
without turning into a spreadsheet.

Everything below already exists in the codebase — nothing here needs new content
authored, which is why this can be built quickly.

### Story card — 1080 × 1920, the primary asset

Top to bottom:

1. **The ground.** The three-bloom mesh (cyan / violet / teal), vignette, grain.
   Baked static — see §3.2. This is what makes it read as CHRGD at thumbnail size,
   before a single word is legible.
2. **Eyebrow.** CHRGD wordmark, then `MY STACK` (or `MY LQD PACKAGE` in drinks mode).
3. **The name.** `blueprint.stackName` — the AI-generated 2–3 word name
   ("Iron Foundations", "Peak Protocol"). Display face, as large as it will go. This is
   the hook; it is the bit people screenshot.
4. **Archetype chip.** `identity.archetype` — "The Strength Builder".
5. **Fit meter.** `identity.routineFitScore` drawn as a `ChargeMeter` — meniscus, charge,
   bloom. The house signature has to be on the most public surface we own.
6. **BUILT FOR** — 3–4 focus areas as icon chips. `identity.focusAreas` mapped through
   the existing `focusAreaGlyph()` in `src/lib/identity-visuals.ts`.
7. **THE LINEUP** — the core of the card. One row per slot:
   slot title (`Protein`) · product name · a reason of seven words or fewer, from
   `slot.reason` truncated at a clause boundary. Capped at **6 rows**, then
   `+2 more in your stack` so a Complete-tier stack does not overflow.
8. **COVERAGE** — four bars. Axes from `selectStatAxes(blueprint, products)`, values from
   `stackStatScore(products, goal)`. This is "why you've got them" made visual: the
   user's own goals, and how well the stack covers each one. Same axes the deck already
   uses, so the card cannot disagree with the screen it came from.
9. **Footer.** `getchrgd.co.uk` · the partner/entry code as a legible chip ·
   "Build yours in 90 seconds".

### Square — 1080 × 1080, feed and carousel

Same card, coverage bars dropped, lineup capped at 4. Fits a carousel slide next to an
influencer's own photo.

### Open Graph — 1200 × 630, link preview

Two columns: name + archetype + fit meter left, top three products right. This one is
never downloaded — it exists so a pasted `/s/…` link previews correctly in WhatsApp,
Discord, Slack, iMessage and X.

### Competition variant — 1080 × 1920

The same card with the lineup shortened to four rows and the reclaimed space given to an
entry band. See §3.7 for why this is a variant rather than a badge on the standard card,
and how someone ends up with the right one.

### What never goes on the card

Price. Email. Age. Gender. Anything from the safety step. The card is a public URL that
may sit in someone's story highlights for a year; the safety screen is a health
disclosure and does not go near it. First name is **opt-in**, default off.

**The name leaks through a field that does not look like one.** `factory.ts`
addresses every personalised reason to the customer — `For Sam: Magnesium
glycinate to help you wind down…`. On the results screen that is a nice touch; on
a public card it publishes a name nobody opted into, arriving through what reads
as product copy. The payload builder is therefore given the customer's name in
order to *strip* it, with showing it a separate decision that defaults off. Found
by the Phase 0 privacy test, not by reading the code.

---

## 3. Technical decisions

Seven decisions carry the build. Each is stated with its cost, because each has a cheaper
option that is wrong.

### 3.1 Render server-side with `next/og`, not client-side capture

The image is produced by Satori (`ImageResponse`, ships with Next 16) from a dedicated
JSX component, at:

- `src/app/api/share/[token]/image/route.tsx` — `?format=story|square` for download
- `src/app/s/[token]/opengraph-image.tsx` — the 1200×630 preview

**Why not `html2canvas` / `dom-to-image` on the results page.** It is the obvious
shortcut and it fails here specifically: this design is `backdrop-filter`, `color-mix()`,
CSS custom properties and layered gradients, and DOM-capture libraries render all four
wrong or not at all. You would ship a grey approximation of the card, differently broken
on every browser, and iOS Safari would refuse the download. Server rendering gives one
canonical PNG, identical everywhere, that doubles as the link preview.

**The cost, stated plainly:** Satori supports a subset of CSS. Flexbox only — no grid.
No `backdrop-filter`. No `color-mix()`. No CSS variables from a stylesheet. So the card
is a **parallel renderer**, not a reuse of `StackReviewPage`. That is a real duplication
and it is the price of the format. It is contained: one component, one palette module,
one preview route.

### 3.2 The design system crosses the boundary as a frozen palette + a sync test

`DESIGN.md` says every design value comes from a token, and a test enforces it. Satori
cannot read `tokens.css`. Resolving that by hand-typing hex into the card component is
exactly the failure DESIGN.md was written against.

So:

- `src/lib/share-card/palette.ts` — literal values, one file, nothing else in the
  codebase may import it.
- `src/lib/share-card/__tests__/palette-sync.test.ts` — parses `src/app/tokens.css` and
  asserts every literal still equals its token. Move a token, this test fails and names
  the value that drifted.

The layered look is baked rather than filtered:

| Effect | On screen | On the card |
|---|---|---|
| Blooms | 3 drifting radial gradients | 3 static radial gradients, same colours and alphas |
| Glass | `backdrop-filter: blur()` | flat `rgba` fill at the composited value |
| Specular | `.system-glass` band | 1px line + short gradient, **still equal to the card padding** |
| Grain | tiled PNG at `--grain-opacity` | same tile, inlined as a data URI |
| ChargeMeter | animated meniscus | inline SVG path, meniscus frozen mid-wave |

The specular invariant holds on the card too. It is the reason the ink tiers clear AA
over a lit ground, and the card carries small text over the brightest part of the mesh.

### 3.3 Fonts must be vendored

`next/font/google` does not expose font binaries to `ImageResponse`. Space Grotesk and
Inter need to land as files in `src/lib/share-card/fonts/`, subset to Latin, loaded as
ArrayBuffers, node runtime (not edge — the bundle is over the edge limit with two
weights each).

### 3.4 The payload is a frozen snapshot, versioned

```ts
interface ShareCardPayload {
  v: 1
  stackName: string
  archetype: string                                   // '' when no identity
  focusAreas: { label: string; glyph: string }[]
  fitScore: number | null                             // null when no identity
  lineup: { slot: string; product: string; reason: string }[]
  coverage: { label: string; score: number; targeted: boolean }[]
  level: StackLevel
  drinksMode: boolean
  firstName?: string        // opt-in only
  code?: string             // partner / entry code
  createdAt: string
}
```

`coverage.targeted` is not `score > 0`, and the difference is why it exists.
`stackStatScore` gives every product a small baseline on every axis, so a goal
nothing in the stack addresses still scores around 31 — a bar a third full,
captioned with a goal the customer asked for and did not get. On a public card
that reads as a claim. The renderer draws untargeted axes as faint context rather
than as fill, which is the idiom the product deck already uses
(`StatBar.targeted`).

`identity` is nullable throughout: it comes from an AI call that can fail or be
unconfigured, and a share button that only works when OpenAI is reachable is
broken for some fraction of every day. Without it the card loses its archetype,
focus chips and fit meter and keeps its name, lineup and coverage.

Built once, at share time, by `buildSharePayload(blueprint, identity, products)` and
stored. **Never re-derived from a live blueprint at render time.** Products get swapped,
the catalogue moves, prices change, `NEXT_PUBLIC_DATA_SOURCE` flips. A card shared in
October has to still render in March showing what was actually shared. The `v` field is
how the renderer handles old payloads when the card design changes.

### 3.5 Short token, DB-backed, with a stateless fallback

`getchrgd.co.uk/s/AB12CD7X9K` — 10 characters, Crockford base32 (no I/L/O/U, so it can
be read off a screenshot and typed).

New migration, following the existing pattern in `src/lib/db/migrations.ts`:

```sql
CREATE TABLE share_cards (
  token        TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  partner_code TEXT,
  payload      TEXT NOT NULL,
  view_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  revoked_at   TEXT
);
CREATE INDEX share_cards_partner ON share_cards(partner_code);
```

10 characters rather than 6 because the payload can carry a first name. Revocable, and
expired anonymous cards get swept by the existing `/api/cron/daily`.

**Fallback:** with no database (mock mode, local dev), the payload is base64url-encoded
into the URL directly. Long link, no view counting, everything else works. The feature
must not require Postgres to be demoable.

### 3.6 Web Share API is the primary CTA; download is the fallback

There is no way to post to Instagram Stories from mobile web. No API, no URL scheme that
works outside a native app. Anyone who tells you otherwise is describing the iOS/Android
**share sheet**, which is the actual answer: `navigator.share({ files: [png] })` opens
the OS sheet, and Instagram → Stories is one tap inside it.

So the ladder is:

1. `navigator.canShare({ files })` → `navigator.share(…)`. One tap to Stories. This is
   the path the great majority of mobile users take.
2. `<a download>` — desktop, and Android browsers without file share.
3. iOS Safari without share (rare): render the PNG full-bleed with
   "press and hold to save". Because iOS silently ignores `<a download>` for
   cross-origin blobs and the button would otherwise appear to do nothing.
4. Copy link, always available, next to the primary button.

### 3.7 One card, two variants — and the variant is routed, not toggled

The competition needs the card to double as its advert. That is a different job from
the vanity card, and the two do not combine well on one surface:

- A prize banner has to be loud or nobody enters, and loud eats `stackName`, which is
  the hook.
- It changes what the post says about the poster. "Here's my stack" reads as personal;
  the same card with WIN £200 on it reads as an ad they were paid to run. That is what
  kills reshares.
- Per §6.2, an advert for the promotion carries significant conditions **on the image**.
  Three lines of legal small print ruin a vanity card and are fine on a card built for it.

A separate generic giveaway graphic is not the answer either — an impersonal "WIN £200"
tile gets scrolled past. The reason this works at all is that the advert *is* someone's
own result.

**So: same payload, same renderer, a second composition.** `format=story-comp` keeps the
name, archetype and fit meter, shrinks the lineup from six rows to four, and spends the
reclaimed bottom third on an entry band: prize, the follow/repost/share mechanic, closing
date, terms pointer, and the code set large enough to read off a screenshot. One extra
layout in a renderer already producing three.

**The entry rule:** the competition card is the one that must be posted to enter; the
clean card is an optional extra alongside it. One sentence in the T&Cs, a verifiable
entry, and the conditions living on the entry post itself.

**Routing, not a toggle.** Finish the quiz normally → the clean card, with a quiet line
under the share button: *Entering the £200 giveaway? Get the entry version.* Arrive from
a competition link or tap the giveaway CTA → the entry card is the default, clean one
available as "just my stack". Nobody has to know there are two.

Two constraints on this:

**The clean card stays the default while the competition runs.** Defaulting everyone to
the entry card will be tempting and will lower the overall share rate — most people do
not want to look like they are running an ad.

**The competition card expires.** This is the one exception to §3.4: the payload freezes
what was shared, but *promotion state must stay live*. A card still rendering
"closes 30 Nov" in January is a promotion that appears open when it is closed — a CAP
problem. Past the closing date the renderer draws a closed state or falls back to the
clean card. The closing date is read from live campaign config at render time, never
from the snapshot.

---

## 4. Phases

Each phase is independently shippable and independently useful. Estimates are build days
for one developer, excluding review.

### Phase 0 — Foundations · 0.5d — **done**

No UI. Landed in `src/lib/share-card/`: the payload type and builder, the frozen
palette and its sync test, three subsetted faces (127KB) with a loader, and the
share-token generator.

**Exit met:** 120 tests green across the payload, palette, token and font suites;
full suite 2366 green; `tsc --noEmit` clean.

Three things the phase changed about the plan, each recorded where it belongs:
`coverage.targeted` added to the payload (§3.4), name redaction added to the
builder (§2), and one persona that turns out not to be reachable from the mock
catalogue (§5).

### Phase 1 — The renderer · 2d — **done**

`ShareCard` (Satori), three formats, `/api/share/image`, and `/styleguide/share`
rendering all three at true pixel size across six personas — from the same route a
customer downloads from, so the preview cannot diverge from the product.

**Exit met:** 18 rasterisation cases green (six personas × three formats), row counts
pinned in `format.test.ts`, full suite 2423 green, `tsc --noEmit` clean. Awaiting founder
sign-off at `/styleguide/share`.

Four things rendering it changed, none of which were visible on paper:

- **`CARD_SCALE` is 2.25, not 3.** An app screen scrolls and a card does not: the results
  page spends ~2.5 screens on what the card must fit in one frame, so matching the app's
  apparent size put the lineup off the bottom edge.
- **Row counts are a budget, not a constant.** A long name wraps to two lines; a card with
  no AI identity has ~300px less header. A constant was wrong in both directions —
  overflowing the longest persona and leaving a third of the no-identity card empty.
  `format.ts` now costs the header in card pixels and divides what is left by a row.
- **Satori lays a React fragment out as a row container.** `<>…</>` is not flattened the
  way React flattens it, so the stacked card silently became two columns running off the
  edge. Every branch now returns one real element.
- **Format contents shifted.** Square drops the fit ring (121px of header — the difference
  between two products with their reasons and one). OG drops the reasons (a grey texture
  at link-preview size) and the code chip (the URL beside it already carries the code).

Story shows four rows, square two, OG two.

### Phase 2 — The share sheet · 1.5d

Share button on `StackReviewPage`. `ShareSheet` built from `@/components/system` `Modal`
— preview thumbnail, primary share button, format switch, copy link. The share ladder
from §3.6. Analytics: `share_open`, `share_render`, `share_method`, `share_error`, as
typed wrappers alongside `funnel` in `src/lib/analytics/`.

**Exit:** works on iOS Safari, Android Chrome and desktop; failure of any rung falls to
the next rung visibly rather than silently.

### Phase 3 — Persistence and the landing page · 1.5d

The migration, the repo module, `/s/[token]` — a real page with OG/Twitter meta, the
card rendered large, and one CTA: *Build your own stack*. View counting, revocation,
retention sweep.

**Exit:** a pasted link previews correctly in WhatsApp, iMessage, Slack, Discord and X;
`/s/` → quiz-start is tracked end to end.

### Phase 4 — Influencer mode · 1d

Partner code baked into the card and into the link (reusing `middleware.ts` and the
existing `REFERRAL_COOKIE` — attribution is already solved, this just feeds it). A
**Your share assets** panel in the Partners Hub: all three sizes, the link, and
share/click/conversion counts on the existing dashboard.

**Exit:** a partner can pull their assets without contacting us, and a purchase from a
card click lands as a commission row.

### Phase 5 — The competition · 2.5d

The `story-comp` variant and its routing (§3.7), `competition_entries` (share token,
claimed handle, channel, state), the entry flow off the share sheet, a T&Cs page under
`src/app/legal/`, live campaign config with a closing date, an entries list and winner
draw in the Founders Hub, and the free-entry route required by §6.2.

**Entry is not the same object as a share.** One person may share five times and enter
once; someone may enter without ever sharing (the free route). Modelling entry as "a
share that happened" makes the draw unauditable.

**Exit:** legal sign-off (§6.2) obtained before this phase ships. Not before it is
built — before it is *shipped*.

### Phase 6 — Measure and iterate · ongoing

Per-archetype card art. A/B the CTA copy. Card→quiz→checkout conversion by channel.

---

## 5. Test personas

The six the renderer has to survive, all of which the engine can already produce:

1. **Essentials** — 3 products, short names, one goal.
2. **Complete** — 9 products, needs the `+n more` overflow.
3. **LQD drinks mode** — different eyebrow, different framing, no formats step.
4. **Wellbeing track** — no training language anywhere on the card.
5. **Unmet goals** — `blueprint.unmetGoals` non-empty. The card shows coverage
   honestly rather than drawing a full bar for a goal nothing covers.
   *Phase 0 note:* not reachable from the mock catalogue — every safety-gated
   persona tried still finds a substitute, so `unmetGoals` comes back empty. It
   becomes reachable the moment the real catalogue is thinner than the mock one,
   which is exactly when a card claiming full coverage would be a lie. Covered by
   a hand-built blueprint until a real thin-catalogue fixture exists.
6. **Long everything** — longest product name and longest AI stack name in the
   catalogue, plus a long first name. This is the one that breaks layouts.

---

## 6. Two blocking gates

### 6.1 Claims

The card is the most public surface CHRGD will own — it goes on stories, it gets
screenshotted, it outlives the session. Every string on it must be claim-safe in the
voice already established by `approved-claims.ts` and the `COMPLIANCE` note in
`stack-stats.ts`: *supports*, *targets*, *helps* — never *improves*, *boosts*, *increases
by*, and no quantified outcome.

`slot.reason` is partly AI-generated (`/api/personalise-stack`, `/api/generate-identity`).
That means unreviewed model output would be going onto a public asset.

**Required:** `share-card-claims.test.ts`, asserting no banned verb appears in any
rendered string, plus a server-side filter that falls back to the deterministic
non-personalised reason when a generated one trips it. Fail closed.

### 6.2 The prize promotion

"Follow, repost, share to your story, win up to £200 of supplements" is a prize draw
under the CAP Code, and it needs things the current plan does not yet have:

- Published T&Cs: closing date, promoter name and address, prize detail, how winners are
  picked and notified, and what happens if a winner cannot be contacted.
- Significant conditions stated on the promotion itself, not only behind a link.
- A **no-purchase-necessary free entry route** of equal standing.
- Instagram's own promotion rules: an acknowledgement that the promotion is not
  sponsored, endorsed or administered by Instagram.

I am flagging this rather than working around it. It does not slow Phases 0–4 down at
all — the share card ships and earns on its own, and the competition rides on top of it
once the wording is signed off. Get it reviewed in parallel, starting now, so it is not
what holds up launch.

---

## 7. What we measure

| Question | Signal |
|---|---|
| Do people share? | `share_open` / quiz completions |
| Do they finish sharing? | `share_method` / `share_open` — and which rung |
| Does it travel? | `/s/` views per card |
| Does it convert? | `/s/` → `quiz_start` → checkout |
| Which channel works? | conversion split by referrer and by partner code |
| Does the competition pay? | entries, and entry-attributed revenue vs prize cost |

The one to watch in the first week is the second row. A high `share_open` with a low
completion rate means the ladder in §3.6 is falling through on a real device, and it
will look like disinterest rather than a bug.

---

## 8. Open questions for the founder

1. **First name on the card** — opt-in with a toggle, or off entirely? Planned as
   opt-in, default off.
2. **Does the card show the tier** (Essentials / Balanced / Complete)? It is a nice
   status signal and it is also a soft price signal. Planned: show it.
3. **Fit score** — a number on a public card invites comparison between friends. Good
   for reach, and it is a routine-fit figure rather than a health score. Planned: show it.
4. **Card lifetime** — anonymous cards swept after 12 months, account-linked cards kept?
5. **Prize** — "up to £200" needs a defined structure before T&Cs can be written.
6. **Entry post** — is posting the competition card the *only* way to enter via social,
   or does a story mentioning the brand count? The former is verifiable and is what
   §3.7 assumes; the latter is looser and much harder to audit.

---

## 9. Recommended sequence

Phases 0–3 are the product: a customer finishing the quiz gets a card worth posting, and
a pasted link previews properly. That is roughly a week and it stands alone.

Phase 4 is a day on top and is what makes influencer seeding possible at all.

Phase 5 waits on §6.2 and nothing else.

---

*Assessed by reading the source on this branch. `node_modules` is not installed in this
environment, so no tests were run and no build was attempted — every file path and API
above is from the code as written, but nothing here has been executed.*
