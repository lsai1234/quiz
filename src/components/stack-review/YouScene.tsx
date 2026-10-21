'use client'

import { useEffect, useId, useRef } from 'react'
import gsap from 'gsap'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { RESULTS_HEADINGS, type ProductExplanation } from '@/lib/results'
import { ProductTile } from './ProductTile'
import { YOU_PALETTE as P } from './you-palette'

/** One product in the stack on screen, with its "Built from your answers" line. */
export interface YouSceneItem {
  /** The slot id: stable across swaps, unique in the stack. */
  key: string
  product: CatalogueProduct
  /** Drives the tile's fallback glyph when there is no photo. */
  slotType: string
  /** From `explainProduct`. Null means the product gets no line. */
  explanation: ProductExplanation | null
}

interface Props {
  /** `answers.name` as typed. Only the first word is shown. */
  name?: string | null
  /** `blueprint.stackName`. Null while there is no stack to name. */
  stackName: string | null
  /** The stack on screen (the active depth, swaps and add-ons included), in deck order. */
  items: readonly YouSceneItem[]
  /** From `whatWeChecked`. */
  checks: readonly string[]
  reducedMotion?: boolean
}

/**
 * The words this scene adds around the reviewed phrases. The "You said ..."
 * lines, the check lines and the two section headings live in
 * `@/lib/results/phrases.ts`; these are labels only and say nothing about what
 * a product does.
 */
export const YOU_SCENE_COPY = {
  greetingNamed: (first: string) => `${first}, here’s your stack`,
  greeting: 'Here’s your stack',
  productCount: (n: number) => `${n} product${n === 1 ? '' : 's'}`,
  /** Under each quoted claim. The wording is the GB register's, verbatim. */
  claimLabel: 'Authorised health claim',
} as const

/** The first word of the name they typed, with its first letter capitalised. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]
  if (!first) return null
  return first[0].toUpperCase() + first.slice(1)
}

export function greetingFor(name: string | null | undefined): string {
  const first = firstNameOf(name)
  return first ? YOU_SCENE_COPY.greetingNamed(first) : YOU_SCENE_COPY.greeting
}

type ExplainedItem = YouSceneItem & { explanation: ProductExplanation }

/** One "Built from your answers" sentence and the products it was said for. */
export interface AnswerGroup {
  sentence: string
  items: ExplainedItem[]
}

/**
 * The explained products, one group per sentence, in the order each sentence
 * first appears. Two products both there because they want to build muscle
 * read as one answer with two products under it, not the same line twice.
 */
export function groupBySentence(items: readonly YouSceneItem[]): AnswerGroup[] {
  const groups: AnswerGroup[] = []
  for (const item of items) {
    if (!item.explanation) continue
    const sentence = item.explanation.sentence
    const group = groups.find((g) => g.sentence === sentence)
    if (group) group.items.push(item as ExplainedItem)
    else groups.push({ sentence, items: [item as ExplainedItem] })
  }
  return groups
}

/** How many tiles the strip shows before it says "+n". */
const STRIP_MAX = 6

const DISPLAY = 'var(--font-display)'

/**
 * Scene 1 of the results page: whose stack this is, what it is called, what is
 * in it, the answers it was built from, and what we left out for them.
 *
 * Everything here is either their own answers played back, the stack's
 * rule-based name, product names, or a claim from the GB register quoted
 * verbatim beside the answer it backs (see `@/lib/results`). Nothing here is
 * written by AI, and no line links a goal to a product except through the
 * goal-to-claim map. A product with no line is listed after them by name
 * and type only, and a section with nothing in it is left out.
 */
