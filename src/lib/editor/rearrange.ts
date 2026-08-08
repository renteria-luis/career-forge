import type { DocumentSection, ResumeDocument } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import type { LayoutBlock } from '@/lib/typst/compile'

/**
 * Moving a block on the page moves the thing it was drawn from.
 *
 * A resume is not always best in the order the data happens to be in: a job
 * from years ago can be the most relevant one for the posting in hand, and it
 * belongs at the top. Dragging on the preview is the direct way to say that,
 * and the same reorder is available from the form.
 *
 * Only like moves with like. A job cannot be dropped between two degrees, and
 * an entry cannot be dropped among the sections that contain it.
 */

export interface BlockRef {
  /** "section" for a whole section, otherwise the profile list it belongs to. */
  kind: string
  /** Section id, or the index of the entry within its list. */
  key: string
}

/** "section:work" and "work.2" are the two shapes a block id takes. */
export function parseBlockId(id: string): BlockRef | undefined {
  if (id.startsWith('section:')) return { kind: 'section', key: id.slice('section:'.length) }
  const dot = id.lastIndexOf('.')
  if (dot < 1) return undefined
  return { kind: id.slice(0, dot), key: id.slice(dot + 1) }
}

/** Two blocks can trade places only when they are the same kind of thing. */
export function canSwap(a: string, b: string): boolean {
  const first = parseBlockId(a)
  const second = parseBlockId(b)
  return first !== undefined && second !== undefined && first.kind === second.kind && a !== b
}

function moveWithin<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Reorders the document's sections. Returns the same object when nothing moves. */
export function moveSection(
  document: ResumeDocument,
  fromId: string,
  toId: string,
): ResumeDocument {
  const from = parseBlockId(fromId)
  const to = parseBlockId(toId)
  if (!from || !to || from.kind !== 'section' || to.kind !== 'section') return document

  const sections = document.sections
  const fromIndex = sections.findIndex((section: DocumentSection) => section.id === from.key)
  const toIndex = sections.findIndex((section: DocumentSection) => section.id === to.key)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return document

  return { ...document, sections: moveWithin(sections, fromIndex, toIndex) }
}

/** Lists of entries a block id can refer to. */
const LISTS = [
  'work',
  'projects',
  'education',
  'skills',
  'languages',
  'certificates',
  'awards',
  'publications',
  'volunteer',
  'interests',
] as const

type ListName = (typeof LISTS)[number]

function isList(name: string): name is ListName {
  return (LISTS as readonly string[]).includes(name)
}

/** Reorders entries within one list. Returns the same object when nothing moves. */
export function moveEntry(profile: Profile, fromId: string, toId: string): Profile {
  const from = parseBlockId(fromId)
  const to = parseBlockId(toId)
  if (!from || !to || from.kind !== to.kind || !isList(from.kind)) return profile

  // Every one of these keys holds an array of a different shape. Reordering
  // does not read the elements, so the shape is irrelevant here — but TypeScript
  // cannot narrow a union of array types through a dynamic key.
  const list = profile[from.kind] as unknown[] | undefined
  if (!Array.isArray(list)) return profile

  const fromIndex = Number(from.key)
  const toIndex = Number(to.key)
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return profile
  if (fromIndex === toIndex) return profile
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return profile
  }

  return { ...profile, [from.kind]: moveWithin(list, fromIndex, toIndex) }
}

/** A drawn band: where a block starts and where the next one takes over. */
export interface Band {
  id: string
  page: number
  /** Points from the top of the page. */
  top: number
  bottom: number
}

/**
 * Turns marker positions into the bands the overlay draws.
 *
 * A marker records where a block begins; the block runs until the next one
 * starts, or to the bottom of the page. Section markers are skipped when
 * entries are being moved, and the other way round, so a band never covers
 * something that cannot be dropped there.
 */
export function toBands(blocks: LayoutBlock[], pageHeights: number[], kind: 'section' | 'entry') {
  const wanted = blocks.filter((block) => {
    const ref = parseBlockId(block.id)
    if (!ref) return false
    return kind === 'section' ? ref.kind === 'section' : ref.kind !== 'section'
  })

  return wanted.map((block, index): Band => {
    const next = wanted[index + 1]
    const sharesPage = next?.page === block.page
    return {
      id: block.id,
      page: block.page,
      top: block.y,
      bottom: sharesPage ? next.y : (pageHeights[block.page - 1] ?? block.y + 60),
    }
  })
}
