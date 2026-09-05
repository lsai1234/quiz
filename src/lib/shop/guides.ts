/**
 * What each shelf in the shop is actually FOR.
 *
 * ── Why a shop needs these at all ───────────────────────────────────────────
 * The shelves assume you already know what you came for. Somebody who knows
 * they want whey is served perfectly well by a grid of whey; somebody standing
 * in front of "Amino Acids and BCAAs" wondering whether that is a thing they
 * need is served by nothing at all, and leaves. The quiz answers that question
 * by asking about them. This answers it by explaining the category — the same
 * job, for the shopper who would rather read than be interviewed.
 *
 * So every shelf carries one plain sentence, and a way through to a page that
 * explains the whole category: what it is, what it is for, who tends to use it,
 * how it is taken, and what to look at when comparing two tubs.
 *
 * ── Why the copy lives here and not in the catalogue ────────────────────────
 * A category is not a product. It has no SKU, no supplier, no price, and its
 * name arrives from PowerBody's feed rather than from us — "Amino Acids" one
 * month, "Amino Acids and BCAAs" the next. Editorial about a category is
 * something we write and stand behind, so it is authored here, version
 * controlled, and reviewed like code.
 *
 * ── The claims rule ─────────────────────────────────────────────────────────
 * Every string in this file is checked by `claim-safety` in a unit test.
 * Supplement copy stays structure/function — "supports", "helps", "is used
 * for" — and never promises a medical outcome, a cure, a prevention or a
 * guaranteed result. That is not a stylistic preference: it is what keeps this
 * the right side of advertising rules, and the test is what stops a well-meant
 * edit crossing the line months from now.
 *
 * Pure: no database, no DOM.
 */

export interface GuideSection {
  heading: string
  /** Paragraphs. Kept as an array so the page never parses markdown. */
  body: string[]
}

export interface CategoryGuide {
  /** Matches `categorySlug(category)` — see `categories.ts`. */
  slug: string
  /**
   * Other slugs that mean the same shelf.
   *
   * The category name comes from the supplier feed, so the same shelf can
   * arrive as "Amino Acids" or "Amino Acids and BCAAs" without anything
   * changing on our side. Without aliases a rename silently drops the guide
   * from the shop, which is the kind of failure nobody notices for a month.
   */
  aliases?: string[]
  /** The page's own title, which need not be the supplier's category name. */
  title: string
  /** ONE sentence, shown under the shelf heading. Keep it under ~90 chars. */
  summary: string
  /** The opening paragraph of the guide page. */
  intro: string
  sections: GuideSection[]
}

