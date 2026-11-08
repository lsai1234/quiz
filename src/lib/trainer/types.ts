/** Ask your trainer: a thread per member, a real person answering. */

export interface TrainerVideo {
  /** https, on YouTube, Vimeo or our own storage (`cleanTutorialUrl`). */
  url: string
  title: string | null
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
}
