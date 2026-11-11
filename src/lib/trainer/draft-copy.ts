/**
 * The words around an AI draft (Founders Hub → Trainer). Scripted, one file,
 * in the review pack (`draftCopyRows`).
 *
 * A draft is never written by AI: it is one of the fitness expert's own saved
 * replies or answers-library entries, picked by AI. Form checks get no AI.
 * Nothing reaches a member until the fitness expert presses Answer.
 */
export const DRAFT_COPY = {
  /* ── In the inbox, for the fitness expert ── */
  badge: 'Draft ready',
  noteTitle: 'AI draft: check it before you answer',
  fromPain: 'The ready reply for a question that mentions pain. No AI was used.',
  fromSaved: (title: string) => `Your saved reply “${title}”, picked by AI.`,
  fromLibrary: (question: string) => `Your answers-library entry “${question}”, picked by AI.`,
  noteNothingSent: 'Nothing has been sent. Edit it, or write your own, then press Answer.',
  discard: 'Clear the draft',

  /* ── Settings → Trainer ── */
  settingLabel: 'AI drafts',
  settingHint:
    'AI prepares a draft for each new question by picking from your saved replies and answers library. It never writes its own advice, and nothing is sent until you press Answer. Questions that mention pain get the ready GP-or-physio reply instead; questions that look medical get no draft. Form checks get no AI: you watch the clip and answer.',
}
