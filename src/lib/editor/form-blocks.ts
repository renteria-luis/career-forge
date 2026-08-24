import type { DocumentSection, StandardSectionId } from '@/lib/resume/document'

/**
 * Which sections the form has a block of fields for, and what it heads them.
 *
 * Not every section is here. Awards and publications are set on the page but
 * have no form yet, and a summary is edited inside "You" rather than in a block
 * of its own — neither can be reordered in the form, so neither is listed.
 */
const BLOCK_TITLES = {
  work: 'Experience',
  projects: 'Projects',
  education: 'Education',
  skills: 'Skills',
  languages: 'Languages',
  certificates: 'Certifications',
} as const satisfies Partial<Record<StandardSectionId, string>>

export type FormBlockId = keyof typeof BLOCK_TITLES

function isFormBlock(id: string): id is FormBlockId {
  return id in BLOCK_TITLES
}

/**
 * The blocks the form renders, in the order the document puts them.
 *
 * Order comes from the document rather than a list kept here, so dragging
 * Projects above Experience on the page carries the form and the index rail
 * with it. Rendered in a fixed order instead, a rearranged page described an
 * arrangement the form did not have, and the form is where the editing is.
 */
export function formBlocks(sections: DocumentSection[]): FormBlockId[] {
  return sections.flatMap((section) =>
    section.kind === 'standard' && section.visible && isFormBlock(section.id) ? [section.id] : [],
  )
}

/** The heading one block carries. */
export function formBlockTitle(id: FormBlockId): string {
  return BLOCK_TITLES[id]
}

/**
 * Titles of the blocks the form will render, in the order it renders them.
 *
 * "You" is always first and never moves: it holds the name and the contact
 * details, which are not a section of the resume and are not in the document.
 */
export function formBlockTitles(sections: DocumentSection[]): string[] {
  return ['You', ...formBlocks(sections).map(formBlockTitle)]
}
