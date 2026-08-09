import type { Profile } from '@/lib/resume/profile'
import { ARRANGEMENT_LABELS } from '@/lib/resume/arrangements'
import { formatDate, formatRange } from '@/lib/typst/model'

/**
 * Finds the form field a line of the rendered PDF came from.
 *
 * The preview is a picture of the document, not a view onto the form, so there
 * is no link between the two to follow. Matching on the text itself is what
 * gives one: whatever a click landed on is a value the user typed somewhere,
 * and the field holding it is the one to open.
 *
 * Nothing here needs to be exact. Missing a match costs a click; a wrong match
 * costs a moment's confusion, so ties are broken towards the most specific
 * field rather than the largest one that happens to contain the words.
 */

export interface FieldEntry {
  /** A react-hook-form path, e.g. "work.0.position". */
  path: string
  text: string
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function buildFieldIndex(profile: Profile): FieldEntry[] {
  const entries: FieldEntry[] = []
  const add = (path: string, value?: string) => {
    const text = normalise(value ?? '')
    if (text.length >= 2) entries.push({ path, text })
  }

  add('basics.name', profile.basics?.name)
  add('basics.label', profile.basics?.label)
  add('basics.summary', profile.basics?.summary)
  add('basics.email', profile.basics?.email)
  add('basics.phone', profile.basics?.phone)
  add('basics.url', profile.basics?.url)
  add('basics.location.city', profile.basics?.location?.city)

  /**
   * Dates print formatted ("Aug 2023 - Feb 2024") and are stored raw
   * ("2023-08"), so the printed form has to be indexed or clicking a date finds
   * nothing. The range is a single run in the PDF and cannot be split by which
   * half was clicked, so it opens the start date; the end date sits beside it.
   */
  const addDates = (path: string, start?: string, end?: string) => {
    add(`${path}.startDate`, formatRange(start, end))
    add(`${path}.startDate`, formatDate(start))
    add(`${path}.endDate`, formatDate(end))
    // An open range prints "Present" where the end date would be. Clicking it
    // has to reach the end date, which is the field that would close the role.
    if (start && !end) add(`${path}.endDate`, 'Present')
  }

  profile.work?.forEach((work, index) => {
    add(`work.${index}.position`, work.position)
    add(`work.${index}.name`, work.name)
    add(`work.${index}.location`, work.location)
    add(`work.${index}.arrangement`, work.arrangement && ARRANGEMENT_LABELS[work.arrangement])
    addDates(`work.${index}`, work.startDate, work.endDate)
    // Bullets share one textarea, so every bullet points at the same field.
    work.highlights?.forEach((highlight) => add(`work.${index}.highlights`, highlight))
  })

  profile.projects?.forEach((project, index) => {
    add(`projects.${index}.name`, project.name)
    add(`projects.${index}.description`, project.description)
    add(`projects.${index}.keywords`, project.keywords?.join(', '))
    add(`projects.${index}.url`, project.url)
    addDates(`projects.${index}`, project.startDate, project.endDate)
    project.highlights?.forEach((highlight) => add(`projects.${index}.highlights`, highlight))
  })

  profile.education?.forEach((education, index) => {
    add(`education.${index}.institution`, education.institution)
    add(`education.${index}.area`, education.area)
    add(`education.${index}.studyType`, education.studyType)
    add(`education.${index}.location`, education.location)
    addDates(`education.${index}`, education.startDate, education.endDate)
    education.courses?.forEach((course) => add(`education.${index}.courses`, course))
  })

  profile.skills?.forEach((skill, index) => {
    add(`skills.${index}.name`, skill.name)
    add(`skills.${index}.keywords`, skill.keywords?.join(', '))
  })

  // The form has blocks for these two, so a click on the page has somewhere to
  // land. Without them, clicking a language did nothing at all — the index had
  // no entry to match and the click was silently dropped.
  profile.languages?.forEach((language, index) => {
    add(`languages.${index}.language`, language.language)
    add(`languages.${index}.fluency`, language.fluency)
  })

  profile.certificates?.forEach((certificate, index) => {
    add(`certificates.${index}.name`, certificate.name)
    add(`certificates.${index}.issuer`, certificate.issuer)
    add(`certificates.${index}.date`, formatDate(certificate.date))
  })

  return entries
}

/** One piece of a run, and where it starts inside it. */
interface Segment {
  text: string
  start: number
}

/**
 * Splits a run at the punctuation the template composes fields with.
 *
 * A drawn run is often several fields at once: "Retail Grid, Toronto, ON" is an
 * employer and a place, "Feb 2023 - Present" is two dates, and "Spanish:" is a
 * language and the colon set after it. Matched whole, none of those reach the
 * field they came from — the run equals no field, contains no field, and is
 * too short for the last-resort rule to reach into.
 */
function segmentsOf(text: string): Segment[] {
  const separators = /[,:|·]|\s[-—–]\s/g
  const parts: Segment[] = []
  let start = 0
  for (const match of text.matchAll(separators)) {
    parts.push({ text: text.slice(start, match.index), start })
    start = match.index + match[0].length
  }
  parts.push({ text: text.slice(start), start })
  return parts.filter((part) => part.text.trim() !== '')
}

/**
 * Picks the field a clicked run of text belongs to.
 *
 * A run from a PDF is a fragment: one line of a paragraph, or a date sitting
 * beside a title. So a field matches when either side contains the other, and
 * the shortest match wins — "Nomad Analytics" should select the employer, not
 * the summary paragraph that happens to mention it.
 *
 * `at` is where along the run the pointer landed, from 0 to 1. It is what tells
 * the employer from the place beside it, and the start of a date range from its
 * end — the run alone cannot say which half was meant.
 */
export function findField(index: FieldEntry[], clicked: string, at?: number): string | undefined {
  const parts = segmentsOf(clicked)

  // With a position and something to choose between, the piece under the
  // pointer is the answer if it matches anything at all.
  if (at !== undefined && parts.length > 1) {
    const offset = Math.round(Math.min(Math.max(at, 0), 1) * clicked.length)
    const under =
      parts.find((part) => offset >= part.start && offset <= part.start + part.text.length) ??
      parts[0]
    const hit = matchWhole(index, under.text)
    if (hit) return hit
  }

  // Otherwise the run as it was drawn, and only then its opening piece — which
  // is what reaches the language behind "Spanish:".
  return matchWhole(index, clicked) ?? (parts[0] && matchWhole(index, parts[0].text))
}

function matchWhole(index: FieldEntry[], clicked: string): string | undefined {
  const needle = normalise(clicked)
  if (needle.length < 2) return undefined

  // An exact match settles it. Without this, clicking a headline that reads
  // "ML Engineer | Data Scientist" selects the job title inside it, because
  // that field is shorter and shortest-wins is only a tie-breaker.
  const exact = index.find((entry) => entry.text === needle)
  if (exact) return exact.path

  // Then the normal case: a click lands on one line of a longer field, so the
  // field contains what was clicked. Shortest wins, being the most specific.
  const containing = index.filter((entry) => entry.text.includes(needle))
  if (containing.length > 0) {
    return containing.reduce((a, b) => (a.text.length <= b.text.length ? a : b)).path
  }

  /**
   * Last resort, and deliberately restricted: a field short enough to sit
   * inside the clicked line. Unrestricted, a skills group called "Tools"
   * matched a summary sentence ending in "labelling tools" and sent the user to
   * the wrong section entirely. Requiring a substantial field and a whole-word
   * hit makes an accidental collision unlikely enough to be worth the reach.
   */
  const contained = index.filter(
    (entry) =>
      entry.text.length >= MIN_CONTAINED_CHARS &&
      new RegExp(`\\b${escapeRegExp(entry.text)}\\b`).test(needle),
  )
  if (contained.length === 0) return undefined
  return contained.reduce((a, b) => (a.text.length >= b.text.length ? a : b)).path
}

/** Short enough to appear inside a sentence by accident. */
const MIN_CONTAINED_CHARS = 12

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