export function YouScene({ name, stackName, items, checks, reducedMotion }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const builtId = useId()
  const checkedId = useId()

  const groups = groupBySentence(items)
  const quiet = items.filter((item) => item.explanation === null)
  const alsoId = useId()
  const shown = items.slice(0, items.length > STRIP_MAX ? STRIP_MAX - 1 : STRIP_MAX)
  const extra = items.length - shown.length

  // A short rise as the scene arrives. Mount only: rows that change later (a
  // swap, a different depth) just appear.
  useEffect(() => {
    const root = rootRef.current
    if (!root || reducedMotion) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-reveal]',
        { y: 14, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.55, ease: 'power3.out', stagger: 0.07, delay: 0.1, clearProps: 'transform' },
      )
    }, root)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section
      id="scene-you"
      aria-labelledby={headingId}
      /* The anchors' scroll margin is the bar plus a 1rem gap, so a jump lands
         a scene below the bar, as the 1rem top padding here does for the card. */
      className="px-5 pt-4 pb-10 max-w-lg mx-auto scroll-mt-[calc(env(safe-area-inset-top)+4.5rem)]"
    >
      <div
        ref={rootRef}
        className="relative overflow-hidden rounded-3xl p-6"
        style={{
          background: `linear-gradient(180deg, rgba(0,212,255,0.08), rgba(255,255,255,0) 40%), ${P.card}`,
          border: `1px solid ${P.hairline}`,
          boxShadow: '0 22px 54px -26px rgba(10,10,10,0.28)',
        }}
      >
        {/* A soft light in the corner, so the card reads lit rather than flat. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.16), rgba(0,212,255,0) 68%)' }}
        />

        <h2 id={headingId} className="relative">
          <span
            data-reveal
            className="flex items-center gap-2.5 text-[15px] font-semibold leading-snug"
            style={{ color: P.ink2, fontFamily: DISPLAY }}
          >
            <span
              aria-hidden
              className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: P.accent, color: P.ink }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2 4 14h7l-1 8 10-12h-7l1-8z" />
              </svg>
            </span>
            {greetingFor(name)}
          </span>
          {stackName ? (
            <span
              data-reveal
              className="mt-3 block break-words text-[2.6rem] font-black leading-[1.02] tracking-tight"
              style={{ color: P.ink, fontFamily: DISPLAY }}
            >
              {stackName}
            </span>
          ) : null}
        </h2>

        {items.length > 0 && (
          <div data-reveal className="relative mt-6 flex items-center gap-3.5">
            <span aria-hidden className="block h-1 w-10 flex-shrink-0 rounded-full" style={{ background: P.accent }} />
            <ul className="flex items-center" aria-label="In your stack">
              {shown.map((item, i) => (
                <li key={item.key} className={`relative ${i > 0 ? '-ml-2.5' : ''}`} style={{ zIndex: shown.length - i }}>
                  <ProductTile
                    imageUrl={item.product.imageUrl}
                    slot={item.slotType}
                    title={item.product.title}
                    size={44}
                    style={{ boxShadow: `0 0 0 2.5px ${P.card}, 0 8px 16px -10px rgba(10,10,10,0.5)` }}
                  />
                </li>
              ))}
              {extra > 0 && (
                <li
                  className="relative -ml-2.5 flex h-11 w-11 items-center justify-center rounded-lg text-[13px] font-bold"
                  style={{ background: P.page, color: P.ink2, boxShadow: `0 0 0 2.5px ${P.card}`, fontFamily: DISPLAY }}
                >
                  +{extra}
                </li>
              )}
            </ul>
            <p className="text-[15px] font-bold leading-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
              {YOU_SCENE_COPY.productCount(items.length)}
            </p>
          </div>
        )}

        {groups.length > 0 && (
          <section
            data-reveal
            aria-labelledby={builtId}
            className="relative mt-7 pt-6"
            style={{ borderTop: `1px solid ${P.hairline}` }}
          >
            <SectionHeading id={builtId}>{RESULTS_HEADINGS.builtFromAnswers}</SectionHeading>
            <ul className="mt-4 space-y-6">
              {groups.map((group) => (
                <AnswerGroupRow key={group.sentence} group={group} />
              ))}
            </ul>
          </section>
        )}

        {quiet.length > 0 && (
          <section
            data-reveal
            aria-labelledby={alsoId}
            className="relative mt-7 pt-6"
            style={{ borderTop: `1px solid ${P.hairline}` }}
          >
            <SectionHeading id={alsoId}>
              {groups.length > 0 ? RESULTS_HEADINGS.alsoInStack : RESULTS_HEADINGS.inStack}
            </SectionHeading>
            <ul className="mt-4 space-y-3">
              {quiet.map((item) => (
                <li key={item.key} className="flex items-center gap-3.5" data-listed={item.product.id}>
                  <ProductTile imageUrl={item.product.imageUrl} slot={item.slotType} title={item.product.title} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug" style={{ color: P.ink }}>
                      {item.product.title}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug" style={{ color: P.ink3 }}>
                      {productTypeLabel(item.product)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {checks.length > 0 && (
          <section
            data-reveal
            aria-labelledby={checkedId}
            className="relative mt-7 pt-6"
            style={{ borderTop: `1px solid ${P.hairline}` }}
          >
            <SectionHeading id={checkedId}>{RESULTS_HEADINGS.whatWeChecked}</SectionHeading>
            <ul className="mt-4 space-y-3">
              {checks.map((line) => (
                <li key={line} className="flex items-start gap-3 text-[14px] leading-snug" style={{ color: P.ink2 }}>
                  <Tick />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  )
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h3
      id={id}
      className="text-[11px] font-bold uppercase tracking-[0.16em]"
      style={{ color: P.ink3, fontFamily: DISPLAY }}
    >
      {children}
    </h3>
  )
}

/**
 * One "Built from your answers" group: the answer, then each product it was
 * said for, each with the claim that backs it, quoted. Always together, so a
 * goal is never on screen without the register's words beside the product.
 */
function AnswerGroupRow({ group }: { group: AnswerGroup }) {
  return (
    <li data-line={group.sentence}>
      <p className="text-[17px] font-bold leading-snug tracking-tight" style={{ color: P.ink, fontFamily: DISPLAY }}>
        {group.sentence}
      </p>
      <ul className="mt-3 space-y-4">
        {group.items.map((item) => (
          <AnswerProduct key={item.key} item={item} />
        ))}
      </ul>
    </li>
  )
}

function AnswerProduct({ item }: { item: ExplainedItem }) {
  const { product, explanation } = item
  const claim = explanation.claim
  return (
    <li className="flex gap-3.5" data-explained={product.id}>
      <ProductTile imageUrl={product.imageUrl} slot={item.slotType} title={product.title} size={40} />
      <div className="min-w-0 flex-1">
        <p className="pt-0.5 text-[15px] font-semibold leading-snug" style={{ color: P.ink }}>
          {product.title}
        </p>
        {claim ? (
          <figure
            className="mt-2.5 rounded-r-xl py-2 pl-3 pr-3"
            style={{ background: 'rgba(0,212,255,0.07)', borderLeft: `2px solid ${P.accent}` }}
          >
            <blockquote className="text-[13px] leading-relaxed" style={{ color: P.ink2 }}>
              “{claim.wording}”
            </blockquote>
            <figcaption
              className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: P.accentInk, fontFamily: DISPLAY }}
            >
              {YOU_SCENE_COPY.claimLabel}
            </figcaption>
          </figure>
        ) : null}
      </div>
    </li>
  )
}

/** A drawn tick on the brand cyan: dark on cyan, as the page's buttons are. */
function Tick() {
  return (
    <span
      aria-hidden
      className="mt-px inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
      style={{ background: P.accent, color: P.ink }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
      </svg>
    </span>
  )
}
