/**
 * Voice (build U3): the contract for hold-to-talk in "Tell Amp more".
 *
 * Speech is recorded in the browser while the button is held, sent once to be
 * turned into text, and dropped: the audio is never stored or logged. The text
 * comes back into the box, where the person can read it and change it before
 * sending — so everything spoken passes the same screens as everything typed.
 *
 * Spoken health details are the risk typing doesn't have: the medical screen
 * can only run once there are words. So the transcript is screened on the
 * server, and a medical one is withheld — never returned, never logged — and
 * the person is pointed at the circuit check, exactly as for typing.
 */

/** Pinned: a model change is a prompt change (see `personas.ts`). */
export const VOICE_MODEL = 'gpt-4o-mini-transcribe-2025-12-15'
/** Used once when the pinned model is refused (not enabled, or retired). */
export const VOICE_FALLBACK_MODEL = 'whisper-1'

/** An API error about the model itself (not found, not allowed), as opposed to the clip or the network. */
export function isModelProblem(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'model_not_found') return true
  return (e.status === 400 || e.status === 403 || e.status === 404) && /model/i.test(e.message ?? '')
}

/** Longest hold, in seconds. Fifteen seconds is a couple of sentences — plenty for a detail. */
export const MAX_SECONDS = 15
/** A clip's size cap: 15 seconds of Opus is well under this. */
export const MAX_AUDIO_BYTES = 1_000_000
/** A hold shorter than this is a tap, not speech: say "hold to talk" instead. */
export const MIN_HOLD_MS = 400

export const AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'] as const

/** The container a recorder should use, most compact first. */
export const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function isAudioType(type: string): boolean {
  const base = type.split(';')[0].trim().toLowerCase()
  return (AUDIO_TYPES as readonly string[]).includes(base)
}

/** Nudges the transcription towards the consult's words. It is context, never instructions. */
export const VOICE_PROMPT = 'Someone describing their routine: training, sleep, coffee, food, work shifts.'
