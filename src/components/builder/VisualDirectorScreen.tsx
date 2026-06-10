'use client'

import { useEffect, useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { generateVisualDirection } from '@/lib/ai-service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const RISK_COLORS = {
  low: 'text-emerald-400 bg-emerald-500/10',
  medium: 'text-amber-400 bg-amber-500/10',
  high: 'text-red-400 bg-red-500/10',
}

function RiskPill({ level }: { level: string }) {
  const color = RISK_COLORS[level as keyof typeof RISK_COLORS] ?? RISK_COLORS.low
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}>{level}</span>
}

export function VisualDirectorScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [loading, setLoading] = useState(!state.working.visualDirection)

  const idea = state.working.selectedIdea
  const slides = state.working.slides
  const vd = state.working.visualDirection

  useEffect(() => {
    if (!idea || vd) return
    generateVisualDirection(slides, idea, state.settings)
      .then((r) => dispatch({ type: 'SET_VISUAL_DIRECTION', result: r }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRegenerate() {
    if (!idea) return
    setLoading(true)
    dispatch({ type: 'SET_VISUAL_DIRECTION', result: null as any })
    try {
      const r = await generateVisualDirection(slides, idea, state.settings)
      dispatch({ type: 'SET_VISUAL_DIRECTION', result: r })
    } catch {}
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message="Generating visual direction..." />
      </div>
    )
  }

  if (!vd) return null

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Visual Director</h1>
          <p className="text-zinc-400 text-sm">Visual system for your image pipeline</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-2.5">Visual style hint</div>
          <p className="text-sm text-zinc-200 leading-relaxed">{vd.visual_style_hint}</p>
        </div>

        <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4">
          <div className="text-xs text-orange-400 uppercase tracking-wider font-medium mb-2.5">Double-take detail ✨</div>
          <p className="text-sm text-zinc-200 leading-relaxed">{vd.double_take_detail}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'AI Visual Priority', value: vd.ai_visual_priority },
            { label: 'Safe Zone Priority', value: vd.safe_zone_priority },
            { label: 'Text Density', value: vd.text_density },
            { label: 'Layout Risk', value: vd.layout_risk },
            { label: 'Platform UI Risk', value: vd.platform_ui_risk },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-900 rounded-xl p-3">
              <div className="text-xs text-zinc-500 mb-1.5">{label}</div>
              <RiskPill level={value} />
            </div>
          ))}
          <div className="bg-zinc-900 rounded-xl p-3">
            <div className="text-xs text-zinc-500 mb-1.5">Text Position</div>
            <span className="text-xs text-zinc-200 font-medium capitalize">{vd.preferred_text_position}</span>
          </div>
        </div>

        <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl flex items-start gap-2.5">
          <span className="text-lg shrink-0">💡</span>
          <p className="text-xs text-zinc-400 leading-relaxed">
            This visual direction feeds directly into your n8n image pipeline fields. Avoid generic gym stock — the double-take detail is what makes it stop-scroll.
          </p>
        </div>

        <button
          onClick={handleRegenerate}
          className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors"
        >
          Regenerate visual direction
        </button>
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={() => goTo('claim-safety')}
          className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-bold text-base transition-all active:scale-98"
        >
          Check claim safety →
        </button>
      </div>
    </div>
  )
}