export const GUIDES: CategoryGuide[] = [
  {
    slug: 'protein',
    title: 'Protein',
    summary: 'The building block your muscles repair with — and the one most people under-eat.',
    intro:
      'Protein is the nutrient your body uses to repair and build muscle tissue. You get it from food first; a protein powder is simply a convenient, measured way to add more when hitting your daily total from meals alone is difficult.',
    sections: [
      {
        heading: 'What it is for',
        body: [
          'Training creates small amounts of damage in muscle tissue, and the repair of that tissue is what makes a muscle adapt. Protein supplies the amino acids that repair draws on, which is why total daily protein matters more to most people than any other single nutrition variable.',
          'A powder is not different from food in what it does. It is faster to prepare, easier to measure, and easier to get down after training when appetite is low.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'Anyone training regularly who finds it hard to reach their protein target from meals. That is common for people eating in a calorie deficit, people training more than three or four times a week, and anyone on a plant-based diet, where the protein density of most foods is lower.',
          'If you already hit your target from food, a powder adds convenience rather than anything else.',
        ],
      },
      {
        heading: 'The types, briefly',
        body: [
          'Whey concentrate is the standard and the cheapest per gram. Whey isolate is filtered further, so it carries less lactose and less fat — worth the extra if concentrate sits badly with you. Casein digests slowly and is usually taken later in the day. Plant blends combine sources such as pea and rice so the amino acid profile is more complete than any one of them alone.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'One scoop, typically 20–30g of protein, in water or milk. Timing matters far less than people think — total intake across the day is what counts, so take it whenever it makes the day easier.',
        ],
      },
      {
        heading: 'What to compare',
        body: [
          'Look at protein per serving and price per serving together, not the price on the tub. A cheaper 1kg bag with 17g a scoop can cost more per gram of protein than a dearer one with 27g. Every price on this shop can be switched to per-serving for exactly that reason.',
        ],
      },
    ],
  },
  {
    slug: 'amino-acids-and-bcaas',
    aliases: ['amino-acids', 'amino-acids-bcaas', 'eaa', 'eaas', 'bcaa', 'bcaas'],
    title: 'Amino acids, EAAs and BCAAs',
    summary: 'The parts protein breaks down into, taken on their own — useful in specific cases.',
    intro:
      'Amino acids are what protein is made of. There are nine your body cannot make itself, called essential amino acids or EAAs. BCAAs are three of those nine. Taking them on their own is useful in some situations and redundant in others, and it is worth knowing which you are in.',
    sections: [
      {
        heading: 'What it is for',
        body: [
          'These products supply amino acids directly rather than as whole protein, so they are absorbed quickly and carry almost no calories. That makes them easy to sip during a session, and easy to take when you do not want food sitting in your stomach.',
        ],
      },
      {
        heading: 'EAAs or BCAAs?',
        body: [
          'EAAs contain all nine essential amino acids. BCAAs contain three of them. Muscle repair draws on all nine, so an EAA product covers what a BCAA product covers and more — which is why EAAs have largely replaced BCAAs where the two compete.',
          'BCAAs are still widely used, are cheaper, and mix well as an intra-workout drink. If you are choosing between them and the price is close, EAAs are the more complete option.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'People training fasted or early in the morning, people doing long sessions where sipping something is easier than eating, and people in a calorie deficit who want the amino acids without the calories.',
          'Worth being straight about the other case: if you already take a protein powder and eat enough protein across the day, you are getting these amino acids already. A separate product then adds convenience during a session rather than anything your diet is short of.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'Usually one scoop in a large bottle of water, sipped before or during training. They are flavoured to be drunk over a session rather than downed in one.',
        ],
      },
      {
        heading: 'What to compare',
        body: [
          'Check the amino acid total per serving, not the scoop size — scoops vary a lot. On a BCAA product the ratio is usually written as 2:1:1, which is the standard and perfectly sensible; much higher leucine ratios are a marketing position more than a meaningful difference.',
        ],
      },
    ],
  },
  {
    slug: 'creatine',
    title: 'Creatine',
    summary: 'The most heavily researched supplement there is, and one of the cheapest.',
    intro:
      'Creatine helps your muscles produce energy during short, hard efforts — a heavy set, a sprint, the last few reps. It is the most studied supplement on the market and among the least expensive.',
    sections: [
      {
        heading: 'What it is for',
        body: [
          'Your muscles use a compound called ATP for immediate energy, and creatine helps regenerate it between efforts. In practice that shows up as being able to do slightly more work in the same session — an extra rep, a little more weight — which accumulates over months.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'Anyone doing resistance training or repeated high-intensity efforts. It is used by beginners and by people who have trained for years, and it is not sex- or age-specific.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'Five grams a day, every day, at whatever time you will remember. It works by keeping muscle stores topped up, so consistency matters and timing does not.',
          'You may see “loading” protocols of 20g a day for a week. That fills the stores faster; taking 5g daily arrives at the same place in about three to four weeks. Neither is wrong.',
        ],
      },
      {
        heading: 'What to compare',
        body: [
          'Creatine monohydrate is the form nearly all the research uses, and it is the cheapest. Other forms are sold at a premium on the argument that they absorb better; the evidence for that is thin. Buy monohydrate, buy plain, and compare on price per serving.',
          'Some people notice a small amount of water retention in the first weeks. It is a normal response to fuller muscle stores.',
        ],
      },
    ],
  },
  {
    slug: 'pre-workout',
    aliases: ['preworkout', 'pre-workouts'],
    title: 'Pre-workout',
    summary: 'Caffeine and a few training-specific ingredients, taken before a session.',
    intro:
      'A pre-workout is a stimulant drink built around caffeine, usually with a handful of other ingredients aimed at the feel of a session. It is the most over-sold category in the shop, and also a genuinely useful one if you know what you are buying.',
    sections: [
      {
        heading: 'What is actually in it',
        body: [
          'Caffeine does most of the work: it reduces how hard an effort feels. Beta-alanine is often included for longer, high-intensity efforts, and is what causes the harmless skin tingling many people notice. Citrulline is included for blood flow, which is behind the “pump” feeling. Everything beyond those is usually present in amounts too small to do much.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'People training early, late, or tired, and people who want a routine that signals the session is starting. It is a tool for a hard session, not something to take every day out of habit.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'One scoop in water, roughly 20 to 30 minutes before training. Start with half a scoop the first time, whatever the tub says — doses vary enormously between brands and the strong ones are strong.',
        ],
      },
      {
        heading: 'What to compare',
        body: [
          'Caffeine per serving is the number that matters, and it ranges from about 150mg to over 300mg. Bear in mind caffeine stays with you for hours: a late session on a strong pre-workout will cost you sleep, and sleep affects training more than the pre-workout did.',
          'Stimulant-free versions exist for exactly that reason, and keep the citrulline and beta-alanine without the caffeine.',
        ],
      },
    ],
  },
  {
    slug: 'hydration',
    aliases: ['electrolytes'],
    title: 'Hydration and electrolytes',
    summary: 'Salts that help your body hold on to the water you drink.',
    intro:
      'Sweat is not just water — it carries sodium, potassium and magnesium with it. Electrolyte products replace those salts, which is what lets the water you drink actually be absorbed and retained rather than passing straight through.',
    sections: [
      {
        heading: 'What it is for',
        body: [
          'After a long or hot session, drinking plain water replaces the volume but not the salts. Electrolyte drinks replace both, which helps you rehydrate more completely.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'People doing long sessions, training in heat, sweating heavily, or working outdoors. Endurance athletes use them routinely. For a 45-minute indoor session in a cool gym, water is usually enough.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'A tablet or sachet in 500ml of water, during or after the session. Tablets are the convenient format; powders tend to be cheaper per serving.',
        ],
      },
      {
        heading: 'What to compare',
        body: [
          'Sodium content per serving, and whether there is sugar in it. A small amount of sugar helps absorption and is deliberate in sports drinks. A zero-sugar tablet is the right choice if you are managing calories.',
        ],
      },
    ],
  },
  {
    slug: 'recovery',
    title: 'Recovery',
    summary: 'What supports the repair between sessions — sleep, joints and inflammation.',
    intro:
      'Training is the stimulus; the adaptation happens between sessions. This shelf covers the products people use to support that gap — sleep, joint comfort, and managing the accumulated load of hard weeks.',
    sections: [
      {
        heading: 'What it is for',
        body: [
          'Recovery is mostly sleep, food and time, and no supplement replaces any of the three. What is here supports the edges: magnesium and glycine for sleep quality, collagen for connective tissue, omega-3 for a normal inflammatory response.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'People training hard enough that recovery has become the limiting factor rather than effort — usually four or more sessions a week, or anyone adding load quickly.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'Most of this shelf is taken daily rather than around a session, and most of it is taken in the evening. Consistency does more here than dose.',
        ],
      },
      {
        heading: 'Being honest about it',
        body: [
          'If your sleep is short or your food is inconsistent, fixing either will do more for your recovery than anything on this shelf. These are worth adding once those are in reasonable shape, not instead of them.',
        ],
      },
    ],
  },
  {
    slug: 'sleep',
    title: 'Sleep',
    summary: 'Ingredients used to support winding down and sleep quality.',
    intro:
      'Sleep is where most of the adaptation from training happens, and it is the first thing to suffer in a busy period. This shelf covers the ingredients people use to support winding down at the end of the day.',
    sections: [
      {
        heading: 'What is on this shelf',
        body: [
          'Magnesium, most often as glycinate, which is well absorbed and gentle on the stomach. Glycine, an amino acid taken before bed. Herbal ingredients such as valerian and chamomile. Some products combine several of these.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'People who train late and find it hard to switch off afterwards, and people whose sleep has become inconsistent under a heavy schedule.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'Typically 30 to 60 minutes before bed, daily rather than occasionally.',
        ],
      },
      {
        heading: 'Being honest about it',
        body: [
          'Light, caffeine timing and a consistent bedtime affect sleep more than any supplement does. If you are taking a strong pre-workout in the evening, that is the first thing worth changing.',
          'Persistent sleep problems are worth raising with a doctor rather than working around.',
        ],
      },
    ],
  },
  {
    slug: 'health',
    aliases: ['everyday-health', 'vitamins-minerals', 'vitamins-and-minerals', 'general-health'],
    title: 'Everyday health',
    summary: 'The everyday basics — vitamins, minerals and omega-3.',
    intro:
      'This shelf is the foundational end: vitamins, minerals and fatty acids that contribute to normal bodily function. Nothing here is about training specifically. It is about not being short of something.',
    sections: [
      {
        heading: 'What is on this shelf',
        body: [
          'Vitamin D, which is difficult to get from sunlight in the UK between roughly October and March. Omega-3, which most people who do not eat oily fish regularly are low in. Multivitamins, which cover a broad base at modest doses. Individual minerals such as magnesium, iron and zinc.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'Almost anyone can reasonably take vitamin D through a British winter. Beyond that it depends on your diet: someone who does not eat fish has a reason to consider omega-3, and someone eating a restricted diet has more reason to consider a multivitamin than someone who is not.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'Daily, with food. Fat-soluble vitamins — A, D, E and K — are absorbed better alongside a meal containing some fat.',
        ],
      },
      {
        heading: 'Being honest about it',
        body: [
          'More is not better with vitamins and minerals, and a few of them accumulate. Stick to the dose on the label, and if you are taking several products, check you are not doubling up on the same ingredient.',
          'If you think you may be deficient in something, a blood test through your GP will tell you rather than leaving you to guess.',
        ],
      },
    ],
  },
  {
    slug: 'gut-health',
    aliases: ['gut', 'digestive-health'],
    title: 'Gut health',
    summary: 'Probiotics, fibre and digestive enzymes — the everyday digestion shelf.',
    intro:
      'This shelf covers products aimed at digestion: live bacteria, fibre, and enzymes that help break food down. It is a fast-moving area of research, and worth approaching with modest expectations.',
    sections: [
      {
        heading: 'What is on this shelf',
        body: [
          'Probiotics supply live bacteria. Prebiotics supply the fibre those bacteria feed on. Digestive enzymes help break down particular components of food — lactase for lactose being the clearest example.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'People whose digestion is unsettled by a high-protein diet, people who have recently taken a course of antibiotics, and anyone whose fibre intake is low.',
          'If dairy protein specifically causes you problems, a whey isolate or a lactase enzyme is a more direct answer than a probiotic.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'Daily and consistently. Probiotics in particular are usually taken for weeks rather than as needed, and many are best kept refrigerated — check the label.',
        ],
      },
      {
        heading: 'Being honest about it',
        body: [
          'Strains differ enormously and general claims about “gut health” cover a lot of ground. Eating more plants and more fibre is the intervention with the broadest support behind it.',
          'Ongoing digestive symptoms are worth seeing a doctor about rather than managing with supplements.',
        ],
      },
    ],
  },
  {
    slug: 'performance',
    title: 'Performance',
    summary: 'Ingredients aimed at output in the session itself.',
    intro:
      'This shelf is about the session: ingredients used to support power, endurance and the ability to keep working at intensity.',
    sections: [
      {
        heading: 'What is on this shelf',
        body: [
          'Creatine for short, hard efforts. Beta-alanine for sustained high-intensity work. Citrulline and nitrate products for blood flow. Caffeine for perceived effort.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'People with a specific performance goal — a lift, a race, a competitive season — rather than general training.',
        ],
      },
      {
        heading: 'How it is taken',
        body: [
          'It varies by ingredient, and that difference matters. Creatine and beta-alanine work by building up in the muscle over weeks and are taken daily whether you train or not. Caffeine and citrulline are taken before a session for an acute effect.',
        ],
      },
      {
        heading: 'What to compare',
        body: [
          'Check the dose of the active ingredient against what the research uses, not the length of the ingredient list. A blend of fifteen things at token doses does less than one ingredient at a proper one.',
        ],
      },
    ],
  },
  {
    slug: 'menopause-support',
    aliases: ['menopause'],
    title: 'Menopause support',
    summary: 'Ingredients aimed at the nutritional side of the menopause transition.',
    intro:
      'This shelf covers products aimed at the nutritional aspects of perimenopause and menopause, where changing hormone levels affect bone density, muscle maintenance and sleep.',
    sections: [
      {
        heading: 'What is on this shelf',
        body: [
          'Calcium and vitamin D, which contribute to the maintenance of normal bones. Magnesium, often taken in the evening. Protein, because maintaining muscle becomes harder and matters more. Some products combine botanical ingredients traditionally used through this transition.',
        ],
      },
      {
        heading: 'Who tends to use it',
        body: [
          'Women in perimenopause or menopause, often alongside changes to training — resistance work in particular becomes more valuable for both bone and muscle.',
        ],
      },
      {
        heading: 'Being honest about it',
        body: [
          'This is the shelf where talking to a doctor matters most. Menopause has medical options that a supplement is not a substitute for and not a comparison against, and some botanical ingredients interact with prescribed medicines.',
          'What is here supports nutrition alongside whatever you and your GP decide. It is not an alternative to that conversation.',
        ],
      },
    ],
  },
  {
    slug: 'accessories',
    title: 'Accessories',
    summary: 'Shakers and the practical bits. No claims to make about these.',
    intro:
      'Shakers, bottles and the practical equipment that makes the rest of it easier to actually use.',
    sections: [
      {
        heading: 'What to look for',
        body: [
          'A wide mouth for getting a scoop in and a brush out. A seal that survives being in a bag. A mixing ball or a mesh, which is the difference between a smooth drink and lumps.',
          'Wash it the same day. There is no supplement advice to give here, but there is that.',
        ],
      },
    ],
  },
]

const BY_SLUG = new Map<string, CategoryGuide>()
for (const g of GUIDES) {
  BY_SLUG.set(g.slug, g)
  for (const a of g.aliases ?? []) BY_SLUG.set(a, g)
}

/**
 * The guide for a category slug, or null.
 *
 * Null is an ordinary answer, not a failure: the catalogue is supplier data and
 * a new shelf can appear at any time. A shelf without a guide simply shows its
 * products, exactly as it did before any of this existed.
 */
export function guideFor(slug: string | null | undefined): CategoryGuide | null {
  if (!slug) return null
  return BY_SLUG.get(slug.toLowerCase()) ?? null
}

/** Every guide that has its own page, for `generateStaticParams` and tests. */
export function allGuides(): CategoryGuide[] {
  return GUIDES
}

/** Where a guide lives. */
export function guideHref(guide: CategoryGuide): string {
  return `/guide/${guide.slug}`
}
