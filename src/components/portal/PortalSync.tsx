'use client'

import { useEffect } from 'react'
import { setDataSourceOverride, type DataSourceMode } from '@/lib/data-source'
import { setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { setQuizArm } from '@/lib/experiments/client'
import type { QuizArm, QuizExperimentConfig } from '@/lib/experiments/assignment'

/**
 * Mirrors the portal's runtime config (data-source mode + pricing overrides)
 * into the client so the customer-facing quiz/hub reflect portal edits, and
 * carries the visitor's quiz arm across with it. Mounted once in the root
 * layout; reads the public /api/config.
 *
 * The arm rides on this existing call on purpose — it means the quiz experiment
 * costs no extra request, and resolves while the visitor is still on the hero.
 * If the call fails the arm stays at its default of v1, which is the whole
 * fallback story: an experiment must never be the reason a quiz breaks.
 */
export function PortalSync() {
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: {
        dataSourceMode?: DataSourceMode
        pricingOverrides?: Record<string, unknown>
        quizArm?: QuizArm
        quizAiSteer?: boolean
        quizBudget?: QuizExperimentConfig['budget']
      }) => {
        if (data.dataSourceMode) setDataSourceOverride(data.dataSourceMode)
        if (data.pricingOverrides) setPricingOverrides(data.pricingOverrides)
        if (data.quizArm === 'v1' || data.quizArm === 'v2') {
          setQuizArm({
            arm: data.quizArm,
            ...(typeof data.quizAiSteer === 'boolean' ? { aiSteer: data.quizAiSteer } : {}),
            ...(data.quizBudget ? { budget: data.quizBudget } : {}),
          })
        }
      })
      .catch(() => { /* non-critical */ })
  }, [])
  return null
}
