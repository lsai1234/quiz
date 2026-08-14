'use client'

import { useEffect, useRef, useState } from 'react'
import { QuizIcon } from './QuizIcon'

const ACCENT = '#00D4FF'
/** How many products to name on a card before folding into “+N more”. */
const MAX_TICKS = 4

export interface BundleOption {
  id: string
  name: string
  budget: string
  sub: string
  icon: string
}

export interface BundlePreview {
  titles: string[]
  freeDelivery: boolean
}

interface Props {
  options: BundleOption[]
  previews: BundlePreview[]
  selectedId: string | null
  /** Merchandising badge per bundle id (Recommended / Best value). */
  badges: Partial<Record<string, string>>
  /** The bundle to centre first when nothing is selected yet. */
  featuredId: string
  onSelect: (id: string) => void
}

/**
 * The bundle chooser as a swipeable deck — one card per bundle, snap-scrolled,
 * so the user compares tiers one at a time instead of scanning four tall cards
 * stacked into a wall. Mirrors the Act 4 stack deck pattern (snap carousel +
 * position dots) so the language carries across the funnel.
 */
export function BundleDeck({ options, previews, selectedId, badges, featuredId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  // Open centred on the selection (or the featured tier) so the ladder starts
  // at "better" and swiping either way shows cheaper/bigger.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const startId = selectedId ?? featuredId
    const idx = Math.max(0, options.findIndex((o) => o.id === startId))
    const el = root.querySelectorAll<HTMLElement>('[data-card]')[idx]
    if (el) root.scrollLeft = el.offsetLeft - (root.clientWidth - el.offsetWidth) / 2
    // Mount-only: after that the user drives the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track the centred card for the dots.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    let frame = 0
    const compute = () => {
      frame = 0
      const center = root.scrollLeft + root.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      root.querySelectorAll<HTMLElement>('[data-card]').forEach((el, i) => {
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center)
        if (d < bestDist) { bestDist = d; best = i }
      })
      setActive(best)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(compute) }
    compute()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => { if (frame) cancelAnimationFrame(frame); root.removeEventListener('scroll', onScroll) }
  }, [options.length])

  return (
    <div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 -ml-5 -mr-[42px] pl-5 pr-[42px] snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {options.map((opt, i) => {
          const isActive = selectedId === opt.id
          const badge = badges[opt.id]
          const preview = previews[i] ?? { titles: [], freeDelivery: false }
          const shown = preview.titles.slice(0, MAX_TICKS)
          const extra = preview.titles.length - shown.length
          return (
            <button
              key={opt.id}
              data-card
              onClick={() => onSelect(opt.id)}
              className={['snap-center flex-shrink-0 w-[76vw] max-w-[290px] flex flex-col px-5 pt-5 pb-4 mt-3 rounded-2xl border text-left transition-all duration-200 active:scale-[0.99]',
                isActive
                  ? 'border-[#00D4FF] bg-[#00D4FF]/[0.08] text-white shadow-[0_0_30px_-12px_#00D4FF]'
                  : 'border-white/[0.08] bg-white/[0.015] text-white/75'].join(' ')}
            >
              {/* Badge row — reserved height so cards align with/without one */}
              <div className="h-5 -mt-1.5 mb-1">
                {badge && (
                  <span
                    className={['inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-[0.14em] uppercase',
                      isActive ? 'bg-[#00D4FF] text-[#0A0A0A]' : 'bg-white/12 text-white/75'].join(' ')}
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {badge}
                  </span>
                )}
              </div>

              {/* Identity: icon + name + price */}
              <QuizIcon name={opt.icon} size={22} className={isActive ? 'text-[#00D4FF]' : 'text-white/40'} />
              <span className="text-[17px] font-semibold mt-2" style={{ fontFamily: 'var(--font-display)' }}>{opt.name}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className={`text-[22px] font-black leading-none ${isActive ? 'text-white' : 'text-white/85'}`} style={{ fontFamily: 'var(--font-display)' }}>
                  {opt.budget}
                </span>
                <span className={`text-[10px] font-medium ${isActive ? 'text-white/55' : 'text-white/30'}`}>one-off</span>
              </div>
              <p className={`text-[12px] leading-snug mt-2 ${isActive ? 'text-white/65' : 'text-white/40'}`}>{opt.sub}</p>

              {/* What's inside — capped tick list */}
              <div className="mt-3.5 flex flex-col gap-1.5 flex-1">
                {shown.map((title, ci) => (
                  <div key={ci} className="flex items-center gap-2">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="shrink-0">
                      <circle cx="7" cy="7" r="7" fill={isActive ? '#00D4FF' : 'rgba(0,212,255,0.18)'} />
                      <path d="M4 7.1l1.9 1.9L10 5" stroke={isActive ? '#0A0A0A' : '#00D4FF'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className={`text-[12.5px] truncate ${isActive ? 'text-white/90' : 'text-white/60'}`}>{title}</span>
                  </div>
                ))}
                {extra > 0 && (
                  <span className={`text-[11px] font-semibold pl-[21px] ${isActive ? 'text-white/60' : 'text-white/35'}`}>
                    +{extra} more product{extra !== 1 ? 's' : ''}
                  </span>
                )}
                {shown.length === 0 && (
                  <span className={`text-[12px] ${isActive ? 'text-white/60' : 'text-white/35'}`}>Tailored to your goals</span>
                )}
              </div>

              {/* Perk + select state */}
              <div className={`mt-3.5 pt-3 border-t flex items-center justify-between ${isActive ? 'border-[#00D4FF]/20' : 'border-white/[0.06]'}`}>
                {preview.freeDelivery ? (
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${isActive ? 'text-[#00D4FF]' : 'text-[#00D4FF]/70'}`}>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                      <path d="M1.5 5.5h9v7h-9v-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      <path d="M10.5 8h4l3 3v1.5h-7V8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      <circle cx="5" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                      <circle cx="14.5" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                    Free delivery
                  </span>
                ) : (
                  <span className={`text-[11px] font-semibold ${isActive ? 'text-white/60' : 'text-white/30'}`}>
                    {preview.titles.length > 0 ? `${preview.titles.length} product${preview.titles.length !== 1 ? 's' : ''}` : ''}
                  </span>
                )}
                <span className={`text-[11px] font-bold tracking-wide ${isActive ? 'text-[#00D4FF]' : 'text-white/30'}`} style={{ fontFamily: 'var(--font-display)' }}>
                  {isActive ? 'Selected' : 'Choose'}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Position dots */}
      <div className="flex justify-center items-center gap-1.5 mt-3">
        {options.map((opt, i) => (
          <span
            key={opt.id}
            className="rounded-full transition-all"
            style={{
              width: i === active ? 18 : 6,
              height: 6,
              background: i === active ? ACCENT : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </div>
      <p className="text-center text-[11px] text-white/30 mt-2">Swipe to compare bundles</p>
    </div>
  )
}
