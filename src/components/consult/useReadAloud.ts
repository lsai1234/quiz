'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Read aloud (build U4): in comfort mode Amp reads each question out, using
 * the device's own voice — nothing leaves the browser.
 *
 * Offered as a toggle in comfort mode, off until tapped. The choice is
 * remembered for the session (sessionStorage): turning it on on one screen
 * keeps it on for the next, and a new visit starts fresh.
 */

export const READ_ALOUD_KEY = 'amp-read-aloud'

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/**
 * Off until someone turns it on: comfort mode now switches itself on, and a
 * page that starts talking unasked is a surprise. Once on, it stays on for
 * the session.
 */
function remembered(): boolean {
  try {
    return sessionStorage.getItem(READ_ALOUD_KEY) === 'on'
  } catch {
    return false
  }
}

/** A British English voice if the device has one, else the default for the language. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices?.() ?? []
  return voices.find((v) => v.lang === 'en-GB' && v.localService) ?? voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en'))
}

/** Question and hint as one thing to say, without doubling up the punctuation. */
export function toSpeech(...parts: (string | undefined | null)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .map((p) => (/[.?!…]$/.test(p!) ? p : `${p}.`))
    .join(' ')
}

export function speak(text: string): void {
  if (!speechSupported() || !text.trim()) return
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-GB'
  u.rate = 0.95
  const voice = pickVoice()
  if (voice) u.voice = voice
  synth.speak(u)
}

let primed = false

/**
 * iPhone only lets a page start speaking from inside a tap; after the first
 * utterance it can speak whenever. Comfort mode is switched on by a tap but
 * the question is read after the screen updates, outside it — so the tap
 * itself says nothing, silently, to unlock the voice.
 */
export function primeSpeech(): void {
  if (primed || !speechSupported()) return
  primed = true
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

export function hush(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}

/**
 * Speaks `text` whenever `sceneKey` changes while `comfort` is on and the
 * setting is on. Returns the setting and its toggle.
 */
export function useReadAloud(sceneKey: string, text: string, comfort: boolean) {
  const [supported] = useState(speechSupported)
  const [on, setOn] = useState(remembered)
  const active = supported && comfort && on

  // The tap that turns it on speaks straight away (iPhone only lets speech
  // start inside a tap), so the effect it triggers mustn't say it again.
  const spokeInTap = useRef(false)

  useEffect(() => {
    if (!active) return
    if (spokeInTap.current) spokeInTap.current = false
    else speak(text)
    return hush
    // Once per scene: new words for the same scene (the AI's) don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sceneKey])

  const toggle = useCallback(() => {
    const next = !on
    try {
      sessionStorage.setItem(READ_ALOUD_KEY, next ? 'on' : 'off')
    } catch {
      // Private mode: the setting lasts this screen only.
    }
    if (next) {
      spokeInTap.current = true
      speak(text)
    } else hush()
    setOn(next)
  }, [on, text])

  return { available: supported && comfort, on, toggle }
}
