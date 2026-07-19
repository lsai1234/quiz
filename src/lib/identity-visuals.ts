/**
 * Focus-area labels on the identity card are free-text, AI-generated strings
 * (e.g. "Performance Output", "Faster Recovery", "Daily Energy"). This maps a
 * label to a monoline `QuizIcon` glyph by keyword so each focus area gets a
 * scannable icon instead of reading as a plain word pill. Falls back to a
 * neutral sparkle when nothing matches.
 */

const KEYWORD_GLYPHS: Array<[RegExp, string]> = [
  [/strength|power|muscle|build|mass|lift/, 'dumbbell'],
  [/recover|repair|soreness|rebuild/, 'refresh'],
  [/energy|drive|charge|vitality/, 'bolt'],
  [/performance|output|peak|athletic/, 'peak'],
  [/endurance|stamina|cardio|aerobic/, 'activity'],
  [/sleep|rest|overnight|wind.?down/, 'moon'],
  [/focus|brain|mind|concentrat|cognit|clarity/, 'brain'],
  [/immune|immunity|defen|resilien/, 'shield'],
  [/hydrat|electrolyte|fluid/, 'droplet'],
  [/fat|lean|burn|weight|slim/, 'flame'],
  [/gut|digest|probiotic|bloat/, 'spiral'],
  [/skin|hair|nail|collagen|beauty/, 'sparkle'],
  [/stress|calm|balance|mood|relax/, 'wave'],
  [/joint|mobility|bone|flex/, 'bone'],
  [/health|wellness|wellbeing|daily|general/, 'heart'],
]

/** A `QuizIcon` glyph name for a free-text focus-area label. */
export function focusAreaGlyph(label: string): string {
  const l = label.toLowerCase()
  for (const [re, glyph] of KEYWORD_GLYPHS) {
    if (re.test(l)) return glyph
  }
  return 'sparkle'
}
