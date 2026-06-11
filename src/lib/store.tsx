'use client'

import { create } from 'zustand'
import type { QuizAnswers, StackIdentity, Product, StackLevel } from './types'

interface QuizStore {
  step: number
  answers: QuizAnswers
  identity: StackIdentity | null
  stackLevel: StackLevel
  selectedProducts: Product[]

  // Collector state
  collectorCapsules: number
  collectorStepCounts: Record<number, number>
  collectorPouring: boolean

  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  setGoals: (goals: QuizAnswers['goals']) => void
  setAnswer: <K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) => void
  setIdentity: (identity: StackIdentity) => void
  setStackLevel: (level: StackLevel) => void
  setSelectedProducts: (products: Product[]) => void
  toggleProduct: (product: Product) => void
  reset: () => void

  // Collector actions
  addCollectorCapsules: (step: number, count: number) => void
  removeCollectorCapsulesForStep: (step: number) => void
  startCollectorPour: () => void
  resetCollector: () => void
}

const defaultAnswers: QuizAnswers = {
  goals: [],
  trainingFrequency: null,
  trainingType: null,
  lifestyle: [],
  diet: null,
  currentSupplements: [],
  caffeineLevel: null,
  budget: null,
  stackPreference: null,
  trainingExperience: null,
  trainingFocus: null,
  stimPreference: null,
}

export const useQuizStore = create<QuizStore>((set) => ({
  step: 0,
  answers: defaultAnswers,
  identity: null,
  stackLevel: 'performance',
  selectedProducts: [],

  collectorCapsules: 0,
  collectorStepCounts: {},
  collectorPouring: false,

  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: s.step + 1 })),
  prevStep: () => set((s) => ({ step: Math.max(0, s.step - 1) })),

  setGoals: (goals) =>
    set((s) => ({ answers: { ...s.answers, goals } })),

  setAnswer: (key, value) =>
    set((s) => ({ answers: { ...s.answers, [key]: value } })),

  setIdentity: (identity) => set({ identity }),
  setStackLevel: (level) => set({ stackLevel: level }),
  setSelectedProducts: (products) => set({ selectedProducts: products }),

  toggleProduct: (product) =>
    set((s) => {
      const exists = s.selectedProducts.some(p => p.id === product.id)
      return {
        selectedProducts: exists
          ? s.selectedProducts.filter(p => p.id !== product.id)
          : [...s.selectedProducts, product],
      }
    }),

  reset: () => set({
    step: 0, answers: defaultAnswers, identity: null, selectedProducts: [],
    collectorCapsules: 0, collectorStepCounts: {}, collectorPouring: false,
  }),

  addCollectorCapsules: (step, count) =>
    set((s) => {
      const newCounts = { ...s.collectorStepCounts, [step]: (s.collectorStepCounts[step] ?? 0) + count }
      return {
        collectorStepCounts: newCounts,
        collectorCapsules: Object.values(newCounts).reduce((a, b) => a + b, 0),
      }
    }),

  removeCollectorCapsulesForStep: (step) =>
    set((s) => {
      const newCounts = { ...s.collectorStepCounts }
      delete newCounts[step]
      return {
        collectorStepCounts: newCounts,
        collectorCapsules: Object.values(newCounts).reduce((a, b) => a + b, 0),
      }
    }),

  startCollectorPour: () => set({ collectorPouring: true }),

  resetCollector: () => set({ collectorCapsules: 0, collectorStepCounts: {}, collectorPouring: false }),
}))
