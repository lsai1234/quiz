# Haptics on iPhone: investigated, not shipped

Amp Consult and offer plan, Phase 7.2: "Android haptics as now. Investigate
whether iPhone haptics can be done reliably, and don't ship them if not."

**Decision: not shipped.** Android keeps its ticks (`haptic()` in
`src/lib/consult/motion.ts`, via `navigator.vibrate`). iPhone stays silent.

## What exists on iOS

- **The Vibration API (`navigator.vibrate`) isn't there.** Safari on iOS has
  never shipped it, and every iOS browser is Safari underneath (WebKit is
  required on iOS), so Chrome or Firefox on an iPhone can't add it either.
  `haptic()` already checks for it and does nothing without it.
- **The only route is a side effect.** Since Safari 18 (iOS 18), a native
  switch (`<input type="checkbox" switch>`) gives the system's toggle haptic
  when the person flips it. Some libraries click a hidden switch from script,
  inside a tap handler, to borrow that tick.

## Why that isn't reliable enough

1. **It's undocumented.** Apple documents the switch control, not the haptic
   as something a page can trigger. A WebKit change can remove or limit it
   without notice, and pages that lean on it would go quiet without anyone
   noticing.
2. **It only fires inside a user gesture**, and only for a click the browser
   counts as the person's. Our ticks that follow a drag (dial steps, the sleep
   window), a timer (the charge-up) or an animation finishing would not fire.
   So the haptics would land on some answers and not others, which reads as
   broken rather than missing.
3. **There's one feel.** It's the switch's tick, every time. The Android
   patterns (a tick, a double for a day set, the charge-up's longer buzz)
   can't be matched.
4. **It needs a hidden form control** in the page, clicked from script. That's
   an accessibility smell: a screen reader can find it, and it changes state
   nobody asked for.
5. **I couldn't test it on a device here.** This container has no iPhone and
   no iOS simulator. Shipping something whose only proof is other people's
   reports, against points 1–4, isn't "reliable".

## What would change the decision

- Apple shipping the Vibration API, or a documented haptics API, in Safari
  (watch the WebKit feature status page). `haptic()` would pick up
  `navigator.vibrate` with no change.
- A real-device test across iOS versions showing the switch route firing from
  our gestures, plus a decision that a single tick on taps only is worth the
  hidden control. That would be a separate, explicit opt-in.
