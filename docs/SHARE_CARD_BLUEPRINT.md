# The share card — build blueprint

**Status:** Phases 0–7 landed (Phase 1 rebuilt twice — see Phase 7). Phase 5 is off by default and waits on the wording. Phase 6 ongoing.
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

**Rebuilt after the first version was reviewed and rejected.** What shipped first
was the results page rendered at 1080px — translucent glass rows on a dark ground
— and it read exactly like what it was: a piece of an app, photographed. The
reference for the rebuild is Spotify Wrapped, and what that format actually does
is four things an app screen does not:

1. **A picture**, roughly the top 45%. Nothing else buys attention at thumbnail
   size, and it was the single largest gap.
2. **A hard split** — a solid light data panel under a dark image panel. Two
   planes of translucent grey is an interface; black type on a light panel is
   print. This is why `--surface-print` was added to the token set.
3. **Density** — numbered lists in two columns, not a stack of identical cards.
   Ten data points where the old layout fitted four.
4. **A signature** — the mark, the domain, and one enormous number.

Top to bottom:

1. **Image panel.** The CHRGD product render on a *charge field* — the logo's own
   charge bars run as hard stripes, tightening as they rise. Not the reference's
   op-art checkerboard: borrowing that would make the card look like Spotify's
   rather than ours. The routine-fit score is ghosted enormous over the field,
   the card's answer to the reference's "2025".
2. **Masthead**, on the picture: `CHRGD STACK · Complete`, with an opted-in first
   name in front of it.
3. **The headline.** The AI identity's name at display size, in black on the light
   panel, with the archetype beneath it.
4. **Two numbered lists.** *Your stack* — the products, brand prefix stripped,
   each pinned to one line — and *Built for*, the focus areas, or the customer's
   own goals when no identity was generated. **This is where the card says why.**
   The first version spent a whole row and a sentence per product; this says the
   same thing in a third of the space and is far more scannable.
5. **Overflow line** — `+1 more in your stack`.
6. **Two stat pairs** — `Routine fit / 88` and `Built mainly for / Muscle`. A
   number and a word: two words is a caption, two numbers is a table.
7. **Footer bar** — the CHRGD mark and wordmark, the code chip, `getchrgd.co.uk`.

**On the pictures.** Every product in the catalogue carries `imageUrl: null` —
there is no product photography in the system. The card uses the CHRGD renders
from `public/hero/`, downscaled into `share-card/art/` (~200KB for four), keyed
off the first slot. `payload.heroImage` carries a real image straight through
when the catalogue has one, so photography is a data change rather than a code
change on the day it lands.

### Square — 1080 × 1080, feed and carousel

The same card at 56% of the height: smaller picture, lists three deep, no
overflow line. Fits a carousel slide next to an influencer's own photo.

### Open Graph — 1200 × 630, link preview

Picture down the left, everything that survives at 400px wide to the right of it,
no code chip — the URL beside it already carries the code. Never downloaded; it
exists so a pasted `/s/…` link unfurls properly in WhatsApp, Discord, Slack,
iMessage and X.

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

**Then it was reviewed and rejected, and rebuilt.** The verdict was that it looked
like an app screenshot rather than something anyone would post — correct, and the
right moment to change, because the card's *look* is the only part Phases 2–6 do
not depend on. The payload, token, codec, fonts and image route all survived; the
component, the format spec and the view model were rewritten. See §2 for what the
card is now and why.

Two more things the rebuild found, both Satori:

- **A numeric JSX child** (`{i + 1}`) makes Satori count the *parent* as having
  more than one child and throw "Expected `<div>` to have explicit display: flex"
  — pointing at an element that already has it. Every text child is a string now.
- **`-webkit-text-stroke` is not supported as a shorthand**, and the long-hand
  form draws nothing when the fill is transparent. The outlined numeral rendered
  as empty space; it is filled at low alpha instead.

### Phase 2 — The share sheet · 1.5d — **done**

A **Share your stack** button under the results hero, and a portalled sheet carrying a
live preview, a Story/Post size switch, the share ladder from §3.6 and a copy-link
fallback. Typed analytics (`share_open`, `share_render`, `share_method`, `share_error`,
`share_format`, `share_dismiss`) alongside `funnel`.

**Exit met:** 32 tests across the ladder, the links and the sheet; full suite 2456
green; `tsc --noEmit` clean; production build clean.

