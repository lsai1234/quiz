# Sharing a card from the read: proposal

Amp Consult and offer plan, Phase 8, item 2: "Propose which patterns can appear
on a shared card (e.g. leave out the weight-loss ones)", and "shared images and
links carry no health information". What's built follows this proposal; the
allowlist is one list (`src/lib/consult/shareable.ts`) if you want it changed.

## 1. Which patterns may appear on a shared card

A shared card is public and lasts. The test used: would someone reading it
learn something about the person's body or health they might not want said in
public? A lifestyle or training habit is fine; a symptom, a body changing with
age, or anything about weight or eating too little isn't.

| Pattern | On a shared card | Why |
| --- | --- | --- |
| The 3pm crash | Yes | An energy habit most people share. |
| Wired and tired | Yes | Caffeine and late nights. |
| Short on sleep | Yes | Not enough hours, not a sleep problem. |
| Protein gap | Yes | What's on the plate. |
| Not recovering | Yes | Training load. |
| Caffeine to train | Yes | A training habit. |
| Sweat it out | Yes | Training in the heat. |
| Plant-powered gap | Yes | A diet they chose; says nothing about health. |
| Indoor life | Yes | Desk, commute, daylight. |
| Weekend warrior | Yes | Training pattern. |
| **Eating less, running low** | **No** | Weight loss (already never named a result). |
| **Running on empty** | **No** | Eating too little for what they do: close to disordered eating. |
| **Stiff starter** | **No** | Joints and stiffness, from the body map. |
| **Keeping strong** | **No** | Stairs and jars getting harder: a body changing with age. |
| **Staying sharp** | **No** | Memory slipping: cognitive change. |
| **Broken nights** | **No** | Waking in the small hours: can point to menopause or insomnia. |

The same list now decides the result's name (`readIdentity`), because that
name also goes on the stack's share card. Someone whose top pattern is on the
"No" list gets the next one that's on the "Yes" list, or the goal-based stack
name, as people with no pattern found already do. On the results page that's
the only visible change.

## 2. What each card carries onto the image

| Card | Shared? | On the image | Never on it |
| --- | --- | --- | --- |
| Your day | Yes | The ring's shape: sleep arc, last cup or cup count, training time or days, daylight glow, energy curve. **No times and no words.** | Times, their answers in words. |
| What I spotted | When a "Yes" pattern was found | That pattern's name and line, from our library. | Their answers ("You said…"), any "No" pattern. |
| Joining the dots | When a "Yes" pattern was found | The constellation's dots, the names of the "Yes" patterns they confirmed, the "Narrowing it down" counts. | Unconfirmed or "No" pattern names, ruled-out names. |
| Try this week | **No** | – | A fix with their bedtime in it, under our name, reads as health advice. |
| Start here | Yes | Product names: the hero and up to five classics, "+n more". | Claims, prices, the gift and its terms. |
| Share | (unchanged) | The existing stack card and share sheet, with the giveaway's share bonus as now. | – |

Every card also has our eyebrow ("Amp Consult · my read") and the footer
"Find yours: the Amp Consult at getchrgd.co.uk". The share sheet's text is
"My read from the Amp Consult at CHRGD", and its link is the site's front
door. A card's own link (challenge links) is item 5, with its storage proposed
first.

### A crafted link can't add words

The image route (`/api/share/story/image`) draws only from a payload it checks
field by field (`decodeStoryShare`): pattern ids that are on the "Yes" list
(their words come from our library, not the link), product names that are
plain names, numbers in range. Anything else is a 400. Tested, including a
crafted "Cures anxiety!" product and a `broken-nights` pattern.

## 3. Sharing, and where it was tested

The stack card's own ladder (`shareCard`): the phone's share sheet with the
image where the browser can share files (one tap to Instagram Stories), else
a download, else the image full size to press and hold. Each card share is
counted (which card, which rung), never its content.

- **Tested here:** Chromium (the download rung end to end, the image route,
  the 1080×1920 raster with all type inside Instagram's safe band, y 250–1620).
- **Not testable here:** iOS Safari, Android Chrome's share sheet and
  Instagram's in-app browser need real phones. This environment has no WebKit
  or device. The ladder is the one the stack card already uses on those
  browsers, and the press-and-hold rung exists for iOS Safari. **Please try
  it on an iPhone (Safari and from an Instagram DM link) and an Android phone
  before it goes to customers.**

## To decide

1. The allowlist: as proposed, or move a pattern either way.
2. "Your day" without times (as built), or with bedtime and wake time printed.
