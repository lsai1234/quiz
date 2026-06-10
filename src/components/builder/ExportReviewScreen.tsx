'use client'

import { useEffect, useState } from 'react'
import { useAppState, useStageNavigation } from '@/lib/store'
import { prepareExportRow } from '@/lib/ai-service'
import { appendExportRow, getNextIdeaId } from '@/lib/sheets-service'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { RiskBadge } from '@/components/ui/RiskBadge'
import type { ExportRow } from '@/lib/types'

function FieldCard({ label, value, required }: { label: string; value: string | number | undefined; required?: boolean }) {
  const missing = required && !value
  return (
    <div className={`rounded-xl p-3 ${missing ? 'bg-red-500/10 border border-red-500/30' : 'bg-zinc-900 border border-zinc-800'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
        {missing && <span className="text-red-400 text-xs">Required</span>}
      </div>
      <p className={`text-sm leading-relaxed ${missing ? 'text-red-400 italic' : 'text-zinc-200'}`}>
        {value ? String(value) : 'Missing'}
      </p>
    </div>
  )
}

export function ExportReviewScreen() {
  const { state, dispatch } = useAppState()
  const { goTo } = useStageNavigation()
  const [loading, setLoading] = useState(!state.working.exportRow)
  const [exporting, setExporting] = useState(false)

  const idea = state.working.selectedIdea
  const row = state.working.exportRow
  const exportStatus = state.exportStatus
  const exportMessage = state.exportMessage

  useEffect(() => {
    if (!idea || row) return
    async function build() {
      setLoading(true)
      try {
        const nextId = await getNextIdeaId()
        const built = await prepareExportRow(
          idea!,
          state.working.slides,
          state.working.optimisation,
          state.working.visualDirection,
          state.working.claimSafety,
          nextId,
          state.working.experienceType
        )
        dispatch({ type: 'SET_EXPORT_ROW', row: built })
      } catch {}
      setLoading(false)
    }
    build()
  }, [])

  async function handleExport() {
    if (!row) return
    setExporting(true)
    try {
      const result = await appendExportRow(row)
      if (result.success) {
        dispatch({ type: 'SET_EXPORT_STATUS', status: 'success', message: `Exported as ${result.idea_id} — status: queued` })
        dispatch({ type: 'SAVE_DRAFT' })
      } else {
        dispatch({ type: 'SET_EXPORT_STATUS', status: 'error', message: result.error ?? 'Export failed' })
      }
    } catch (e) {
      dispatch({ type: 'SET_EXPORT_STATUS', status: 'error', message: 'Unexpected error during export' })
    }
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner message="Preparing export row..." />
      </div>
    )
  }

  if (exportStatus === 'success') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Exported!</h2>
          <p className="text-emerald-400 text-sm font-medium mb-1">{exportMessage}</p>
          <p className="text-zinc-400 text-sm">Your idea is now queued in Google Sheets. n8n will pick it up shortly.</p>
        </div>
        <button
          onClick={() => { dispatch({ type: 'NEW_IDEA' }); window.location.href = '/' }}
          className="mt-4 w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 text-black font-bold text-base"
        >
          Create another idea →
        </button>
      </div>
    )
  }

  if (!row) return null

  const requiredFields: (keyof ExportRow)[] = ['idea_id', 'content_category', 'target_viewer', 'slide_1_hook', 'slide_5_cta']
  const hasAllRequired = requiredFields.every((f) => Boolean(row[f]))

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Export Review</h1>
          <p className="text-zinc-400 text-sm">Final check before sending to Google Sheets</p>
        </div>

        {exportStatus === 'error' && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
            {exportMessage}
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Status</span>
            <span className="text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded-full">
              {row.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Idea ID</span>
            <span className="text-xs font-mono text-orange-400">{row.idea_id}</span>
          </div>
        </div>

        {row.claim_risk && (
          <div className="flex items-center gap-2 p-3 bg-zinc-900/60 rounded-xl border border-zinc-800/60">
            <span className="text-xs text-zinc-500">Claim risk:</span>
            <RiskBadge risk={row.claim_risk} />
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Content fields</h3>
          <FieldCard label="Title" value={row.title} required />
          <FieldCard label="Category" value={row.content_category} required />
          <FieldCard label="Target viewer" value={row.target_viewer} required />
          <FieldCard label="Experience type" value={row.experience_type} />
          <FieldCard label="Pain point" value={row.pain_point} />
          <FieldCard label="Core tension" value={row.core_tension} />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Caption</h3>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">{row.caption || `${row.caption_angle}\n\n${row.comment_trigger}\n\n${row.hashtags_hint}`}</p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Slides</h3>
          <FieldCard label="Slide 1 hook" value={row.slide_1_hook} required />
          <FieldCard label="Slide 2" value={row.slide_2_problem} />
          <FieldCard label="Slide 3" value={row.slide_3_mechanism} />
          <FieldCard label="Slide 4" value={row.slide_4_takeaway} />
          <FieldCard label="Slide 5 CTA" value={row.slide_5_cta} required />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Visual direction</h3>
          <FieldCard label="Visual style" value={row.visual_style_hint} />
          <FieldCard label="Text position" value={row.preferred_text_position} />
          <FieldCard label="Text density" value={row.text_density} />
        </div>

        <div className="p-3 bg-zinc-900/60 border border-zinc-800/60 rounded-xl">
          <p className="text-xs text-zinc-500 leading-relaxed">
            A new row will be appended to your Google Sheet. Status will be set to <strong className="text-zinc-300">queued</strong>. No existing rows will be overwritten.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 px-5 pb-8 pt-4 bg-zinc-950 border-t border-zinc-800/60 space-y-3">
        {!hasAllRequired && (
          <p className="text-xs text-red-400 text-center">Some required fields are missing. Go back to fill them in.</p>
        )}
        <button
          onClick={handleExport}
          disabled={!hasAllRequired || exporting}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-98 ${
            hasAllRequired && !exporting
              ? 'bg-orange-500 hover:bg-orange-400 text-black'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {exporting ? 'Exporting...' : 'Export to Google Sheets →'}
        </button>
      </div>
    </div>
  )
}
