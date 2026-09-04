import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Inter, Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { PortalSync } from '@/components/portal/PortalSync'
import { ErrorReporter } from '@/components/monitoring/ErrorReporter'
import { ViewportHeight, VIEWPORT_HEIGHT_SNIPPET } from '@/components/ViewportHeight'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

/*
 * The storefront faces. Self-hosted by `next/font` — the files are downloaded
 * at build time and served from this origin, so there is no request to a font
 * CDN, no render-blocking third party and no layout shift from a late swap.
 *
 * Four families ship because the refactor is scoped to the storefront: Space
 * Grotesk and Inter still dress the quiz and the hubs. If the storefront look
 * is adopted for those too, those two go and this drops back to two.
 */
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CHRGD | Build Your Stack',
  description: 'Discover your personalised supplement stack in 90 seconds.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* The inline script below writes to this element before React hydrates, so
       React is told to take the DOM's word for it rather than treat the extra
       style property as a mismatch. */
    <html lang="en" className={`h-full ${spaceGrotesk.variable} ${inter.variable} ${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sizes the app shells before the first paint — see ViewportHeight. */}
        <script dangerouslySetInnerHTML={{ __html: VIEWPORT_HEIGHT_SNIPPET }} />
      </head>
      <body className="min-h-full antialiased"><ViewportHeight /><PortalSync /><ErrorReporter />{children}</body>
    </html>
  )
}
