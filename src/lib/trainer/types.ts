/** Ask your trainer: a thread per member, a real person answering. */

export interface TrainerVideo {
  /** https on YouTube or Vimeo (`cleanTutorialUrl`), or `/api/media/<id>` for our own storage. */
  url: string
  title: string | null
  /** Our own storage (`lib/media`): a member's form check or the trainer's video note. */
  media?: string | null
  /** A form check is deleted after this. */
  until?: string | null
}

/** What a question is about, as the trainer sorts it. "pain" offers the ready reply that points to a GP or physio. */
export type TriageTag = 'form' | 'plan' | 'pain' | 'kit' | 'other'
export const TRIAGE_TAGS: TriageTag[] = ['form', 'plan', 'pain', 'kit', 'other']

/** A question and answer the trainer rewrote without anything that could identify the member, shown before asking. */
export interface LibraryEntry {
  id: string
  about: string | null
  question: string
  answer: string
  at: string
}

/**
 * Where a question was asked from (workout mode, an exercise, the plan), so
 * the member never has to explain the setup and the trainer never asks back.
 */
export interface MessageContext {
  set: number | null
  of: number | null
  kg: number | null
  reps: number | null
  felt: 'easy' | 'right' | 'hard' | null
}

export interface TrainerMessage {
  id: string
  from: 'member' | 'trainer'
  text: string
  at: string
  /** What it's about, as they chose it: an exercise or session from their plan. */
  about: string | null
  /** A video with an answer. */
  video: TrainerVideo | null
  /** Which founder sent an answer: the Founders Hub's record, never shown to the member. */
  by?: string | null
  /** The set it was asked from, with its numbers. */
  context?: MessageContext | null
  /** The member's rating of an answer. */
  rating?: 'helpful' | 'not-quite' | null
  /** A message the trainer wrote once for everyone, or about a change to the plan. */
  kind?: 'welcome' | 'plan-note' | 'change' | null
  /** The trainer's sorting of a question (Founders Hub only). */
  tag?: TriageTag | null
  /** On an answer: the member said yes to showing this question and answer, without their name. */
  shareOk?: boolean | null
}

export interface TrainerThread {
  v: 1
  userId: string
  email: string
  firstName: string | null
  messages: TrainerMessage[]
  /** The member's last message has no answer yet. */
  waiting: boolean
  lastAt: string
  memberReadAt: string | null
  trainerReadAt: string | null
}

/** The trainer as members see them. */
export interface PublicTrainer {
  name: string
  role: string
  bio: string
  photoUrl: string | null
  replyHours: number
  /** They check every new or rebuilt training plan. */
  checksPlans: boolean
  /** The days they answer ("Monday to Friday"), when stated. */
  answersOn?: string | null
  /** The qualifications they actually hold, once confirmed. */
  qualifications?: string | null
  /** Their own videos (video phase on): a short intro, and the welcome on a member's first visit. */
  introVideo?: string | null
  welcomeVideo?: string | null
}

/** `GET /api/hub/trainer`. */
export interface MemberTrainerView {
  /** Switched on, someone named. False: the hub says nothing about it. */
  live: boolean
  /** Their hub is open, so they can ask. */
  open: boolean
  trainer: PublicTrainer | null
  messages: Omit<TrainerMessage, 'by'>[]
  waiting: boolean
  /** Questions they can still send today. */
  left: number
  dailyLimit: number
  /** Answers since they last looked. */
  unread: number
  /** The trainer has opened the thread since their last question. */
  readByTrainer?: boolean
  /** The measured reply time: the median over the last 30 days, once there are enough answers to say. */
  replyStat?: { medianHours: number; answered: number } | null
  /** The coaching tools are on: ratings and context. */
  coaching?: boolean
  /** Video is on: they can send a form check, and see the answers library. */
  video?: boolean
  /** Questions answered before, rewritten without anyone's details (video on). */
  library?: LibraryEntry[]
}

/** A row of the Founders Hub's inbox. */
export interface InboxRow {
  userId: string
  email: string
  firstName: string | null
  waiting: boolean
  /** When their oldest unanswered question came in. */
  waitingSince: string | null
  lastAt: string
  preview: string
  messages: number
  /** New from the member since a founder last opened it. */
  unread: boolean
  /** An AI draft is waiting for the fitness expert (AI drafts on). */
  drafted?: boolean
}