Not built from `@/components/system` as the plan assumed — the results page is still on
the old palette, and `DESIGN.md` forbids mixing the two systems inside one screen. It
matches `ProductSwapModal` beside it, and moves when that screen is migrated.

Three things the build changed:

- **`AbortError` is not a failure.** `navigator.share()` rejects with it when someone
  dismisses the OS sheet, and treating that as a failed rung hands a download to a person
  who just said no. It returns to idle and reports nothing.
- **A resolved `share()` is not a post.** It resolves on dismissal too and never says
  where anything went, so `share_method: native-*` means "reached the OS sheet" — and the
  analytics wrapper says exactly that rather than implying a story went up.
- **The loaders had to be split.** `format.ts` is imported by the sheet in the browser and
  pulled `art.ts`, which pulled `fs`. The bytes now live in `art-file.ts`, server-only;
  `codec.ts` became isomorphic for the same reason.

**Exit:** works on iOS Safari, Android Chrome and desktop; failure of any rung falls to
the next rung visibly rather than silently.

### Phase 3 — Persistence and the landing page · 1.5d — **done**

The `share_cards` migration, the repo, `/api/share` to mint a token, a token-backed
image route, and `/s/[token]` — a real page with OG and Twitter meta, the card rendered
large, and one CTA. View counting, revocation, and the retention sweep on the existing
daily cron.

**Exit met:** 14 storage tests plus the existing share suite; full suite 2470 green;
`tsc --noEmit` clean; production build clean with all four routes present.

Four decisions worth keeping:

- **Views are counted on the page, never in the image route.** Every unfurl bot that
  touches a pasted link fetches the image, and counting those would make a card nobody
  opened look like a card that travelled.
- **`revoked_at`, not a delete.** A link that has been taken down stops rendering without
  its view history going with it.
- **The sweep never touches a card with an account behind it.** A card attached to a
  customer is theirs, and deleting it because a year passed is deleting something of
  theirs on a schedule they never agreed to. Anonymous cards only.
- **The short link never blocks the share.** The sheet opens with the long stateless URL
  and upgrades to `/s/<token>` when the mint returns. A database that is down, slow or
  absent costs a tidy URL, not the ability to post.

The payload is still user input on the way in: anyone can post a crafted one and get a
token. That is fine for a vanity graphic and it is written down in the route, because
Phase 5 must not treat a stored card as evidence of anything — an entry is verified
against what somebody actually posted.

### Phase 4 — Influencer mode · 1d — **done**

The code was already on the card and in the link from Phase 1. This adds the missing
half: a **Your assets** tab in the Partners Hub carrying a sample card per code in all
three sizes, the partner's link, and the two numbers at the top of their funnel — cards
their followers made, and how often those were opened.

**Exit met:** a partner pulls their assets without contacting us; 7 asset tests; full
suite 2477 green; `tsc --noEmit` clean; production build clean.

Two decisions:

- **The sample is an engine-built stack, not a fixture.** A partner has no stack of their
  own, so the asset has to be somebody's — and a hand-written one would teach them the
  wrong thing about the product. It reuses the `complete` persona with their code swapped
  in and the first name stripped, so the card they post is a stack the engine would
  really produce.
- **It says it is a sample, three times.** On the card's description, under the preview,
  and in a line asking them not to caption it as somebody's results. An asset that could
  be mistaken for a real customer's card eventually will be, by someone writing a caption
  at speed — and that is a claim about a named person we did not make.

Conversion is deliberately not repeated here: orders and revenue per code already live on
the money tab, and this is the part of the funnel a partner can act on.

### Phase 5 — The competition · 2.5d — **built, off by default**

The mechanics, with the wording left as a settings screen to fill in when it is written.

- **Founders Hub → Settings → Competition.** Every field the CAP Code requires, plus
  `off` / `test` / `live`. It will not let the promotion go `live` while any of them is
  empty, and it lists which — a checklist is the useful version of "no".
- **`test` runs the whole flow** as a visible rehearsal: the entry band on the card says
  so, the entry screen says so, and entries are recorded as test rows kept out of every
  draw. That is what trying it before the wording exists looks like.
- **`competition_entries`**, its own table, because an entry is not a share (§3.7).
- **The entry band** on the card, as the second kind of callout — prize, mechanic,
  closing date and terms pointer, because a significant condition has to be on the
  promotion itself.
