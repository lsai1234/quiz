/** Ask your trainer's words: rows for the review pack. */
import type { ReviewRow } from '@/lib/consult/review-pack'
import { copyRows } from '@/lib/consult/copy-rows'
import { TRAINER_COPY } from './copy'
import { VIDEO_COPY } from './video-copy'
import { DRAFT_COPY } from './draft-copy'

export function trainerCopyRows(): ReviewRow[] {
  return copyRows(
    'Ask your trainer wording',
    'My Hub (/myhub/trainer and its card), each exercise, the results page’s hub, and the trainer emails. "[Name]" stands for the name set in Settings',
    TRAINER_COPY,
    {
      realLine: ['[Name]'],
      replyWithin: [48],
      intro: ['[Name]'],
      waiting: ['[Name]'],
      left: [3],
      tooLong: [1000],
      about: ['Barbell back squat'],
      askAbout: ['[Name]'],
      homeAnswered: ['[Name]'],
      homeWaiting: ['[Name]'],
      revealTitle: ['[Name]'],
      revealBody: ['[Name]'],
      replySubject: ['[Name]'],
      replyHeading: ['[Name]'],
      replyIntro: ['Alex', '[Name]'],
      questionSubject: ['Alex'],
      questionIntro: ['Alex', 'Barbell back squat'],
      planChecking: ['[Name]'],
      planCheckingLine: ['[Name]', 24],
      planChecked: ['[Name]'],
      planCheckedLine: ['[Name]'],
      askAboutPlan: ['[Name]'],
      revealChecked: ['[Name]'],
      planEmailSubject: ['[Name]'],
      planEmailIntro: ['Alex', '[Name]'],
      contextLine: [{ set: 2, of: 3, kg: 20, reps: 8, felt: 'hard' }],
      readBy: ['[Name]'],
      medianReply: [9],
      answersOn: ['[Name]', 'Monday to Friday'],
      welcomeLabel: ['[Name]'],
      changeNote: ['Goblet squat', 'Fewer sets while your knee settles.'],
      qualifications: ['Level 3 Personal Trainer'],
    },
    { medical: 'Under the question box, and in the answer email', realPerson: 'Badge beside the trainer, everywhere they appear' },
  )
}

export function videoCopyRows(): ReviewRow[] {
  return copyRows(
    'Trainer video phase wording',
    'My Hub (/myhub/trainer, /myhub/trainer/about), the Founders Hub inbox’s ready reply, and the results page’s hub. "[Name]" stands for the name set in Settings',
    VIDEO_COPY,
    {
      formCheckConsent: ['[Name]'],
      formCheckUploading: [40],
      formCheckUntil: ['10 December'],
      videoNote: ['[Name]'],
      welcomeVideo: ['[Name]'],
      introVideo: ['[Name]'],
      aboutTitle: ['[Name]'],
      aboutLink: ['[Name]'],
      aboutReply: [24],
      aboutAsk: ['[Name]'],
      libraryLine: ['[Name]'],
      libraryMore: [5],
      proofQualified: ['Level 3 Personal Trainer'],
      proofReply: [9],
      proofReplyNote: [64],
      proofMembers: [120],
      proofWatch: ['[Name]'],
    },
  )
}

export function draftCopyRows(): ReviewRow[] {
  return copyRows(
    'AI drafts wording',
    'The Founders Hub inbox (a draft waiting beside a question), Founders Hub → Trainer’s switch, and the member’s form-check consent while AI drafts are on. A form-check draft is these lines with the exercise’s own cues and mistakes from the library. "[Name]" stands for the name set in Settings',
    DRAFT_COPY,
    {
      fromSaved: ['Squat depth'],
      fromLibrary: ['How deep should I squat?'],
      fromForm: ['Goblet squat'],
      consentAi: ['[Name]'],
    },
  )
}
