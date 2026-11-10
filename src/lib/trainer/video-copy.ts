/**
 * The words of the video phase (Phase 2 of "Trainer and training plan"):
 * members' form checks, the trainer's video notes and own videos, the Meet
 * the trainer page, the answers library, sharing an answer, the ready replies
 * and the results page's proof. Scripted, one file, in the review pack
 * (`videoCopyRows`).
 *
 * Nothing here says what training does for anyone's health. The pain reply
 * points to a GP or physio and gives no advice of its own.
 */
export const VIDEO_COPY = {
  /* ── A member's form check ── */
  formCheck: 'Send a form check',
  formCheckHint: 'A clip of up to 30 seconds from your phone. Film from the side, whole body in view.',
  formCheckConsent: (name: string) => `Only ${name} and the team who run your hub can watch it. It’s deleted after 30 days.`,
  formCheckAgree: 'I’m happy to send it',
  formCheckTooLong: 'That clip is longer than 30 seconds. Trim it on your phone, then try again.',
  formCheckLimit: 'That’s three form checks today. Send another tomorrow.',
  formCheckUploading: (pct: number) => `Uploading ${pct}%`,
  formCheckReady: 'Clip ready. Add a line about what you’d like checked, then send.',
  formCheckRemove: 'Remove clip',
  formCheckPrefill: 'Can you check my form on this? ',
  formCheckLabel: 'Your form check',
  formCheckGone: 'This clip was deleted after 30 days.',
  formCheckUntil: (date: string) => `Kept until ${date}`,

  /* ── The trainer's video note, and their own videos ── */
  videoNote: (name: string) => `A video from ${name}`,
  welcomeVideo: (name: string) => `${name} says hello`,
  introVideo: (name: string) => `Meet ${name}`,

  /* ── Meet the trainer ── */
  aboutTitle: (name: string) => `About ${name}`,
  aboutLink: (name: string) => `About ${name}`,
  aboutReply: (hours: number) => `Answers within ${hours} hours`,
  aboutChecks: 'Checks every new and rebuilt training plan',
  aboutAsk: (name: string) => `Ask ${name} a question`,
  aboutBack: 'Back to your questions',
  aboutRealPerson: 'Every answer is written by them, never by AI.',

  /* ── The answers library ── */
  libraryTitle: 'Asked before',
  libraryLine: (name: string) => `Questions other members have asked, answered by ${name}. Rewritten without anyone’s details.`,
  librarySearch: 'Search the answers',
  libraryEmpty: 'Nothing on that yet. Ask below.',
  libraryMore: (n: number) => `Show ${n} more`,

  /* ── Sharing an answer ── */
  shareAsk: 'Happy for us to show this question and answer on our site, without your name?',
  shareYes: 'Yes, share it',
  shareNo: 'No thanks',
  shareDone: 'Thanks. You can change your mind here at any time.',
  shareUndo: 'Don’t share it',
  shareNoDone: 'Kept private.',

  /* ── The ready reply for pain (Founders Hub) ── */
  painFlag: 'Mentions pain or an injury: the ready reply points them to a GP or physio.',
  painReplyTitle: 'Pain or injury: see a GP or physio',
  painReply:
    'Thanks for telling me. Pain is one for a GP or a physio rather than me, so please book in with one before you train that area again. In the meantime, leave out anything that hurts. Once they’ve seen you, tell me what they said and I’ll change your plan to match.',

  /* ── The results page's proof ── */
  proofQualified: (q: string) => `Qualified: ${q}`,
  proofReply: (hours: number) => `Usually answers in about ${hours < 1 ? 'an hour' : hours < 24 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`}`,
  proofReplyNote: (n: number) => `Measured over the last ${n} answers.`,
  proofExchange: 'A real question from a member',
  proofExchangeNote: 'Shared with their permission, without their name.',
  proofMembers: (n: number) => `${n} members training with a plan`,
  proofWorkout: 'Workout mode: a set at a time, with a rest timer and last time’s numbers.',
  proofWatch: (name: string) => `Watch ${name}’s hello`,
}
