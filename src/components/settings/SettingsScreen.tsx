'use client'

import { useState } from 'react'
import { useAppState } from '@/lib/store'
import { DEFAULT_SETTINGS } from '@/lib/mock-data'
import type { InteractionGoal } from '@/lib/types'
import Link from 'next/link'

const INTERACTION_GOALS: InteractionGoal[] = ['comments', 'shares', 'saves', 'tags', 'follows', 'debate', 'relatability', 'swipe-through']

export function SettingsScreen() {
  const { state, dispatch } = useAppState()
  const [saved, setSaved] = useState(false)
  const s = state.settings

  function update(key: string, value: unknown) {
    dispatch({ type: 'UPDATE_SETTINGS', settings: { [key]: value } as any })
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    if (confirm('Reset all settings to CHRGD defaults?')) {
      dispatch({ type: 'UPDATE_SETTINGS', settings: DEFAULT_SETTINGS })
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="sticky top-0 z-50 flex items-center h-14 px-5 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60">
        <Link href="/" className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors -ml-1 mr-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-base font-bold text-white flex-1">Settings</h1>
        <button
          onClick={handleReset}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1"
        >
          Reset
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-8 pb-24">
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Brand</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-zinc-300 font-medium block mb-1.5">Brand voice</label>
              <textarea
                value={s.brandVoice}
                onChange={(e) => update('brandVoice', e.target.value)}
                className="w-full h-24 bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm text-white resize-none outline-none"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-300 font-medium block mb-1.5">Target audience</label>
              <textarea
                value={s.targetAudience}
                onChange={(e) => update('targetAudience', e.target.value)}
                className="w-full h-20 bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm text-white resize-none outline-none"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Content defaults</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-zinc-300 font-medium block mb-1.5">Default interaction goal</label>
              <div className="flex flex-wrap gap-2">
                {INTERACTION_GOALS.map((goal) => (
                  <button
                    key={goal}
                    onClick={() => update('defaultInteractionGoal', goal)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      s.defaultInteractionGoal === goal
                        ? 'bg-orange-500 text-black'
                        : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-zinc-300 font-medium block mb-1.5">
                Minimum idea score
                <span className="ml-2 text-orange-400 font-bold">{s.minimumIdeaScore}</span>
              </label>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={s.minimumIdeaScore}
                onChange={(e) => update('minimumIdeaScore', Number(e.target.value))}
                className="w-full accent-orange-500"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>50</span><span>95</span>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Safety</h2>
          <div>
            <label className="text-sm text-zinc-300 font-medium block mb-1.5">Claim safety rules</label>
            <textarea
              value={s.claimSafetyRules}
              onChange={(e) => update('claimSafetyRules', e.target.value)}
              className="w-full h-24 bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm text-white resize-none outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-300 font-medium block mb-1.5">Banned phrases (one per line)</label>
            <textarea
              value={s.bannedPhrases.join('\n')}
              onChange={(e) => update('bannedPhrases', e.target.value.split('\n').filter(Boolean))}
              className="w-full h-20 bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm text-white resize-none outline-none"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Google Sheets</h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-zinc-300 font-medium block mb-1.5">Sheet ID</label>
              <input
                type="text"
                value={s.googleSheetId}
                onChange={(e) => update('googleSheetId', e.target.value)}
                placeholder="From your Google Sheets URL"
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              />
              <p className="text-xs text-zinc-600 mt-1">Set via GOOGLE_SHEET_ID env var for production</p>
            </div>
            <div>
              <label className="text-sm text-zinc-300 font-medium block mb-1.5">Sheet tab name</label>
              <input
                type="text"
                value={s.sheetTabName}
                onChange={(e) => update('sheetTabName', e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">AI</h2>
          <div>
            <label className="text-sm text-zinc-300 font-medium block mb-1.5">OpenAI model</label>
            <select
              value={s.openAIModel}
              onChange={(e) => update('openAIModel', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-sm text-white outline-none"
            >
              <option value="gpt-4o">gpt-4o (recommended)</option>
              <option value="gpt-4o-mini">gpt-4o-mini (faster/cheaper)</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
            </select>
            <p className="text-xs text-zinc-600 mt-1">Set OPENAI_API_KEY in .env.local to enable live AI</p>
          </div>
        </section>

        <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-300">Mock mode active</span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            The app is running with mock data. Add <code className="text-orange-400">OPENAI_API_KEY</code> to .env.local to enable live AI generation, and configure Google Sheets credentials for real exports.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60">
        <button
          onClick={handleSave}
          className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-bold text-base transition-all"
        >
          {saved ? '✓ Saved' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
