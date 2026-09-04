import { z } from 'zod'
import {
  FONT_IDS,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  MARGIN_DEFAULT,
  MARGIN_MAX,
  MARGIN_MIN,
  PAPER_IDS,
} from './typography'

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
  paper: z.enum(PAPER_IDS).default('letter'),
  font: z.enum(FONT_IDS).default('carlito'),
  /** Points. The template derives heading sizes and leading from this. */
  size: z.number().min(FONT_SIZE_MIN).max(FONT_SIZE_MAX).default(FONT_SIZE_DEFAULT),
  /** Page margin in CSS pixels; 1px is exactly 0.75pt. */
  margin: z.number().min(MARGIN_MIN).max(MARGIN_MAX).default(MARGIN_DEFAULT),
  /** Multiplies the template's default spacing. Fills or tightens a short page. */
  density: z.number().min(0.85).max(1.25).default(0.9),
})

export const documentOptions = z.object({
  /**
   * A hard ceiling the compiler enforces, not a hint. Overflow is reported back
   * so the user can cut, rather than silently producing a page nobody reads.
   */
  maxPages: z.number().int().min(1).max(10).default(1),
  /** Shown under the name. Empty means the user chose not to have one. */
  headline: z.string().optional(),
  /**
   * Contact details are per-document: not every application should get a phone
   * number, and a design role has no use for a GitHub profile. Each one is its
   * own switch rather than a single "links" switch, because the reason to drop
   * one is never the reason to drop the others.
   */
  showEmail: z.boolean().default(true),
  showPhone: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showWebsite: z.boolean().default(true),
  showGithub: z.boolean().default(true),
  showLinkedin: z.boolean().default(true),
})

/**
 * The templates that exist, as files in `src/lib/typst/templates`.
 *
 * An enum rather than a string, for the same reason paper and font are: this
 * value picks a file to read, and an unconstrained one reached the compiler and
 * threw there instead of failing at the boundary. `/api/compile` is public and
 * answered `{"template":"modern"}` with a 500 and a stack trace, where every
 * other bad value in the same body gets a 422 naming the field.
 */
export const TEMPLATE_IDS = ['classic'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const resumeDocument = z.object({
  id: z.string(),
  /** What the user calls this version, e.g. "Nomad Analytics - MLE". */
  name: z.string().default('Untitled'),
  template: z.enum(TEMPLATE_IDS).default('classic'),
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
