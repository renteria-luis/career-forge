import {
  DEFAULT_SECTIONS,
  STANDARD_SECTIONS,
  resumeDocument,
  type DocumentSection,
  type ResumeDocument,
  type StandardSectionId,
} from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'

/** What a new document starts as, before anything is imported or typed. */
export function emptyDocument(): ResumeDocument {
  return resumeDocument.parse({
    id: 'draft',
    name: 'Untitled',
    sections: DEFAULT_SECTIONS,
  })
}

/** Where each standard section reads its content from. */
const SOURCES: Record<StandardSectionId, (profile: Profile) => boolean> = {
  summary: (p) => Boolean(p.basics?.summary),
  work: (p) => Boolean(p.work?.length),
  education: (p) => Boolean(p.education?.length),
  skills: (p) => Boolean(p.skills?.length),
  projects: (p) => Boolean(p.projects?.length),
  certificates: (p) => Boolean(p.certificates?.length),
  awards: (p) => Boolean(p.awards?.length),
  publications: (p) => Boolean(p.publications?.length),
  languages: (p) => Boolean(p.languages?.length),
  volunteer: (p) => Boolean(p.volunteer?.length),
  interests: (p) => Boolean(p.interests?.length),
  references: (p) => Boolean(p.references?.length),
}

/**
 * Turns on the sections an imported profile actually has content for.
 *
 * A document only renders the sections it lists, so importing a resume with a
 * Languages section used to parse it correctly and then show nothing — the data
 * was there and the document had no room for it. Existing sections keep their
 * order; anything new is appended in the standard order rather than at random.
 */
export function sectionsForProfile(
  profile: Profile,
  current: DocumentSection[],
): DocumentSection[] {
  const present = new Set(current.map((section) => section.id))
  const additions = STANDARD_SECTIONS.filter((id) => !present.has(id) && SOURCES[id](profile)).map(
    (id): DocumentSection => ({ kind: 'standard', id, visible: true }),
  )

  return additions.length > 0 ? [...current, ...additions] : current
}

/**
 * Fills in the fields the form registers so a reset actually clears them.
 *
 * react-hook-form leaves an input alone when the value it is reset to is
 * undefined, so resetting to a profile that simply lacks a phone number left
 * the previous one on screen. That matters twice over: clearing has to clear,
 * and importing a second resume must not inherit fields from the first.
 */
export function toFormValues(profile: Profile): Profile {
  return {
    ...profile,
    basics: {
      name: '',
      label: '',
      email: '',
      phone: '',
      url: '',
      summary: '',
      ...profile.basics,
      location: {
        city: '',
        countryCode: '',
        ...profile.basics?.location,
      },
    },
  }
}

/**
 * One empty role and one empty qualification, so the form opens with something
 * to type into. An entirely blank form makes people wonder where to start.
 */
export function emptyProfile(): Profile {
  return toFormValues({
    work: [{ position: '', name: '' }],
    education: [{ institution: '' }],
  })
}
