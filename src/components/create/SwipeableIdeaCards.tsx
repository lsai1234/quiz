'use client'

import { useState, useRef } from 'react'
import type { ContentIdea } from '@/lib/types'
import { useAppState, useStageNavigation } from '@/lib/store'
import { RiskBadge } from '@/components/ui/RiskBadge'

const INTERACTION_ICONS: Record<string, string> = {
  comments: '💬', shares: '📤', saves: '🔖', tags: '👥',
  follows: '➕', debate: '⚡', relatability: '🤝', 'swipe-through': '👆',
}

function IdeaCard({ idea, onDevelop, onSave, onReject, isFront }: {
  idea: ContentIdea
  onDevelop: () => void
  onSave: () => void
  onReject: () => void
  isFront: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState(0)
  const startX = useRef(0)
  const isDragging = useRef(false)

  const rotate = dragX * 0.04
  const opacity = 1 - Math.abs(dragX) / 400

  function onPointerDown(e: React.PointerEvent) {
    if (!isFront) return
    isDragging.current = true
    startX.current = e.clientX
    cardRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging.current) return
    setDragX(e.clientX - startX.current)
  }

  function onPointerUp() {
    if (!isDragging.current) return
    isDragging.current = false
    if (dragX > 120) onDevelop()
    else if (dragX < -120) onReject()
    setDragX(0)
  }

  return (
    <div
      ref={cardRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute inset-0 bg-zinc-900 border border-zinc-700/60 rounded-3xl p-5 flex flex-col select-none ${isFront ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
      style={{
        transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
        opacity,
        transition: isDragging.current ? 'none' : 'transform 0.3s ease, opacity 0.3s ease',
        zIndex: isFront ? 10 : 5,
        scale: isFront ? '1' : '0.96',
      }}
    >
      {dragX > 60 && (
        <div className="absolute top-5 left-5 bg-emerald-500 text-white text-sm font-bold px-3 py-1 rounded-full rotate-[-12deg] z-10">
          DEVELOP ✓
        </div>
      )}
      {dragX < -60 && (
        <div className="absolute top-5 right-5 bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full rotate-[12deg] z-10">
          SKIP ✗
        </div>
      )}

      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-xs font-medium text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
          {idea.content_category}
        </span>
        <RiskBadge risk={idea.claim_risk_initial} />
      </div>

      <h3 className="text-lg font-bold text-white leading-tight mb-3">{idea.title}</h3>

      <p className="text-zinc-300 text-sm leading-relaxed mb-4 flex-1">
        "{idea.hook}"
      </p>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="text-zinc-600">Target</span>
          <span className="text-zinc-300">{idea.target_viewer}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className="text-zinc-600">Tension</span>
          <span className="text-zinc-300 italic">"{idea.core_tension}"</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5 bg-zinc-800 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-200">
          {INTERACTION_ICONS[idea.interaction_goal] || '🎯'}
          <span className="capitalize">{idea.interaction_goal}</span>
        </div>
        {idea.initial_score && (
          <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            idea.initial_score >= 90 ? 'bg-emerald-500/20 text-emerald-400' :
            idea.initial_score >= 80 ? 'bg-orange-500/20 text-orange-400' :
            'bg-amber-500/20 text-amber-400'
          }`}>
            {idea.initial_score}/100
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onReject}
          className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-medium transition-colors"
        >
          Skip
        </button>
        <button
          onClick={onSave}
          className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm transition-colors"
        >
          Save
        </button>
        <button
          onClick={onDevelop}
          className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black text-sm font-bold transition-colors"
        >
          Develop →
        </button>
      </div>
    </div>
  )
}

export function SwipeableIdeaCards() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [currentIndex, setCurrentIndex] = useState(0)
  const ideas = state.working.candidates

  if (!ideas.length) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">No ideas generated yet.</p>
          <button onClick={() => goTo('idea-spark')} className="px-4 py-2 bg-orange-500 text-black rounded-xl font-bold text-sm">
            Go back
          </button>
        </div>
      </div>
    )
  }

  function handleDevelop(idea: ContentIdea) {
    dispatch({ type: 'SELECT_IDEA', idea })
    goTo('pressure-test')
  }

  function handleSave() {
    dispatch({ type: 'SAVE_DRAFT' })
    if (currentIndex < ideas.length - 1) setCurrentIndex((i) => i + 1)
  }

  function handleReject() {
    if (currentIndex < ideas.length - 1) setCurrentIndex((i) => i + 1)
  }

  const remaining = ideas.length - currentIndex
  const current = ideas[currentIndex]
  const next = ideas[currentIndex + 1]

  if (!current) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-5 gap-6">
        <div className="text-5xl">🤔</div>
        <div className="text-center">
          <p className="text-white font-semibold mb-1">Out of ideas</p>
          <p className="text-zinc-400 text-sm">None quite right? Go back and refine your prompt.</p>
        </div>
        <button
          onClick={() => { setCurrentIndex(0) }}
          className="px-5 py-3 bg-zinc-800 text-white rounded-xl text-sm font-medium"
        >
          Review from start
        </button>
        <button
          onClick={() => goTo('idea-spark')}
          className="px-5 py-3 bg-orange-500 text-black rounded-xl text-sm font-bold"
        >
          New spark →
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Pick your idea</h1>
        <span className="text-xs text-zinc-500">{remaining} left</span>
      </div>
      <p className="px-5 text-xs text-zinc-500 mb-4">Swipe right to develop · Swipe left to skip</p>

      <div className="flex-1 relative px-5 pb-5 min-h-[420px]">
        {next && (
          <IdeaCard
            key={next.id}
            idea={next}
            onDevelop={() => handleDevelop(next)}
            onSave={handleSave}
            onReject={handleReject}
            isFront={false}
          />
        )}
        <IdeaCard
          key={current.id}
          idea={current}
          onDevelop={() => handleDevelop(current)}
          onSave={handleSave}
          onReject={handleReject}
          isFront={true}
        />
      </div>

      <div className="px-5 pb-6">
        <div className="flex gap-1 justify-center">
          {ideas.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${i === currentIndex ? 'w-6 bg-orange-500' : i < currentIndex ? 'w-2 bg-zinc-700' : 'w-2 bg-zinc-800'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
