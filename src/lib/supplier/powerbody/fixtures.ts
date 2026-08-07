/**
 * Mock PowerBody catalogue.
 *
 * A representative slice of the kind of feed PowerBody's API returns — real
 * supplement brands across the main categories, with wholesale cost, RRP and
 * stock. A few items are deliberately out of stock (stock: 0) so the "scan &
 * add" page and the later daily stock-check / stock-alerts journey have
 * something to react to. Wholesale sits around 55–65% of RRP for realistic
 * margins. This is the ONLY file that goes away when the live API is wired in.
 */
import type { SupplierProduct } from '../types'

const UPDATED = '2026-07-20T09:00:00.000Z'

type Seed = Omit<
  SupplierProduct,
  'currency' | 'inStock' | 'updatedAt' | 'weightGrams' | 'vatRate' | 'detailed'
> & {
  /** Override when the name doesn't state a size (capsules, multipacks). */
  weightGrams?: number
}

/**
 * Shipped weight, parsed from the pack size in the product name.
 *
 * PowerBody charge delivery by weight band, so the mock feed has to carry a
 * believable weight or the margin model is exercising a code path the real feed
 * never will. Parsing the name is exactly what you'd do to backfill weights from
 * a feed that omits them — sizes are in the title far more reliably than in any
 * field — and the packaging allowance is why a 1kg tub ships at ~1.15kg.
 */
const PACKAGING_GRAMS = 150

function weightFromName(name: string): number {
  const kg = name.match(/([\d.]+)\s*kg/i)
  if (kg) return Math.round(parseFloat(kg[1]) * 1000) + PACKAGING_GRAMS

  // A multipack of drinks: 330ml × 12, roughly a gram per ml plus the can.
  const pack = name.match(/([\d.]+)\s*ml.*?\((\d+)\s*pack\)/i)
  if (pack) return Math.round(parseFloat(pack[1]) * parseInt(pack[2], 10) * 1.05) + PACKAGING_GRAMS

  const g = name.match(/([\d.]+)\s*g\b/i)
  if (g) return Math.round(parseFloat(g[1])) + PACKAGING_GRAMS

  // Capsules and tablets: the bottle dominates, not the contents.
  const caps = name.match(/\((\d+)\s*(?:caps|tabs|capsules|tablets)\)/i)
  if (caps) return Math.round(parseInt(caps[1], 10) * 0.9) + PACKAGING_GRAMS

  return 250 + PACKAGING_GRAMS
}

