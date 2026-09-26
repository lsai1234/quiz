'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Read aloud (build U4): in comfort mode Amp reads each question out, using
 * the device's own voice — nothing leaves the browser.
 *
 * On by default once comfort mode is on, with a toggle beside it. The choice
 * is remembered for the session (sessionStorage): turning it off on one
 * screen keeps it off on the next, and a new visit starts fresh.
 */

export const READ_ALOUD_KEY = 'amp-read-aloud'

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

function remembered(): boolean {
  try {
    return sessionStorage.getItem(READ_ALOUD_KEY) !== 'off'
  } catch {
    return true
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

  useEffect(() => {
    if (!active) return
    speak(text)
    return hush
    // Once per scene: new words for the same scene (the AI's) don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sceneKey])

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was
      try {
        sessionStorage.setItem(READ_ALOUD_KEY, next ? 'on' : 'off')
      } catch {
        // Private mode: the setting lasts this screen only.
      }
      if (next) speak(text)
      else hush()
      return next
    })
  }, [text])

  return { available: supported && comfort, on, toggle }
}
