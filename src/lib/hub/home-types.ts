/**
 * What `/api/hub/home` answers with: everything the member hub's home screen
 * shows, in one request. Types only, safe in the browser.
 */
import type { HubAccess } from './access'
import type { Tip } from '@/lib/tips/library'

export interface TodayItem {
  productId: string
  title: string
  /** "7:30am", or null for a moment with no time of its own. */
  time: string | null
  /** Minutes past midnight, for ordering; null when untimed. */
  minutes: number | null
  moment: string
  amount: string
  done: boolean
}

export interface GuideProductLite {
  id: string
  /** Its kind (swap group), for the storing and mixing tips and questions. */
  kind: string | null
  short: string
  title: string
  type: string
  imageUrl: string | null
  time: string | null
  moment: string
  daysLabel: string
  amount: string
  serving: string | null
  claims: { text: string; condition: string | null }[]
  warnings: string[]
}

export interface HubHome {
  access: HubAccess
  firstName: string | null
  /** What the founders have switched on. */
  services: { training: boolean; deals: boolean; checkIns: boolean }
  /** Today's products on their day, ticked off as they go; null without a guide. */
  today: { date: string; items: TodayItem[] } | null
  guide: { token: string; stackName: string | null; products: GuideProductLite[] } | null
  checkIn: { token: string; nextDue: string | null; due: boolean; answered: number; stopped: boolean } | null
  tips: Tip[]
  training: {
    hasPlan: boolean
    next: { title: string; day: number; summary: string } | null
    done: number
    planned: number
    /** Each session's day and whether it's done, for the week strip. */
    week: { day: number; done: boolean }[]
  } | null
  deals: { open: number; upcoming: number; next: { short: string; line: string; opensInDays: number } | null; best: { short: string; line: string; total: number } | null } | null
  orders: { reference: string; createdAt: string; total: number; items: string[]; status: string }[]
}