const SEED: Seed[] = [
  // ── Protein ──
  { sku: 'ON-GOLD-WHEY-2270', name: 'Gold Standard 100% Whey 2.27kg', brand: 'Optimum Nutrition', category: 'Protein', description: 'Whey protein blend with 24g protein per serving, fast-absorbing.', imageUrl: null, wholesalePrice: 38.5, rrp: 64.99, stock: 120, barcode: '5060469981234', flavours: ['Double Rich Chocolate', 'Vanilla Ice Cream', 'Strawberry'], servings: 71 },
  { sku: 'APP-ISO-XP-1000', name: 'ISO-XP Whey Isolate 1kg', brand: 'Applied Nutrition', category: 'Protein', description: 'Ultra-pure whey isolate, 27g protein, under 1g sugar.', imageUrl: null, wholesalePrice: 22.0, rrp: 37.99, stock: 64, barcode: '5060398121011', flavours: ['Choc Honeycomb', 'Vanilla', 'Salted Caramel'], servings: 40 },
  { sku: 'PHD-DIET-WHEY-1000', name: 'Diet Whey 1kg', brand: 'PhD Nutrition', category: 'Protein', description: 'High-protein, lower-calorie whey blend with added CLA.', imageUrl: null, wholesalePrice: 17.5, rrp: 29.99, stock: 0, barcode: '5060096681234', flavours: ['Chocolate Peanut', 'Cookies & Cream'], servings: 40 },
  { sku: 'WAR-CLEAR-500', name: 'Clear Whey Isolate 500g', brand: 'Warrior', category: 'Protein', description: 'Refreshing juice-style clear whey, 20g protein per serve.', imageUrl: null, wholesalePrice: 15.0, rrp: 26.99, stock: 88, barcode: '5060424706789', flavours: ['Cherry Bakewell', 'Mango', 'Lemonade'], servings: 20 },
  { sku: 'VEG-PLANT-1000', name: 'Vegan Protein Blend 1kg', brand: 'Vivo Life', category: 'Protein', description: 'Pea and hemp plant protein, 22g protein, fully vegan.', imageUrl: null, wholesalePrice: 24.0, rrp: 39.99, stock: 41, barcode: '506052340123', flavours: ['Cacao', 'Vanilla'], servings: 25 },

  // ── Creatine / performance ──
  { sku: 'ON-CREA-634', name: 'Micronised Creatine Powder 634g', brand: 'Optimum Nutrition', category: 'Creatine', description: 'Pure micronised creatine monohydrate, 3g per serving.', imageUrl: null, wholesalePrice: 16.0, rrp: 27.99, stock: 210, barcode: '5060469982222', flavours: [], servings: 200 },
  { sku: 'APP-CREA-250', name: 'Creatine Monohydrate 250g', brand: 'Applied Nutrition', category: 'Creatine', description: 'Micronised creatine monohydrate, 5g per serving.', imageUrl: null, wholesalePrice: 6.5, rrp: 12.99, stock: 150, barcode: '5060398122222', flavours: [], servings: 50 },
  { sku: 'BUL-BETA-500', name: 'Beta-Alanine 500g', brand: 'Bulk', category: 'Amino Acids', description: 'Pure beta-alanine for training endurance, 2g per serving.', imageUrl: null, wholesalePrice: 9.0, rrp: 17.99, stock: 30, barcode: '5060312930012', flavours: [], servings: 250 },

  // ── Pre-workout / energy ──
  { sku: 'APP-ABE-315', name: 'ABE All Black Everything Pre-Workout 315g', brand: 'Applied Nutrition', category: 'Pre-Workout', description: 'Caffeine, citrulline and beta-alanine pre-workout, 200mg caffeine.', imageUrl: null, wholesalePrice: 14.5, rrp: 26.99, stock: 96, barcode: '5060398123333', flavours: ['Cherry Cola', 'Blue Razz', 'Tropical'], servings: 30 },
  { sku: 'GRE-ENERGY-390', name: '.44 Caliber Pre-Workout 390g', brand: 'Grenade', category: 'Pre-Workout', description: 'High-stim pre-workout with 275mg caffeine per serving.', imageUrl: null, wholesalePrice: 16.0, rrp: 29.99, stock: 0, barcode: '5060217011111', flavours: ['Fruit Punch', 'Killa Cola'], servings: 30 },
  { sku: 'PBD-PUMP-400', name: 'Stim-Free Pump Pre-Workout 400g', brand: 'PBD', category: 'Pre-Workout', description: 'Caffeine-free pump formula with citrulline and glycerol.', imageUrl: null, wholesalePrice: 13.0, rrp: 24.99, stock: 52, barcode: '5060424701234', flavours: ['Watermelon', 'Green Apple'], servings: 30 },

  // ── Aminos / hydration / recovery ──
  { sku: 'APP-EAA-450', name: 'Amino-Hydrate EAA 450g', brand: 'Applied Nutrition', category: 'Amino Acids', description: 'Full-spectrum EAAs with electrolytes for intra-workout.', imageUrl: null, wholesalePrice: 15.0, rrp: 27.99, stock: 73, barcode: '5060398124444', flavours: ['Icy Blue Razz', 'Fruit Burst'], servings: 30 },
  { sku: 'SIS-HYDRO-20', name: 'GO Hydro Electrolyte Tablets (20)', brand: 'SiS', category: 'Hydration', description: 'Effervescent electrolyte tablets, zero sugar.', imageUrl: null, wholesalePrice: 3.2, rrp: 6.49, stock: 300, barcode: '5025324003333', flavours: ['Lemon', 'Berry'], servings: 20 },
  { sku: 'PBD-COLL-300', name: 'Collagen Peptides 300g', brand: 'PBD', category: 'Health & Wellbeing', description: 'Hydrolysed bovine collagen peptides for joints and skin.', imageUrl: null, wholesalePrice: 11.0, rrp: 21.99, stock: 45, barcode: '5060424702345', flavours: ['Unflavoured'], servings: 30 },

  // ── Vitamins / health ──
  { sku: 'NOW-OMEGA-200', name: 'Omega-3 Fish Oil 1000mg (200 caps)', brand: 'NOW Foods', category: 'Omega & Fish Oil', description: 'EPA/DHA fish oil softgels for everyday heart and brain health.', imageUrl: null, wholesalePrice: 8.5, rrp: 16.99, stock: 180, barcode: '733739016652', flavours: [], servings: 100 },
  { sku: 'PBD-VITD-120', name: 'Vitamin D3 4000iu (120 caps)', brand: 'PBD', category: 'Vitamins & Minerals', description: 'High-strength vitamin D3 for immunity and bone health.', imageUrl: null, wholesalePrice: 4.0, rrp: 9.99, stock: 140, barcode: '5060424703456', flavours: [], servings: 120 },
  { sku: 'PBD-MULTI-90', name: 'Daily Multivitamin (90 tablets)', brand: 'PBD', category: 'Vitamins & Minerals', description: 'Complete multivitamin and mineral complex, one a day.', imageUrl: null, wholesalePrice: 6.0, rrp: 12.99, stock: 110, barcode: '5060424704567', flavours: [], servings: 90 },
  { sku: 'NOW-MAG-180', name: 'Magnesium Glycinate (180 caps)', brand: 'NOW Foods', category: 'Vitamins & Minerals', description: 'Highly absorbable magnesium glycinate for sleep and muscle relaxation.', imageUrl: null, wholesalePrice: 9.5, rrp: 18.99, stock: 0, barcode: '733739012345', flavours: [], servings: 90 },
  { sku: 'PBD-VITC-250', name: 'Vitamin C 1000mg (250 tablets)', brand: 'PBD', category: 'Vitamins & Minerals', description: 'Vitamin C with rosehip for everyday immune support.', imageUrl: null, wholesalePrice: 5.0, rrp: 10.99, stock: 260, barcode: '5060424705678', flavours: [], servings: 250 },

  // ── Gut / greens / adaptogens ──
  { sku: 'BUL-GREENS-500', name: 'Complete Greens Powder 500g', brand: 'Bulk', category: 'Greens', description: 'Greens blend with spirulina, chlorella and wheatgrass.', imageUrl: null, wholesalePrice: 12.0, rrp: 22.99, stock: 58, barcode: '5060312931234', flavours: ['Original', 'Berry'], servings: 50 },
  { sku: 'OPT-PROBIO-30', name: 'Bio-Cultures Probiotic (30 caps)', brand: 'Optibac', category: 'Probiotics', description: '5 billion live cultures per capsule for gut health.', imageUrl: null, wholesalePrice: 7.0, rrp: 13.99, stock: 92, barcode: '5060086610123', flavours: [], servings: 30 },
  { sku: 'PBD-ASH-120', name: 'KSM-66 Ashwagandha 600mg (120 caps)', brand: 'PBD', category: 'Health & Wellbeing', description: 'KSM-66 ashwagandha, traditionally used to help the body adapt to stress.', imageUrl: null, wholesalePrice: 8.0, rrp: 16.99, stock: 47, barcode: '5060424706789', flavours: [], servings: 60 },

  // ── Ready-to-drink (LQD-eligible) ──
  { sku: 'GRE-CARB-KILLA-12', name: 'Carb Killa Protein Shake 330ml (12 pack)', brand: 'Grenade', category: 'Ready To Drink', description: 'Ready-to-drink protein shake, 25g protein, low sugar.', imageUrl: null, wholesalePrice: 15.5, rrp: 27.99, stock: 84, barcode: '5060217012222', flavours: ['Chocolate', 'Caramel'], servings: 12 },
  { sku: 'APP-BODYFUEL-12', name: 'Body Fuel Energy Water 500ml (12 pack)', brand: 'Applied Nutrition', category: 'Ready To Drink', description: 'Ready-to-drink energy water with BCAAs and 100mg caffeine.', imageUrl: null, wholesalePrice: 11.0, rrp: 21.99, stock: 60, barcode: '5060398125555', flavours: ['Watermelon', 'Cherry'], servings: 12 },
]

export const POWERBODY_FIXTURES: SupplierProduct[] = SEED.map((s) => ({
  ...s,
  currency: 'GBP',
  inStock: s.stock > 0,
  weightGrams: s.weightGrams ?? weightFromName(s.name),
  // Sports nutrition is standard-rated in the UK; null defers to the standard
  // rate rather than pinning 20% here, so changing the rate changes it once.
  vatRate: null,
  // The mock has no two-call split to model: every fixture is whole.
  detailed: true,
  updatedAt: UPDATED,
}))
