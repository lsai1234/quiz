/**
 * Consult features switched off for now, kept in the code for when they come
 * back. Off, nothing offers them: "Tell Amp" is typing only, and nothing asks
 * for a photo.
 *
 *   voice    Hold to talk inside "Tell Amp" (U3). Read aloud, Amp speaking
 *            the question in comfort mode, is separate and stays on.
 *   uploads  "Scan my shelf instead" (U1) and "Fill from my tracker" (U2).
 *
 * An object, not constants, so the tests of the features themselves can turn
 * them back on.
 */
export const CONSULT_FEATURES: { voice: boolean; uploads: boolean } = {
  voice: false,
  uploads: false,
}
