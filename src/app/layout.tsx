import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppProvider } from '@/lib/store'

export const metadata: Metadata = {
  title: 'Content Pipeline Studio',
  description: 'CHRGD mobile-first TikTok carousel idea builder',
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
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-950 text-white antialiased">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  )
}
