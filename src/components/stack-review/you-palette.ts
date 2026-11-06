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
  /** The top and bottom of a cyan fill: a button, a service's mark. Grounds only, never words. */
  accentBright: '#5CE4FF',
  accentDeep: '#00A8D4',
  accentInk: '#006E8A',
  /** A checkout that stopped: about 6:1 on the card and the page. */
  danger: '#B42318',
  hairline: 'rgba(10,10,10,0.08)',
  /**
   * The hub, drawn on the panel as the dark screen it is: its ground, a card
   * on it, and three inks, each clearing AA on both (the test checks). The
   * brand cyan carries words here: on the dark it is about 10:1.
   */
  night: '#0B0F14',
  nightCard: '#161C24',
  nightInk: '#F4F6FB',
  nightInk2: '#C3C8D2',
  nightInk3: '#9EA5B1',
} as const
