'use client'

import { resumeDocument, type ResumeDocument } from '@/lib/resume/document'
import { profile as profileSchema, type Profile } from '@/lib/resume/profile'

/**
 * Keeps the draft in the browser between visits.
 *
 * A refresh used to throw away everything typed, which is a bad enough surprise
 * on a form this long that people would not risk a second one. There are no
 * accounts yet, so the draft lives on the user's own machine and never travels.
 *
 * What comes back out is parsed by the same schemas as anything else crossing
 * into the application. Storage is editable by hand, survives across versions
 * of this app, and is exactly the kind of input that must not be trusted.
 */

const KEY = 'career-forge:draft:v1'

export interface Draft {
  profile: Profile
  document: ResumeDocument
}

export function loadDraft(): Draft | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return undefined

    const { profile, document } = parsed as { profile?: unknown; document?: unknown }
    const profileResult = profileSchema.safeParse(profile)
    const documentResult = resumeDocument.safeParse(document)
    if (!profileResult.success || !documentResult.success) return undefined

    return { profile: profileResult.data, document: documentResult.data }
  } catch {
    // Storage can be unavailable or full. A lost draft is worse than a crash
    // only in the sense that a crash is worse still.
    return undefined
  }
}

/**
 * The draft as one string.
 *
 * Separate from `saveDraft` because the editor already needs this exact string
 * for something else: it is the body posted to `/api/compile`, and it is how a
 * change is detected at all, since react-hook-form hands back a fresh object on
 * every keystroke. Serialising once and using it three times is the difference
 * between two passes over the resume per keystroke and one.
 */
export function serializeDraft(draft: Draft): string {
  return JSON.stringify(draft)
}

/**
 * Takes the string rather than the object, so the caller that already has one
 * does not pay to rebuild it. Nothing validates on the way in: what comes back
 * out is parsed by `loadDraft` against the schemas, and a bad string there is
 * indistinguishable from the hand-edited storage that function already expects.
 */
export function saveDraft(serialized: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, serialized)
  } catch {
    // Private browsing and full quotas both throw here. Nothing to do about it
    // and nothing worth interrupting the user over.
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // As above.
  }
}
