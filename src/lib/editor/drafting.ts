'use client'

import { MODEL_CHOICES, type ModelChoice } from '@/lib/ai/fields'

/**
 * The two things a browser remembers about drafting.
 *
 * Both are preferences rather than resume data, which is why neither is in the
 * profile and neither travels: what a person was told once, and which model
 * they last asked for. They live where the draft lives, on their own machine.
 *
 * Every read and write is wrapped, because private browsing throws on both and
 * a preference is never worth an exception.
 */

const CONSENT_KEY = 'career-forge:ai-consent:v1'
const CHOICE_KEY = 'career-forge:ai-model:v1'

/** Whether this browser has been told what drafting sends, and to whom. */
export function hasConsented(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'yes'
  } catch {
    // Asking again is the safe failure for a disclosure.
    return false
  }
}

export function rememberConsent(): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, 'yes')
  } catch {
    // Then it is asked again next time, which is not worth interrupting over.
  }
}

export function loadChoice(): ModelChoice {
  try {
    const stored = window.localStorage.getItem(CHOICE_KEY)
    return MODEL_CHOICES.find((choice) => choice === stored) ?? 'auto'
  } catch {
    return 'auto'
  }
}

export function saveChoice(choice: ModelChoice): void {
  try {
    window.localStorage.setItem(CHOICE_KEY, choice)
  } catch {
    // As above.
  }
}
