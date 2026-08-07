import { z } from 'zod'

/**
 * A person's career facts — the superset, never trimmed for a specific job.
 *
 * Field names follow JSON Resume v1 exactly so a resume.json from any other
 * tool imports without a translation layer, and ours exports the same way.
 * Anything the standard does not cover lives in `extensions` rather than being
 * bolted onto a standard object, which keeps exports valid for other readers.
 *
 * Everything is optional. This schema has to accept a half-parsed PDF from a
 * stranger as readily as a profile the user spent an hour on; rejecting messy
 * input is the parser's job to report, not the schema's job to prevent.
 */

/**
 * JSON Resume dates are ISO 8601 and may be partial: a job remembered only as
 * "2019" is still worth storing. An absent `endDate` means the role is current,
 * which is the standard's convention — do not invent a "present" sentinel.
 */
export const partialDate = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Use YYYY, YYYY-MM or YYYY-MM-DD')

export const location = z.object({
  address: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
  region: z.string().optional(),
})

/** A social or professional presence. `network` is the display name, e.g. GitHub. */
export const socialProfile = z.object({
  network: z.string().optional(),
  username: z.string().optional(),
  url: z.url().optional(),
})

export const basics = z.object({
  name: z.string().optional(),
  /**
   * The headline under the name — "ML Engineer | Data Scientist". JSON Resume
   * calls this `label`; keep the standard name even though the UI says headline.
   */
  label: z.string().optional(),
  image: z.url().optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  url: z.url().optional(),
  summary: z.string().optional(),
  location: location.optional(),
  profiles: z.array(socialProfile).optional(),
})

/**
 * `highlights` is where the substance lives. Keeping bullets as separate strings
 * rather than one blob is what lets the template control spacing, the tailoring
 * step drop individual bullets, and the smoke detector cite a specific claim.
 */
export const work = z.object({
  name: z.string().optional(),
  position: z.string().optional(),
  url: z.url().optional(),
  startDate: partialDate.optional(),
  endDate: partialDate.optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
})

export const volunteer = z.object({
  organization: z.string().optional(),
  position: z.string().optional(),
  url: z.url().optional(),
  startDate: partialDate.optional(),
  endDate: partialDate.optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
})

export const education = z.object({
  institution: z.string().optional(),
  url: z.url().optional(),
  area: z.string().optional(),
  studyType: z.string().optional(),
  startDate: partialDate.optional(),
  endDate: partialDate.optional(),
  score: z.string().optional(),
  courses: z.array(z.string()).optional(),
})

export const award = z.object({
  title: z.string().optional(),
  date: partialDate.optional(),
  awarder: z.string().optional(),
  summary: z.string().optional(),
})

export const certificate = z.object({
  name: z.string().optional(),
  date: partialDate.optional(),
  issuer: z.string().optional(),
  url: z.url().optional(),
})

export const publication = z.object({
  name: z.string().optional(),
  publisher: z.string().optional(),
  releaseDate: partialDate.optional(),
  url: z.url().optional(),
  summary: z.string().optional(),
})

/**
 * `keywords` are the ATS surface. They are also what the smoke detector checks:
 * a keyword that appears here and nowhere in work or projects is a claim with
 * no evidence behind it.
 */
export const skill = z.object({
  name: z.string().optional(),
  level: z.string().optional(),
  keywords: z.array(z.string()).optional(),
})

export const language = z.object({
  language: z.string().optional(),
  fluency: z.string().optional(),
})

export const interest = z.object({
  name: z.string().optional(),
  keywords: z.array(z.string()).optional(),
})

export const reference = z.object({
  name: z.string().optional(),
  reference: z.string().optional(),
})

export const project = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  startDate: partialDate.optional(),
  endDate: partialDate.optional(),
  url: z.url().optional(),
  roles: z.array(z.string()).optional(),
  entity: z.string().optional(),
  type: z.string().optional(),
})

/** One entry in a section the user named themselves. */
export const customEntry = z.object({
  id: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  startDate: partialDate.optional(),
  endDate: partialDate.optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  url: z.url().optional(),
})

/**
 * Sections the standard has no name for. The user ticks a box, names it, and
 * gets the same entry shape every other section uses — which is why the
 * template can render it without knowing what the user called it.
 */
export const customSection = z.object({
  id: z.string(),
  title: z.string(),
  entries: z.array(customEntry).default([]),
})

/** Ours, not the standard's. Kept apart so exports stay valid JSON Resume. */
export const extensions = z.object({
  customSections: z.array(customSection).default([]),
})

export const profileMeta = z.object({
  canonical: z.url().optional(),
  version: z.string().optional(),
  lastModified: z.string().optional(),
})

export const profile = z.object({
  basics: basics.optional(),
  work: z.array(work).optional(),
  volunteer: z.array(volunteer).optional(),
  education: z.array(education).optional(),
  awards: z.array(award).optional(),
  certificates: z.array(certificate).optional(),
  publications: z.array(publication).optional(),
  skills: z.array(skill).optional(),
  languages: z.array(language).optional(),
  interests: z.array(interest).optional(),
  references: z.array(reference).optional(),
  projects: z.array(project).optional(),
  meta: profileMeta.optional(),
  extensions: extensions.optional(),
})

export type Profile = z.infer<typeof profile>
export type Work = z.infer<typeof work>
export type Education = z.infer<typeof education>
export type Skill = z.infer<typeof skill>
export type Project = z.infer<typeof project>
export type CustomSection = z.infer<typeof customSection>
