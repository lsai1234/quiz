import localFont from 'next/font/local'
import { IBM_Plex_Sans } from 'next/font/google'

/**
 * The consult's faces (build S2).
 *
 * Two faces. Big Shoulders Display for the question is the share card's own
 * file, vendored in `lib/share-card/fonts`, so the consult and the card it
 * may end on share their headline type. IBM Plex Sans for everything else,
 * labels included, is self-hosted by `next/font` at build time. (A third,
 * Plex Mono for labels, was dropped: too many faces on one question.)
 *
 * Declared here rather than in the root layout so they are only preloaded on
 * the routes that render the consult. Each one sets a `--amp-face-*` variable,
 * which `consult.css` puts at the front of its font stacks.
 */

const display = localFont({
  src: [
    { path: '../../lib/share-card/fonts/BigShouldersDisplay-600.ttf', weight: '600' },
    { path: '../../lib/share-card/fonts/BigShouldersDisplay-800.ttf', weight: '800' },
  ],
  variable: '--amp-face-display',
  display: 'swap',
})

const body = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--amp-face-body',
  display: 'swap',
})

/** Class names that define the two face variables. Put them on the consult root. */
export const consultFontVars = [display.variable, body.variable].join(' ')
