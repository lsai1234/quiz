import Link from 'next/link'
import { CHRGDLogo } from '@/components/brand/CHRGDLogo'

/**
 * The storefront's footer: the brand, the places, and the legal pages.
 *
 * Only links to pages that exist. No invented help centre, no company line
 * nobody has confirmed — a footer that promises a "Contact" page that 404s is
 * worse than a short one.
 */
export function ShopFooter() {
  return (
    <footer className="sf-footer">
      <div className="sf-wrap sf-footer-in">
        <div className="sf-footer-brand">
          <Link href="/" aria-label="getCHRGD home" data-interactive>
            <CHRGDLogo markSize={22} wordClassName="text-[19px]" />
          </Link>
          <p>Supplements chosen around your week, delivered across the UK.</p>
        </div>
        <nav className="sf-footer-col" aria-label="Shop">
          <h2>Shop</h2>
          <ul>
            <li><Link href="/">All products</Link></li>
            <li><Link href="/#shop-cat-bundles">Session stacks</Link></li>
            <li><Link href="/quiz">The quiz</Link></li>
          </ul>
        </nav>
        <nav className="sf-footer-col" aria-label="Legal">
          <h2>Legal</h2>
          <ul>
            <li><Link href="/legal/terms">Terms</Link></li>
            <li><Link href="/legal/privacy">Privacy</Link></li>
            <li><Link href="/legal/disclaimer">Disclaimer</Link></li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
