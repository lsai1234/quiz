import localFont from 'next/font/local'
import { IBM_Plex_Sans } from 'next/font/google'

/**
 * The consult's faces (build S2).
 *
 * Big Shoulders Display for the question and IBM Plex Mono for the data line
 * are the share card's own files, vendored in `lib/share-card/fonts`, so the
 * consult and the card it may end on are set in the same type. IBM Plex Sans
 * for body copy is self-hosted by `next/font` at build time.
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

const mono = localFont({
  src: [
    { path: '../../lib/share-card/fonts/IBMPlexMono-400.ttf', weight: '400' },
    { path: '../../lib/share-card/fonts/IBMPlexMono-500.ttf', weight: '500' },
  ],
  variable: '--amp-face-mono',
  display: 'swap',
})

const body = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--amp-face-body',
  display: 'swap',
})

/** Class names that define the three face variables. Put them on the consult root. */
export const consultFontVars = [display.variable, mono.variable, body.variable].join(' ')
