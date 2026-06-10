'use client'

import { useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { RiskBadge } from '@/components/ui/RiskBadge'

export function SwipePreviewScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [showSafeZone, setShowSafeZone] = useState(false)

  const slides = state.working.slides
  const cs = state.working.claimSafety
  const vd = state.working.visualDirection

  if (!slides.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-5 text-center">
        <div>
          <p className="text-zinc-400 mb-3">No slides to preview.</p>
          <button onClick={() => goTo('carousel-builder')} className="px-4 py-2 bg-orange-500 text-black rounded-xl font-bold text-sm">
            Go to builder
          </button>
        </div>
      </div>
    )
  }

  const slide = slides[currentSlide]
  const isFirst = currentSlide === 0
  const isLast = currentSlide === slides.length - 1
  const isKeySlide = currentSlide === 0 || currentSlide === 4

  const textPositionClass = {
    top: 'justify-start pt-16',
    middle: 'justify-center',
    bottom: 'justify-end pb-20',
  }[slide.text_position] ?? 'justify-end pb-20'

  return (
    <div className="flex-1 flex flex-col bg-zinc-950">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Preview</h1>
          <p className="text-xs text-zinc-500">TikTok-style carousel view</p>
        </div>
        <div className="flex items-center gap-2">
          {cs && <RiskBadge risk={cs.claim_risk} />}
          <button
            onClick={() => setShowSafeZone(!showSafeZone)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              showSafeZone
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}
          >
            Safe zones
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 pb-4">
        <div className="relative w-full max-w-[300px]">
          {/* Phone frame */}
          <div className="relative bg-zinc-900 rounded-[2.5rem] border-4 border-zinc-700 overflow-hidden shadow-2xl"
            style={{ aspectRatio: '9/16' }}>

            {/* Background gradient simulating image area */}
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-800 to-zinc-950" />

            {/* Safe zone overlays */}
            {showSafeZone && (
              <>
                <div className="absolute top-0 left-0 right-0 h-[15%] bg-red-500/20 border-b border-red-500/40 flex items-center justify-center z-10">
                  <span className="text-red-400 text-xs font-medium">TikTok Top UI</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[25%] bg-red-500/20 border-t border-red-500/40 flex items-center justify-center z-10">
                  <span className="text-red-400 text-xs font-medium">TikTok Bottom UI</span>
                </div>
              </>
            )}

            {/* Key slide indicator */}
            {isKeySlide && (
              <div className="absolute top-3 left-3 z-20 bg-orange-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                {currentSlide === 0 ? '★ Hook' : '★ CTA'}
              </div>
            )}

            {/* Slide content */}
            <div className={`absolute inset-0 flex flex-col px-4 z-10 ${textPositionClass}`}>
              <div className="bg-black/70 backdrop-blur-sm rounded-xl p-3 max-w-full">
                <p className="text-white text-xs leading-relaxed whitespace-pre-wrap font-medium">
                  {slide.text}
                </p>
              </div>
            </div>

            {/* Slide number indicator */}
            <div className="absolute top-3 right-3 z-20 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
              {currentSlide + 1}/{slides.length}
            </div>

            {/* Visual note at bottom */}
            <div className="absolute inset-x-3 bottom-3 z-10">
              <div className="bg-zinc-900/80 rounded-lg p-2">
                <p className="text-zinc-400 text-[10px] leading-tight line-clamp-2">
                  <span className="text-zinc-600">Visual: </span>{slide.visual_note}
                </p>
              </div>
            </div>

            {/* Navigation tap areas */}
            <button
              onClick={() => setCurrentSlide((i) => Math.max(0, i - 1))}
              className="absolute left-0 top-0 bottom-0 w-1/3 z-20 opacity-0"
              aria-label="Previous slide"
            />
            <button
              onClick={() => setCurrentSlide((i) => Math.min(slides.length - 1, i + 1))}
              className="absolute right-0 top-0 bottom-0 w-1/3 z-20 opacity-0"
              aria-label="Next slide"
            />
          </div>

          {/* Slide dots */}
          <div className="flex justify-center gap-1.5 mt-4">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`rounded-full transition-all ${
                  i === currentSlide
                    ? 'w-6 h-2 bg-orange-500'
                    : 'w-2 h-2 bg-zinc-700 hover:bg-zinc-500'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Slide role label */}
      <div className="px-5 pb-2">
        <div className="bg-zinc-900 rounded-xl p-3 text-center">
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{slide.role}</span>
        </div>
      </div>

      {/* Navigation + quick actions */}
      <div className="px-5 pb-2 flex gap-2">
        <button
          onClick={() => setCurrentSlide((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="flex-1 py-2.5 bg-zinc-800 disabled:opacity-30 text-zinc-300 rounded-xl text-sm font-medium border border-zinc-700"
        >
          ← Prev
        </button>
        <button
          onClick={() => setCurrentSlide((i) => Math.min(slides.length - 1, i + 1))}
          disabled={isLast}
          className="flex-1 py-2.5 bg-zinc-800 disabled:opacity-30 text-zinc-300 rounded-xl text-sm font-medium border border-zinc-700"
        >
          Next →
        </button>
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-3 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={() => goTo('export-review')}
          className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-bold text-base transition-all active:scale-98"
        >
          Review & export →
        </button>
      </div>
    </div>
  )
}
