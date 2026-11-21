import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Inter, Geist_Mono } from 'next/font/google'
import './globals.css'
import { PortalSync } from '@/components/portal/PortalSync'
import { ErrorReporter } from '@/components/monitoring/ErrorReporter'
import { MetaPixel } from '@/components/MetaPixel'
import { PageViews } from '@/components/analytics/PageViews'
import { RealUserMonitoring } from '@/components/analytics/RealUserMonitoring'
import { ViewportHeight, VIEWPORT_HEIGHT_SNIPPET } from '@/components/ViewportHeight'
import { TestViewBanner } from '@/components/TestViewBanner'

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
 * Geist Mono stays for the three screens outside the shop that set figures in
 * it (the giveaway share card, the last-chance offer and the checkout promo).
 * The storefront no longer uses Geist at all: it is set in the quiz's own two
 * faces, Space Grotesk and Inter, so Geist Sans is no longer loaded.
 */
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
    <html lang="en" className={`h-full ${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sizes the app shells before the first paint — see ViewportHeight. */}
        <script dangerouslySetInnerHTML={{ __html: VIEWPORT_HEIGHT_SNIPPET }} />
      </head>
      <body className="min-h-full antialiased"><ViewportHeight /><PortalSync /><ErrorReporter /><MetaPixel /><PageViews /><RealUserMonitoring />{children}<TestViewBanner /></body>
    </html>
  )
}
