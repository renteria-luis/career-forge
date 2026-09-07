import { z } from 'zod'

/**
 * What a generation produces, and the ways one can fail to.
 *
 * A leaf module on purpose: it imports nothing but Zod, so the editor can hold
 * the same definitions the server does without the provider's SDK following
 * them into the browser bundle.
 */

/** Sections whose entries carry bullets worth rewriting. */
export const HIGHLIGHT_SECTIONS = ['work', 'projects'] as const
export type HighlightSection = (typeof HIGHLIGHT_SECTIONS)[number]

/**
 * Fields, never a document. The names are the profile's own, so what comes back
 * has somewhere to go without a translation step.
 */
export const generatedFields = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary'), summary: z.string() }),
  z.object({
    kind: z.literal('highlights'),
    section: z.enum(HIGHLIGHT_SECTIONS),
    index: z.number().int().min(0),
    highlights: z.array(z.string()),
  }),
])

export type GeneratedFields = z.infer<typeof generatedFields>

export const GENERATION_FAILURES = [
  /** Signed in, address not confirmed. May exist; may not spend. */
  'unverified',
  /** No key configured, so the feature is off. */
  'not-configured',
  'rate-limited',
  /** As many generations are already running as this instance will allow. */
  'busy',
  'unavailable',
  'refused',
  /** The reply arrived and was not something these fields can hold. */
  'invalid-output',
  /** The task named an entry the profile does not have. */
  'no-entry',
  'aborted',
] as const

export const generationFailure = z.enum(GENERATION_FAILURES)
export type GenerationFailure = z.infer<typeof generationFailure>

/**
 * What a person is told, per failure.
 *
 * Held here rather than in the component so that adding a failure to the union
 * forces a sentence to go with it. None of them names a provider or a status
 * code: those go in the log, where whoever can act on them will look.
 */
export const FAILURE_MESSAGES: Record<GenerationFailure, string> = {
  unverified: 'Confirm your email address first.',
  'not-configured': 'Drafting is switched off here.',
  'rate-limited': 'That is a few in a row. Give it a moment.',
  busy: 'Too many drafts are running at once. Try again shortly.',
  unavailable: 'The writer is not answering right now.',
  refused: 'The model declined to write this one.',
  'invalid-output': 'What came back was not usable. Try again.',
  'no-entry': 'That entry is not there any more.',
  aborted: 'Stopped.',
}
