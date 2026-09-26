# Amp Consult: audit against the build plan

A second pass over *Amp Consult Build Plan v3* (18 pages), build by build, after
the founder review found the AI and audio "not working". Each gap below is
either fixed in this pass (✅), or needs something only the business can
provide (⏳).

## Why the AI and audio looked absent

One cause hid most of it:

- The AI layer only switched on through a hub toggle (**Settings → Quiz → Amp's
  words**) that defaults to **off**. With it off, the consult shows no AI at
  all: no "Tell Amp more", no AI wording, no shelf scan, no tracker read.
- Voice lives *inside* "Tell Amp more", so with the AI off there was no mic
  anywhere. Read aloud only runs in comfort mode ("Bigger text"), which is
  easy to never turn on.
- A second, subtler cause: after three slow or missed AI *wording* calls, the
  consult treated the whole AI layer as down and hid "Tell Amp more", voice
  and uploads too. With a real model a few replies over the 1.5s budget would
  have been enough to make every AI feature vanish mid-consult.
- The AI wording was cut off at 1.4 seconds. A real structured-output call
  often takes 1–2.5s, so most real replies would have been thrown away and
  the scripted words shown instead. The wording is fetched while the person
  is still on the screen before, so it now waits up to 4.5s; 1.5s stays as
  the target the hub reports against.
- None of it had run against a real (or even a realistic fake) OpenAI: the
  build environment has no key, and OpenAI is blocked from it.

## The gap list

### A. Make the AI layer visible and working

| # | Gap | Plan ref | Status |
|---|-----|----------|--------|
| A1 | The founder preview (`/quizv2`) runs with the AI layer on whenever the server has an OpenAI key, whatever the public toggle says | V1–V7 | ✅ |
| A2 | A founder preview panel on `/quizv2` that says what's live and why (AI key, voice, read aloud, uploads, Rive) and where to find each | — | ✅ |
| A3 | The first scene (goals) is never AI-worded: copy was only prefetched for the *next* scene, and goals has no scene before it. Its AI option labels therefore never showed | V2 | ✅ |
| A4 | Slow AI wording switched off every AI feature. The lost-signal breaker now only affects wording; "Tell Amp more", voice and uploads have their own fallbacks and stay | V6 | ✅ |
| A5 | End-to-end run of every AI feature through the real routes, against a local stand-in for OpenAI (the SDK's `OPENAI_BASE_URL`), in a real browser | V1–V7, U1–U3 | ✅ |

### B. Audio

| # | Gap | Plan ref | Status |
|---|-----|----------|--------|
| B1 | Voice entry is hard to find: "Tell Amp more" now says "type or talk" with a mic | U3 | ✅ |
| B2 | iPhone: the waveform's audio context starts suspended outside a tap; resume it. Stop the long-press callout on the mic | U3 | ✅ |
| B3 | Transcription model: if the pinned snapshot isn't enabled on the account, fall back to `whisper-1` rather than failing every clip | U3 | ✅ |
| B4 | iPhone: speech synthesis must be started from a tap. Read aloud is now primed on the tap that turns comfort mode on, so the first question is actually spoken | U4 | ✅ |

### C. Oversight (plan p.11, "Guardrail layers → Oversight")

| # | Gap | Plan ref | Status |
|---|-----|----------|--------|
| C1 | AI audit log: every AI call recorded with route, scene, model, time taken and outcome. No personal text, images or audio. Kept 30 days | V5 | ✅ |
| C2 | Consult viewer in the hub: saved consults (goals, three tiers, exclusions, pharmacist flag), plus delete on request | H7, GDPR | ✅ |

### D. Knowledge base

| # | Gap | Plan ref | Status |
|---|-----|----------|--------|
| D1 | Products tagged with claim IDs from the GB Nutrition and Health Claims register, carried in the handoff payload, so any claim shown is register wording | H4, p.11 | ✅ (wording needs checking ⏳) |
| D2 | "What's this?" only covered goals, intensity, daylight, the circuit check and comfort mode. Extended to the other options people ask about (oily fish, energy drinks, pre-workout, sleep quality, stiff joints) | V7 | ✅ |

### E. Needs something only you can provide

| # | Item | Plan ref | Status |
|---|------|----------|--------|
| E1 | `OPENAI_API_KEY` set on the live site, then a real run to confirm the 1.5s budget and the wording quality | V1 | ⏳ |
| E2 | The animated Amp artwork (`amp.riv`) made in the Rive editor to the contract in `src/lib/consult/ampRive.ts`. The code, lazy loading and crossfade are done | U5 | ⏳ |
| E3 | 30 real shelf photos (and tracker screenshots) with an `expected.json`, for `npm run eval:scan` | U1, U2 | ⏳ |
| E4 | Pharmacist or nutritionist check of the circuit check and exclusion lists, and of the claim wording in D1 | p.11, p.18 | ⏳ |
| E5 | DPIA, consent wording and OpenAI data processing terms, including photo uploads and speech sent for transcription | p.11, p.18 | ⏳ |
| E6 | The A/B decision: when the consult goes public, what share, and which metric decides | H11, p.18 | ⏳ |

## How to see and check the AI

- **On the live site:** set `OPENAI_API_KEY` in the environment and redeploy.
  Open `/quizv2` signed in as a founder. The strip at the top says
  *Founder preview · AI on*; **What's on** lists every feature and where it
  is, and **Test the AI now** makes a real call and shows OpenAI's answer
  (or its error, such as a wrong key) and how long it took.
- **The AI log:** Founder hub → Monitoring → *Amp Consult: is the AI
  working?* Calls per feature, how many worked, fell back or were held back,
  and median and slowest times. Finished consults are listed under it, with
  delete on request.
- **Without a key:** `npm run fake-openai` starts a stand-in for OpenAI; run
  the app with `OPENAI_API_KEY=fake OPENAI_BASE_URL=http://localhost:4010/v1`
  and every AI feature works against it. `npm run check:consult-ai` then
  drives all of them in a browser and reports what each did. The same script
  runs against a real deployment with `--url`, `--email` and `--password`.

Result of that run, against the stand-in: the founder test passed; the first
scene and every later one were AI-worded, with Amp's reaction line and the
goal sub-lines; "Tell Amp more" turned typed text into cards; hold-to-talk
recorded with a live waveform and put the transcript in the box; the tracker
read pre-filled the training week and the sleep window; "What's this?"
answered a follow-up; the shelf scan added three items; comfort mode read the
question aloud; the consult finished and appeared in the hub, and the hub's
AI log counted every call. No console errors.

### Checked and already in place

Level 1 (S1–S11), level 2 (C1–C14) and level 3 (H1–H12) were re-checked against
the plan's "done when" lines and stand as built. Two deliberate differences from
the plan's *UI stack* suggestions (p.9), which are recommendations rather than
builds: animation uses CSS with shared presets instead of the Motion library,
and the controls are built in-house to the ARIA patterns (tested with axe and a
keyboard-only run) instead of Radix. The workshop is the in-app page at
`/styleguide/consult` rather than Ladle or Storybook.
