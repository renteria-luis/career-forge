import { z } from 'zod'
import { FONT_IDS, FONT_SIZE_DEFAULT, FONT_SIZE_MAX, FONT_SIZE_MIN } from './typography'

/**
 * How one document is composed from a profile.
 *
 * A profile holds a person's whole career; a document is one arrangement of it
 * aimed at one job. Keeping them apart is what lets a single profile produce a
 * dozen tailored resumes without duplicating the underlying facts, and it means
 * tailoring for a job can never quietly destroy the original.
 *
 * Nothing here contains resume content. If a field would hold a sentence about
 * the person, it belongs in the profile instead.
 */

/** Sections drawn from standard profile fields. `summary` comes from basics. */
export const STANDARD_SECTIONS = [
  'summary',
  'work',
  'education',
  'skills',
  'projects',
  'certificates',
  'awards',
  'publications',
  'languages',
  'volunteer',
  'interests',
  'references',
] as const

export const standardSectionId = z.enum(STANDARD_SECTIONS)
export type StandardSectionId = z.infer<typeof standardSectionId>

/**
 * One section in the document, in render order.
 *
 * `title` overrides the default heading so a user can say "Experience" where we
 * would say "Work". `entryIds` is how tailoring drops individual entries without
 * touching the profile: absent means every entry, present means exactly these.
 */
export const documentSection = z.object({
  kind: z.enum(['standard', 'custom']),
  /** A StandardSectionId, or the id of a customSection in the profile. */
  id: z.string(),
  title: z.string().optional(),
  visible: z.boolean().default(true),
  entryIds: z.array(z.string()).optional(),
})

export const typography = z.object({
  font: z.enum(FONT_IDS).default('source-sans'),
  /** Points. The template derives heading sizes and leading from this. */
  size: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(FONT_SIZE_DEFAULT),
  /** Page margin in millimetres. Under 12mm reads as cramped and risks clipping. */
  margin: z.number().min(12).max(30).default(18),
  /** Multiplies the template's default spacing. Fills or tightens a short page. */
  density: z.number().min(0.85).max(1.25).default(1),
})

export const documentOptions = z.object({
  /**
   * A hard ceiling the compiler enforces, not a hint. Overflow is reported back
   * so the user can cut, rather than silently producing a page nobody reads.
   */
  maxPages: z.number().int().min(1).max(10).default(1),
  /** Shown under the name. Empty means the user chose not to have one. */
  headline: z.string().optional(),
  /** Contact details are per-document: not every application should get a phone number. */
  showEmail: z.boolean().default(true),
  showPhone: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showUrl: z.boolean().default(true),
})

export const resumeDocument = z.object({
  id: z.string(),
  /** What the user calls this version, e.g. "Anthropic - MLE". */
  name: z.string().default('Untitled'),
  template: z.string().default('classic'),
  /** Affects wording and dates only; the interface stays English. */
  locale: z.string().default('en'),
  typography: typography.prefault({}),
  options: documentOptions.prefault({}),
  /** Render order is array order. A section absent here does not render. */
  sections: z.array(documentSection).default([]),
})

export type ResumeDocument = z.infer<typeof resumeDocument>
export type DocumentSection = z.infer<typeof documentSection>
export type Typography = z.infer<typeof typography>

/** The order most resumes want, and the one a new document starts from. */
export const DEFAULT_SECTIONS: DocumentSection[] = [
  { kind: 'standard', id: 'summary', visible: true },
  { kind: 'standard', id: 'work', visible: true },
  { kind: 'standard', id: 'projects', visible: true },
  { kind: 'standard', id: 'education', visible: true },
  { kind: 'standard', id: 'skills', visible: true },
]
