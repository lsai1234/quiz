'use client'

import { useEffect, useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { buildCarousel, improveSlide } from '@/lib/ai-service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EXPERIENCE_TYPES } from '@/lib/mock-data'
import type { CarouselSlide, ContentExperienceType } from '@/lib/types'

const SLIDE_ACTIONS = ['Make punchier', 'Less wordy', 'More TikTok-native', 'Make safer', 'Regenerate']

function ExperienceTypeSelector() {
  const { state, dispatch } = useAppState()
  const [selected, setSelected] = useState<ContentExperienceType | null>(state.working.experienceType)
  const [expanded, setExpanded] = useState<ContentExperienceType | null>(null)

  function handleSelect(type: ContentExperienceType) {
    setSelected(type)
    dispatch({ type: 'SET_EXPERIENCE_TYPE', experienceType: type })
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-white mb-1">Choose Your Experience</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            This shapes <em>everything</em> — the tension, the slide flow, the reason someone actually keeps swiping.
            Don't pick "educational content". Pick a psychological mechanism.
          </p>
        </div>

        <div className="space-y-2.5">
          {EXPERIENCE_TYPES.map((exp) => {
            const isSelected = selected === exp.type
            const isExpanded = expanded === exp.type

            return (
              <div
                key={exp.type}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  isSelected
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-800 bg-zinc-900'
                }`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : exp.type)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <span className="text-2xl shrink-0">{exp.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`font-bold text-sm ${isSelected ? 'text-orange-400' : 'text-white'}`}>
                        {exp.label}
                      </span>
                      {isSelected && (
                        <span className="text-xs bg-orange-500 text-black px-2 py-0.5 rounded-full font-bold">Selected</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-snug italic">"{exp.tagline}"</p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 space-y-3 border-t border-zinc-800/60">
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1.5">How it works</p>
                      <p className="text-xs text-zinc-300 leading-relaxed">{exp.mechanism}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Slide flow</p>
                      <div className="space-y-1">
                        {exp.slideRoles.map((role, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className={`text-xs font-bold mt-0.5 shrink-0 ${isSelected ? 'text-orange-400' : 'text-zinc-600'}`}>
                              {i + 1}
                            </span>
                            <span className="text-xs text-zinc-400">{role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1.5">Example hook</p>
                      <p className="text-xs text-zinc-300 italic leading-relaxed">{exp.example}</p>
                    </div>
                  </div>
                )}

                {!isSelected && (
                  <div className="px-4 pb-3">
                    <button
                      onClick={() => handleSelect(exp.type)}
                      className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors border border-zinc-700"
                    >
                      Use this experience →
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          disabled={!selected}
          onClick={() => {/* proceed - handled by parent */}}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all ${
            selected
              ? 'bg-orange-500 hover:bg-orange-400 text-black active:scale-98'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {selected ? `Build ${EXPERIENCE_TYPES.find(e => e.type === selected)?.label} carousel →` : 'Pick an experience to continue'}
        </button>
      </div>
    </div>
  )
}

function SlideCard({ slide, index, onUpdate }: {
  slide: CarouselSlide
  index: number
  onUpdate: (updated: CarouselSlide) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(slide.text)
  const [improving, setImproving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(index === 0)
  const { state } = useAppState()

  const isKey = index === 0 || index === 4

  async function handleAction(action: string) {
    if (!state.working.selectedIdea) return
    setImproving(action)
    try {
      const updated = await improveSlide(slide, action, state.working.selectedIdea, state.settings)
      onUpdate(updated)
      setText(updated.text)
    } catch {}
    setImproving(null)
  }

  function saveEdit() {
    onUpdate({ ...slide, text })
    setEditing(false)
  }

  return (
    <div className={`bg-zinc-900 rounded-2xl overflow-hidden border ${isKey ? 'border-orange-500/40' : 'border-zinc-800'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          isKey ? 'bg-orange-500 text-black' : 'bg-zinc-800 text-zinc-400'
        }`}>
          {slide.slide_number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{slide.role}</span>
            {isKey && <span className="text-xs text-orange-400 font-medium">Key</span>}
          </div>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{slide.text.split('\n')[0]}</p>
        </div>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-800/60 pt-3">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-32 bg-zinc-800 border border-zinc-600 rounded-xl px-3 py-2 text-sm text-white resize-none outline-none focus:border-orange-500"
              />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex-1 py-2 bg-orange-500 text-black rounded-lg text-sm font-bold">Save</button>
                <button onClick={() => { setEditing(false); setText(slide.text) }} className="flex-1 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{slide.text}</p>
              <div className="flex items-start gap-2 p-3 bg-zinc-800/60 rounded-xl">
                <span className="text-xs text-zinc-600 shrink-0 mt-0.5">Visual</span>
                <p className="text-xs text-zinc-400 leading-relaxed">{slide.visual_note}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-600">Text position:</span>
                <span className="text-xs text-zinc-300 capitalize bg-zinc-800 px-2 py-0.5 rounded-full">{slide.text_position}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium"
                >
                  ✏️ Edit
                </button>
                {SLIDE_ACTIONS.map((action) => (
                  <button
                    key={action}
                    onClick={() => handleAction(action)}
                    disabled={!!improving}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      improving === action
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {improving === action ? '...' : action}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CarouselBuilderScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [loading, setLoading] = useState(false)

  const idea = state.working.selectedIdea
  const experienceType = state.working.experienceType
  const slides = state.working.slides

  async function generateSlides() {
    if (!idea || loading) return
    setLoading(true)
    try {
      const s = await buildCarousel(idea, state.settings, experienceType)
      dispatch({ type: 'SET_SLIDES', slides: s })
    } catch {}
    setLoading(false)
  }

  // All hooks must be at the top — before any early returns
  useEffect(() => {
    if (experienceType && !slides.length) {
      generateSlides()
    }
  }, [experienceType])

  // Early returns after all hooks
  if (!experienceType) {
    return <ExperienceTypeSelector />
  }

  function updateSlide(index: number, updated: CarouselSlide) {
    dispatch({ type: 'UPDATE_SLIDE', index, slide: updated })
  }

  if (!idea) {
    return (
      <div className="flex-1 flex items-center justify-center p-5 text-center">
        <button onClick={() => goTo('idea-spark')} className="px-4 py-2 bg-orange-500 text-black rounded-xl font-bold text-sm">
          Start over
        </button>
      </div>
    )
  }

  if (loading) {
    const expConfig = EXPERIENCE_TYPES.find(e => e.type === experienceType)
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message={`Building your ${expConfig?.label ?? ''} carousel...`} />
      </div>
    )
  }

  const expConfig = EXPERIENCE_TYPES.find(e => e.type === experienceType)

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white">Carousel Builder</h1>
            <span className="text-lg">{expConfig?.emoji}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded-full font-medium">
              {expConfig?.label}
            </span>
            <button
              onClick={() => dispatch({ type: 'SET_EXPERIENCE_TYPE', experienceType: experienceType })}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              change type
            </button>
          </div>
        </div>

        <div className="mb-4 p-3 bg-zinc-900/60 border border-zinc-800/60 rounded-xl">
          <p className="text-xs text-zinc-400 italic leading-relaxed">"{expConfig?.tagline}"</p>
        </div>

        <div className="space-y-3">
          {slides.map((slide, i) => (
            <SlideCard
              key={slide.slide_number}
              slide={slide}
              index={i}
              onUpdate={(updated) => updateSlide(i, updated)}
            />
          ))}
        </div>

        {slides.length > 0 && (
          <button
            onClick={() => { dispatch({ type: 'SET_SLIDES', slides: [] }); generateSlides() }}
            className="w-full mt-4 py-3 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            Regenerate all slides
          </button>
        )}
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={() => goTo('interaction-optimiser')}
          disabled={!slides.length}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-98 ${
            slides.length
              ? 'bg-orange-500 hover:bg-orange-400 text-black'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          Optimise interaction →
        </button>
      </div>
    </div>
  )
}
