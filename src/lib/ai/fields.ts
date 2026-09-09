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
/** One entry that survived tailoring, with the bullets it survived with. */
export const tailoredEntry = z.object({
  index: z.number().int().min(0),
  highlights: z.array(z.string()),
})

export const generatedFields = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('summary'), summary: z.string() }),
  z.object({
    kind: z.literal('highlights'),
    section: z.enum(HIGHLIGHT_SECTIONS),
    index: z.number().int().min(0),
    highlights: z.array(z.string()),
  }),
  /**
   * A whole document aimed at one job, in one reply.
   *
   * Still fields: a summary and bullets are profile content, and the indices
   * are which entries the *document* shows. Nothing is deleted from the profile
   * — that is the split the architecture is built on, and it is what lets one
   * career answer a dozen adverts without losing anything.
   */
  z.object({
    kind: z.literal('tailored'),
    summary: z.string(),
    work: z.array(tailoredEntry),
    projects: z.array(tailoredEntry),
    /** Which skill entries earn their place, by position. */
    skills: z.array(z.number().int().min(0)),
  }),
])

export type GeneratedFields = z.infer<typeof generatedFields>

/**
 * Which model runs the work.
 *
 * `auto` is the table in `generate.ts`: free where the output is structure more
 * than prose, paid where a person reads it and judges the writer. The other two
 * are for finding out whether that table is right, which is a question only
 * reading both answers settles.
 */
export const MODEL_CHOICES = ['auto', 'free', 'best'] as const
export const modelChoice = z.enum(MODEL_CHOICES)
export type ModelChoice = z.infer<typeof modelChoice>

/** The two providers, named by what they cost rather than by whose they are. */
export type Provider = 'free' | 'best'

export const GENERATION_FAILURES = [
  /** Signed in, address not confirmed. May exist; may not spend. */
  'unverified',
  /** No key configured, so the feature is off. */
  'not-configured',
  /** The free model exists here and this account may not use it. */
  'free-not-allowed',
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
  'free-not-allowed': 'The free model is not available to this account. Use Automatic.',
  'rate-limited': 'That is a few in a row. Give it a moment.',
  busy: 'Too many drafts are running at once. Try again shortly.',
  unavailable: 'The writer is not answering. Try again in a moment.',
  refused: 'The model declined to write this one.',
  'invalid-output': 'What came back was not usable. Try again.',
  'no-entry': 'That entry is not there any more.',
  aborted: 'Stopped.',
}