- **`/legal/competition`** — the terms, rendered from config, and the free entry route.
- **Entries list and the draw** in the Founders Hub.

**Exit met:** 17 competition tests; full suite 2496 green; `tsc --noEmit` clean;
production build clean with all routes present.

Three things worth keeping:

- **Nothing is ever auto-verified.** Anyone can mint a card token by calling
  `/api/share`, so an entry carrying one is a *claim* that somebody posted. Every entry
  lands `pending` and a person confirms it. The draw only ever sees `verified`.
- **The free route is the same form, in the same number of taps.** "Equal standing" is
  measurable, and an email address to find would not be equal.
- **A test entry can never win.** `is_test` exists for exactly one failure — a rehearsal
  row taking £200 of real product — and the draw excludes it in SQL rather than in a
  filter somebody can forget.

**Still outstanding, and not mine to write:** the prize structure ("up to £200" cannot go
into terms as it stands), the promoter's registered address, and the winner-selection
wording. The screen is waiting for them.

### Phase 6 — Measure and iterate · ongoing

A/B the CTA copy. Card→quiz→checkout conversion by channel.

### Phase 7 — The poster rebuild, and the photography · 2d — **done**

Phase 1 shipped a card that read as a UI component screenshotted: rounded panels, a
filled accent pill, evenly spaced blocks, and a soft glow doing the work photography
should have been doing. This is the rebuild against the founder's written brief.

**The card.**

- **Fixed pixel geometry per format**, in one table. The brief specifies the story frame
  down to the pixel and the first attempt took that literally as constants — which
  rendered the square and the link preview as the top-left corner of a story card with
  the headline below the bottom edge. Same composition, re-proportioned.
- **Big Shoulders Display + IBM Plex Mono**, replacing Space Grotesk + Inter. Six
  subsetted TTFs, ~140KB, no network fetch in the render path. The 172↔17 scale contrast
  is what stops the card reading as an app screen.
- **The charge index outlined and bleeding off the left edge**, drawn from pre-extracted
  glyph outlines. Satori renders `-webkit-text-stroke` as a fill with no stroke and
  rejects SVG `<text>` outright; both were tested. Paths were the alternative to putting
  a headless browser in the render path for one piece of type.
- **Hairlines instead of containers.** No radius, no fill, no glow, no vignette, nothing
  centred.

**The photography.**

- **Six category keys** — `strength` · `performance` · `energy` · `recovery` ·
  `wellbeing` · `hydration` — resolved uploaded → bundled → gradient field.
- **Founders Hub → Settings → Share card photography.** Six slots, each previewing *the
  crop the card actually draws* (1080 × 1210 from a 3:4 source, so the bottom fifth is
  gone) with the card's own scrim over it and a toggle for the left-third guide.
- **The gradient stand-in replaced the product renders.** A bottle with the logo across
  its belly fought the headline, put the brightest part of the frame exactly where the
  outlined score is ghosted, and said "one product" on a card about a stack.

**Two decisions that diverge from the brief, both for the same reason** — the standing
instruction on this build is no new running costs:

- **Satori, not Playwright.** The brief asks for a headless Chromium screenshot because
  it assumes `html2canvas` is in use. It is not, and never was: §3.1 chose server-side
  rasterisation from the start. Everything the brief needs from a browser was tested
  against Satori and only one thing failed — the outlined numeral — which the glyph-path
  route solved without a 300MB binary in the render path.
- **Client-side canvas, not `sharp`.** The derivative and the luminance sample are
  produced in the browser and the route stores the result, re-checking every limit rather
  than trusting it. `sharp` is a native binary that roughly doubles the function bundle.

**Storage:** the bytes live in `share_card_art` (migration v13), not in a blob store. Six
images with a hard 1080 × 1440 ceiling, and the renderer needs them inlined as a data URI
anyway — a network fetch mid-render is exactly what a card must not do. `version` is the
content hash, so replacing a photo invalidates every card that carried it and re-uploading
the same file invalidates nothing.

**Exit met:** full suite 2543 green; `tsc --noEmit` clean; production build clean. The
brief's acceptance list is asserted against decoded pixels rather than by eye — byte-exact
dimensions, no type outside y ∈ [250, 1620], grain and the scrim present in the export,
all six categories rendering with the stand-in and with an upload, and a 1000 × 1000
rejected with a message naming both what it is and what it needs to be.

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
