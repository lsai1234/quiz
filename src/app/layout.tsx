import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import './globals.css'
import { PortalSync } from '@/components/portal/PortalSync'
import { ErrorReporter } from '@/components/monitoring/ErrorReporter'
import { StorageNotice } from '@/components/legal/StorageNotice'

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
    <html lang="en" className={`h-full ${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="min-h-full antialiased"><PortalSync /><ErrorReporter />{children}<StorageNotice /></body>
    </html>
  )
}
