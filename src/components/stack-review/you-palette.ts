/**
 * The You scene's colours: dark ink on the light poster panel.
 *
 * The rest of the results page is dark and reads its colours from tokens. The
 * You scene is the one light panel (`#F5F5F0` page, white card), so it carries
 * its own small set, as Act4Reveal always has. Every ink here is solid, not an
 * alpha over white, so its contrast is a fixed number and the test can check it
 * (`__tests__/you-scene.test.tsx`): each clears AA (4.5:1) on both the card and
 * the page, at the 10–13px sizes this panel uses.
 *
 * `ACCENT` is the brand cyan. On white it measures about 1.8:1, so it is used
 * for rules, glows and icon grounds only, never for words. `ACCENT_INK` is the
 * cyan dark enough to carry words.
 */
export const YOU_PALETTE = {
  page: '#F5F5F0',
  card: '#FFFFFF',
  /** Headings and the "You said ..." lines. */
  ink: '#0A0A0A',
  /** Product names, claims, check lines. */
  ink2: '#3F3F46',
  /** Labels and counts. The quietest words on the panel. */
  ink3: '#5E5E66',
  accent: '#00D4FF',
  accentInk: '#006E8A',
  hairline: 'rgba(10,10,10,0.08)',
} as const
