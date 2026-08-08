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

/**
 * Optional fields that treat blank input as absent.
 *
 * HTML inputs hand back "" for anything untouched or cleared, and "" is not a
 * valid email, URL or date — so without this, every empty optional field on a
 * form fails validation. Clearing a field means "I do not have one", and that
 * belongs to the data contract rather than to one form, so the importer and any
 * generated output get the same treatment.
 *
 * Values are trimmed on the way through. Trailing whitespace in a job title is
 * never meaningful and it shows up in the PDF.
 *
 * Written as transform-then-pipe rather than z.preprocess, which types its
 * input as unknown and drags that into every inferred type. The trailing
 * .optional() is what makes the key itself optional in the inferred type, so
 * callers can build a partial profile without spelling out every absent field.
 */
const blank = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed === '' || trimmed === undefined ? undefined : trimmed
  })

/** Free text. */
const text = () => blank.optional()
const email = () => blank.pipe(z.email().optional()).optional()
/**
 * Accepts what people actually type. Nobody writes "https://" on a resume, so
 * "jamessmith.dev" and "www.example.com" are normalised to a real URL rather
 * than rejected — a stored link needs a scheme to be clickable, but demanding
 * one from the user is a validation error over a formality.
 *
 * The scheme is stripped again for display; see the render model.
 */
const url = () =>
  blank
    .transform((value) => {
      if (!value) return value
      return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
    })
    .pipe(z.url().optional())
    .optional()
const date = () => blank.pipe(partialDate.optional()).optional()

export const location = z.object({
  address: text(),
  postalCode: text(),
  city: text(),
  countryCode: text(),
  region: text(),
})

/** A social or professional presence. `network` is the display name, e.g. GitHub. */
export const socialProfile = z.object({
  network: text(),
  username: text(),
  url: url(),
})

export const basics = z.object({
  name: text(),
  /**
   * The headline under the name — "ML Engineer | Data Scientist". JSON Resume
   * calls this `label`; keep the standard name even though the UI says headline.
   */
  label: text(),
  image: url(),
  email: email(),
  phone: text(),
  url: url(),
  summary: text(),
  location: location.optional(),
  profiles: z.array(socialProfile).optional(),
})

/**
 * `highlights` is where the substance lives. Keeping bullets as separate strings
 * rather than one blob is what lets the template control spacing, the tailoring
 * step drop individual bullets, and the smoke detector cite a specific claim.
 */
/**
 * How a job was worked. Not a JSON Resume field.
 *
 * It is kept on the entry rather than under `extensions` because the standard
 * sets `additionalProperties: true`, so an export carrying it is still valid
 * for other readers — and because anything held at profile level would have to
 * be matched back to a job by its index, which reordering entries breaks.
 */
export const ARRANGEMENTS = ['on-site', 'hybrid', 'remote'] as const
export const arrangement = z.enum(ARRANGEMENTS)
export type Arrangement = z.infer<typeof arrangement>

export const work = z.object({
  name: text(),
  position: text(),
  /**
   * Where the job was, written however the person writes it — "Toronto",
   * "London, ON, Canada", "Peru". One field, because splitting it into city and
   * country asks the user to answer a question they did not ask, and every
   * combination they might type has to survive being typed.
   */
  location: text(),
  arrangement: arrangement.optional(),
  url: url(),
  startDate: date(),
  endDate: date(),
  summary: text(),
  highlights: z.array(z.string()).optional(),
})

export const volunteer = z.object({
  organization: text(),
  position: text(),
  url: url(),
  startDate: date(),
  endDate: date(),
  summary: text(),
  highlights: z.array(z.string()).optional(),
})

export const education = z.object({
  institution: text(),
  /** As on `work`, and ours for the same reason — the standard has no field. */
  location: text(),
  url: url(),
  area: text(),
  studyType: text(),
  startDate: date(),
  endDate: date(),
  score: text(),
  courses: z.array(z.string()).optional(),
})

export const award = z.object({
  title: text(),
  date: date(),
  awarder: text(),
  summary: text(),
})

export const certificate = z.object({
  name: text(),
  date: date(),
  issuer: text(),
  url: url(),
})

export const publication = z.object({
  name: text(),
  publisher: text(),
  releaseDate: date(),
  url: url(),
  summary: text(),
})

/**
 * `keywords` are the ATS surface. They are also what the smoke detector checks:
 * a keyword that appears here and nowhere in work or projects is a claim with
 * no evidence behind it.
 */
export const skill = z.object({
  name: text(),
  level: text(),
  keywords: z.array(z.string()).optional(),
})

export const language = z.object({
  language: text(),
  fluency: text(),
})

export const interest = z.object({
  name: text(),
  keywords: z.array(z.string()).optional(),
})

export const reference = z.object({
  name: text(),
  reference: text(),
})

export const project = z.object({
  name: text(),
  description: text(),
  highlights: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  startDate: date(),
  endDate: date(),
  url: url(),
  roles: z.array(z.string()).optional(),
  entity: text(),
  type: text(),
})

/** One entry in a section the user named themselves. */
export const customEntry = z.object({
  id: z.string(),
  title: text(),
  subtitle: text(),
  startDate: date(),
  endDate: date(),
  summary: text(),
  highlights: z.array(z.string()).optional(),
  url: url(),
})

/**
 * Sections the standard has no name for. The user ticks a box, names it, and
 * gets the same entry shape every other section uses — which is why the
 * template can render it without knowing what the user called it.
 */
export const customSection = z.object({
  id: z.string(),
  title: z.string(),
  entries: z.array(customEntry).optional(),
})

/** Ours, not the standard's. Kept apart so exports stay valid JSON Resume. */
export const extensions = z.object({
  customSections: z.array(customSection).optional(),
})

export const profileMeta = z.object({
  canonical: url(),
  version: text(),
  lastModified: text(),
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
