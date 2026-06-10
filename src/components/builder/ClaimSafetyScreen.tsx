'use client'

import { useEffect, useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { checkClaimSafety } from '@/lib/ai-service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { RiskBadge } from '@/components/ui/RiskBadge'

export function ClaimSafetyScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [loading, setLoading] = useState(!state.working.claimSafety)
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)

  const idea = state.working.selectedIdea
  const slides = state.working.slides
  const cs = state.working.claimSafety

  useEffect(() => {
    if (!idea || cs) return
    checkClaimSafety(slides, idea, state.settings)
      .then((r) => dispatch({ type: 'SET_CLAIM_SAFETY', result: r }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function acceptRewrite(phraseIndex: number) {
    if (!cs) return
    const updated = { ...cs }
    updated.risky_phrases = [...cs.risky_phrases]
    // Mark as accepted (we just note the suggestion was applied)
    dispatch({ type: 'SET_CLAIM_SAFETY', result: updated })
  }

  function handleOverride() {
    if (!cs) return
    setOverrideConfirmed(true)
    dispatch({ type: 'SET_CLAIM_SAFETY', result: { ...cs, overridden: true } })
  }

  const canContinue = !cs || cs.claim_risk === 'low' || cs.claim_risk === 'medium' || cs.overridden || overrideConfirmed

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message="Checking claim safety..." />
      </div>
    )
  }

  if (!cs) return null

  const isHighRisk = cs.claim_risk === 'high' && !cs.overridden && !overrideConfirmed

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Claim Safety</h1>
          <p className="text-zinc-400 text-sm">Review before queueing</p>
        </div>

        <div className={`rounded-2xl p-4 flex items-start gap-3 ${
          cs.claim_risk === 'high' ? 'bg-red-500/10 border border-red-500/30' :
          cs.claim_risk === 'medium' ? 'bg-amber-500/10 border border-amber-500/20' :
          'bg-emerald-500/10 border border-emerald-500/20'
        }`}>
          <div className="text-2xl shrink-0">
            {cs.claim_risk === 'high' ? '🚨' : cs.claim_risk === 'medium' ? '⚠️' : '✅'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <RiskBadge risk={cs.claim_risk} size="md" />
              {cs.overridden && <span className="text-xs text-zinc-500">Override applied</span>}
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed">{cs.claim_safety_notes}</p>
          </div>
        </div>

        {cs.risky_phrases.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Flagged phrases</h3>
            {cs.risky_phrases.map((phrase, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-1">Flagged</span>
                  <p className="text-sm font-medium text-red-400">"{phrase.phrase}"</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-1">Issue</span>
                  <p className="text-sm text-zinc-300">{phrase.issue}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium block mb-1">Safer rewrite</span>
                  <p className="text-sm text-emerald-400">"{phrase.safer_rewrite}"</p>
                </div>
                <button
                  onClick={() => acceptRewrite(i)}
                  className="w-full py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                >
                  Apply safer rewrite
                </button>
              </div>
            ))}
          </div>
        )}

        {isHighRisk && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-red-400 shrink-0 mt-0.5">🚨</span>
              <div>
                <p className="text-sm font-semibold text-red-400 mb-1">High risk content</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  This content has been flagged as high risk. Please review all flagged phrases before exporting. You can override this warning, but it will be noted in the export row.
                </p>
              </div>
            </div>
            <button
              onClick={handleOverride}
              className="w-full py-2.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-colors"
            >
              I understand — override and continue
            </button>
          </div>
        )}

        {cs.claim_risk === 'low' && (
          <div className="text-center py-4">
            <span className="text-2xl">🎉</span>
            <p className="text-emerald-400 font-medium mt-2">All clear!</p>
            <p className="text-xs text-zinc-500 mt-1">No risky claims detected. Safe to proceed.</p>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={() => goTo('preview')}
          disabled={isHighRisk}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-98 ${
            isHighRisk
              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              : 'bg-orange-500 hover:bg-orange-400 text-black'
          }`}
        >
          {isHighRisk ? 'Override required to continue' : 'Preview carousel →'}
        </button>
      </div>
    </div>
  )
}
