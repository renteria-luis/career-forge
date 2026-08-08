import type { StandardSectionId } from '@/lib/resume/document'
import type { TextLine } from './extract'
import { parseDateRange } from './dates'

/**
 * Recognises section headings in an imported resume.
 *
 * Headings are the skeleton: get them wrong and every entry lands under the
 * wrong key. Vocabulary is the strongest signal, so it decides on its own;
 * typography only promotes a line we do not have a word for, which is how
 * unusual headings like "What I have shipped" still get found.
 *
 * Spanish is included because it is the first language this will meet in the
 * wild, not as an afterthought for later.
 */

const VOCABULARY: Record<StandardSectionId, string[]> = {
  summary: [
    'summary',
    'profile',
    'about',
    'about me',
    'objective',
    'overview',
    'perfil',
    'resumen',
    'acerca de mi',
    'objetivo',
    'sobre mi',
  ],
  work: [
    'experience',
    'work experience',
    'work history',
    'employment',
    'professional experience',
    'employment history',
    'career',
    'work',
    'experiencia',
    'experiencia laboral',
    'experiencia profesional',
    'trayectoria',
  ],
  education: [
    'education',
    'academic background',
    'academics',
    'studies',
    'educacion',
    'formacion',
    'formacion academica',
    'estudios',
  ],
  skills: [
    'skills',
    'technical skills',
    'core skills',
    'technologies',
    'competencies',
    'tech stack',
    'habilidades',
    'competencias',
    'conocimientos',
    'aptitudes',
  ],
  projects: ['projects', 'personal projects', 'selected projects', 'portfolio', 'proyectos'],
  certificates: ['certifications', 'certificates', 'licenses', 'certificaciones', 'cursos'],
  awards: ['awards', 'honors', 'honours', 'achievements', 'premios', 'reconocimientos', 'logros'],
  publications: ['publications', 'papers', 'research', 'publicaciones'],
  languages: ['languages', 'idiomas', 'lenguajes'],
  volunteer: ['volunteering', 'volunteer', 'volunteer experience', 'voluntariado'],
  interests: ['interests', 'hobbies', 'intereses', 'pasatiempos'],
  references: ['references', 'referencias'],
}

/** Strips accents and punctuation so "Educación:" matches "educacion". */
function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const LOOKUP = new Map<string, StandardSectionId>()
for (const [id, words] of Object.entries(VOCABULARY) as [StandardSectionId, string[]][]) {
  for (const word of words) LOOKUP.set(word, id)
}

/** Longest headings a resume realistically uses. Past this it is a sentence. */
const MAX_HEADING_CHARS = 45

/**
 * Shortest a heading can be.
 *
 * "London, ON" wraps so that "ON" lands on a line of its own, in capitals and
 * short — everything the typography rule looks for. Read as a heading it split
 * the education entry it belonged to in half. No section is named in two
 * letters, so the floor costs nothing.
 */
const MIN_HEADING_CHARS = 4

export interface DetectedSection {
  /** The heading exactly as written, for showing the user what we found. */
  heading: string
  /** Null when the heading is real but we have no standard section for it. */
  id: StandardSectionId | null
  lines: TextLine[]
}

/** Vocabulary terms longest first, so "work experience" wins over "work". */
const TERMS = [...LOOKUP.keys()].sort((a, b) => b.length - a.length)

/**
 * Matches a heading against the vocabulary.
 *
 * Exact match first, then the last words of the heading. English section
 * headings put the noun last — "Professional Summary", "Relevant Projects",
 * "Technical Skills" — so the tail is what carries the meaning.
 *
 * Matching the tail rather than anywhere in the string is deliberate: "Work
 * Authorization" contains "work" and is not a work history, and a wrong mapping
 * is worse than an unmapped section the user can see and correct.
 */
function isHeadingByVocabulary(line: TextLine): StandardSectionId | undefined {
  const heading = normalise(line.text)
  if (heading === '') return undefined

  const exact = LOOKUP.get(heading)
  if (exact) return exact

  /**
   * Tail matching only applies to something short enough to be a heading.
   *
   * A summary opening "Co-op student … with hands-on experience" ends on the
   * word "experience" and was read as the work history, which swallowed the
   * summary whole and filed its remaining lines as jobs. The length cap was
   * only being applied to the typography rule, and a sentence is not a heading
   * however it ends.
   */
  if (line.text.trim().length > MAX_HEADING_CHARS) return undefined

  for (const term of TERMS) {
    if (heading === term || heading.endsWith(` ${term}`)) return LOOKUP.get(term)
  }
  return undefined
}

/**
 * Typography-based fallback. Only used when vocabulary found nothing, and kept
 * deliberately strict: a false heading splits an entry in half, which is worse
 * than an unrecognised section the user can rename.
 */
function looksLikeHeading(line: TextLine, bodySize: number, largestSize: number): boolean {
  const text = line.text.trim()
  if (text.length < MIN_HEADING_CHARS || text.length > MAX_HEADING_CHARS) return false
  // The biggest type on the page is the person's name, and it is bold and
  // short — which is exactly what a heading looks like. Names are never
  // headings, so size rules this line out before anything else can promote it.
  if (line.size >= largestSize) return false
  // An entry header carries a date; a section heading does not.
  if (parseDateRange(text)) return false
  if (/[.;]$/.test(text)) return false
  if (/^[•\-*‣▪·]/.test(text)) return false
  // Contact details are short and near the top but are not headings.
  if (/@|https?:|\+\d/.test(text)) return false

  const allCaps = text === text.toUpperCase() && /[A-Z]/.test(text)
  const larger = line.size > bodySize + 0.6
  return (allCaps && text.split(/\s+/).length <= 5) || (line.bold && larger)
}

/** The most common text size on the page, which is the body size. */
export function bodyTextSize(lines: TextLine[]): number {
  const counts = new Map<number, number>()
  for (const line of lines) {
    const key = Math.round(line.size * 2) / 2
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best = 0
  let bestCount = -1
  for (const [size, count] of counts) {
    if (count > bestCount) [best, bestCount] = [size, count]
  }
  return best
}

/**
 * Splits the document at its headings. Lines before the first heading are the
 * header block — name, headline and contact details — and are returned
 * separately because they follow none of the section rules.
 */
export function detectSections(lines: TextLine[]): {
  header: TextLine[]
  sections: DetectedSection[]
} {
  const bodySize = bodyTextSize(lines)
  const largestSize = Math.max(0, ...lines.map((l) => l.size))
  const header: TextLine[] = []
  const sections: DetectedSection[] = []

  for (const [index, line] of lines.entries()) {
    const known = isHeadingByVocabulary(line)
    // No resume opens with a section heading; it opens with a name.
    const isHeading =
      index > 0 && (known !== undefined || looksLikeHeading(line, bodySize, largestSize))

    if (isHeading) {
      sections.push({ heading: line.text.trim(), id: known ?? null, lines: [] })
      continue
    }
    if (sections.length === 0) header.push(line)
    else sections.at(-1)?.lines.push(line)
  }

  return { header, sections }
}
