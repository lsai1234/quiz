/**
 * The words around an AI draft (Founders Hub → Trainer). Scripted, one file,
 * in the review pack (`draftCopyRows`).
 *
 * A draft is never written by AI. For a question, it is one of the fitness
 * expert's own saved replies or answers-library entries, picked by AI. For a
 * form check, it is the lines below with the exercise's own listed mistakes and
 * cues from the library, ticked by AI. Nothing reaches a member until the
 * fitness expert presses Answer.
 */
export const DRAFT_COPY = {
  /* ── A form-check draft, as the member would read it ── */
  formOpen: 'Thanks for filming this.',
  formSeen: 'From what I can see, watch for this:',
  formTry: 'Try this next time:',
  formClean: 'It looks solid from what I can see. Keep these in mind:',
  formAgain: 'Film it again after a session or two and send it over.',
  formUnclear: 'I can’t see enough to check it properly. Could you film it again side-on, with your whole body in the frame?',

  /* ── In the inbox, for the fitness expert ── */
  badge: 'Draft ready',
  noteTitle: 'AI draft: check it before you answer',
  fromPain: 'The ready reply for a question that mentions pain. No AI was used.',
  fromSaved: (title: string) => `Your saved reply “${title}”, picked by AI.`,
  fromLibrary: (question: string) => `Your answers-library entry “${question}”, picked by AI.`,
  fromForm: (exercise: string) => `Built from the ${exercise} cues and mistakes in the library, ticked by AI from stills of the clip.`,
  fromUnclear: 'AI couldn’t see enough in the stills, so this asks for another clip.',
  noteNothingSent: 'Nothing has been sent. Edit it, or write your own, then press Answer.',
  discard: 'Clear the draft',

  /* ── Settings → Trainer ── */
  settingLabel: 'AI drafts',
  settingHint:
    'AI prepares a draft for each new question from your saved replies and answers library, and for each form check from the exercise’s cues and mistakes. It never writes its own advice, and nothing is sent until you press Answer. Questions that mention pain get the ready GP-or-physio reply instead; questions that look medical get no draft.',

  /* ── The member's form-check consent, while AI drafts are on ── */
  consentAi: (name: string) =>
    `Only ${name} and the team who run your hub can watch it. It’s deleted after 30 days. A few stills from it go to our AI provider to help ${name} prepare an answer.`,
}
