import { DEFAULT_SECTIONS, resumeDocument, type ResumeDocument } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'

/** What a new document starts as, before anything is imported or typed. */
export function emptyDocument(): ResumeDocument {
  return resumeDocument.parse({
    id: 'draft',
    name: 'Untitled',
    sections: DEFAULT_SECTIONS,
  })
}

/**
 * One empty role and one empty qualification, so the form opens with something
 * to type into. An entirely blank form makes people wonder where to start.
 */
export function emptyProfile(): Profile {
  return {
    basics: {},
    work: [{ position: '', name: '' }],
    education: [{ institution: '' }],
  }
}
