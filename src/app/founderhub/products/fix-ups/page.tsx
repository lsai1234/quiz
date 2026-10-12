import { FixUps } from '@/components/portal/fixups/FixUps'

/**
 * Fix-ups — the passes that work across the whole catalogue: tidy descriptions,
 * repair flavour names, fill per-SKU prices from PowerBody, short names, tags,
 * and the supplier check. They used to share the PowerBody tab with adding
 * products; see `FixUps` for why each is now one closed card with a count.
 */
export default function FixUpsPage() {
  return <FixUps />
}
