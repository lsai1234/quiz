import { AddProducts } from '@/components/portal/add/AddProducts'

/**
 * Add products — the guided way in from PowerBody. It replaced the PowerBody
 * tab (whose old address redirects here); see `AddProducts` for what moved
 * where and why.
 *
 * A server page around one client component, and nothing read here: every
 * answer on this screen comes from PowerBody at the moment it is asked for —
 * which supplier answers, whether the index is built, what a code is — so the
 * component asks for each itself, and says so on screen while it waits, rather
 * than this page holding the whole screen back for the slowest of them.
 */
export const dynamic = 'force-dynamic'

export default function AddProductsPage() {
  return <AddProducts />
}
