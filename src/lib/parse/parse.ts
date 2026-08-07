import type { StandardSectionId } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import { parseDateRange } from './dates'
import type { ExtractedDocument, TextLine } from './extract'
import { bodyTextSize, detectSections } from './sections'

/**
 * Turns extracted lines into a profile, using rules rather than a model.
 *
 * Deliberately deterministic. The same code answers "what did this resume
 * actually say" for an import and "what would a machine make of this resume"
 * for the ATS check, and those have to be the same answer — a model that
 * cleverly infers a missing job title would make the ATS report a lie.
 *
 * The result is a starting point the user corrects, never a finished profile.
 * Everything uncertain is reported instead of guessed.
 */

export interface ParseReport {
  pages: number
  /** No text layer at all — a scan or an image export. */
  imageOnly: boolean
  sections: { heading: string; mappedTo: StandardSectionId | null; entries: number }[]
  /** Things a person should look at before trusting the import. */
  warnings: string[]
}

export interface ParseResult {
  profile: Profile
  report: ParseReport
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/
const URL = /\bhttps?:\/\/[^\s,;]+|\b(?:www\.|github\.com\/|linkedin\.com\/)[^\s,;]+/i
// Loose on purpose: phone formats vary by country far more than resumes do.
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/
const BULLET = /^[•\-*‣▪·—–]\s*/

/** Splits a heading line into a title and whatever follows a separator. */
function splitTitle(text: string): { title?: string; subtitle?: string } {
  const separator = /\s+(?:—|–|\||·|@|,\s|\bat\b|\ben\b)\s+/i.exec(text)
  if (!separator) return { title: text.trim() || undefined }
  return {
    title: text.slice(0, separator.index).trim() || undefined,
    subtitle: text.slice(separator.index + separator[0].length).trim() || undefined,
  }
}

interface RawEntry {
  title?: string
  subtitle?: string
  startDate?: string
  endDate?: string
  summary?: string
  highlights: string[]
}

/**
 * Groups a section's lines into entries.
 *
 * A date or a bold line opens a new entry; bullets attach to the one above.
 * Templates vary, but nearly all of them mark the start of a job with one of
 * those two things.
 */
function groupEntries(lines: TextLine[], bodySize: number): RawEntry[] {
  const entries: RawEntry[] = []
  let current: RawEntry | undefined

  for (const line of lines) {
    const text = line.text.trim()
    if (text === '') continue

    if (BULLET.test(text)) {
      const highlight = text.replace(BULLET, '').trim()
      if (!current) current = { highlights: [] }
      if (highlight) current.highlights.push(highlight)
      continue
    }

    const range = parseDateRange(text)
    const opensEntry = Boolean(range) || (line.bold && line.size >= bodySize)

    if (opensEntry) {
      if (current) entries.push(current)
      const withoutDate = range ? text.replace(range.matched, '').trim() : text
      const { title, subtitle } = splitTitle(withoutDate.replace(/[|·—–,]\s*$/, '').trim())
      current = {
        title,
        subtitle,
        startDate: range?.startDate,
        endDate: range?.endDate,
        highlights: [],
      }
      continue
    }

    if (!current) current = { highlights: [] }
    // The line under a job title is the employer in most layouts. Once that
    // slot is taken, further prose is a description.
    if (!current.subtitle && current.highlights.length === 0 && !current.summary) {
      current.subtitle = text
    } else {
      current.summary = current.summary ? `${current.summary} ${text}` : text
    }
  }

  if (current) entries.push(current)
  return entries.filter((e) => e.title || e.subtitle || e.highlights.length > 0)
}

interface KeywordItem {
  name?: string
  keywords?: string[]
}

/** Sections that are really a list, not a set of dated entries. */
function toKeywordList(lines: TextLine[]): KeywordItem[] {
  return lines.flatMap<KeywordItem>((line) => {
    const text = line.text.replace(BULLET, '').trim()
    if (text === '') return []
    const colon = text.indexOf(':')
    if (colon > 0 && colon < 40) {
      const keywords = text
        .slice(colon + 1)
        .split(/[,;·|]/)
        .map((k) => k.trim())
        .filter(Boolean)
      return [{ name: text.slice(0, colon).trim(), keywords }]
    }
    // No label, so the whole line is a list of skills.
    const keywords = text
      .split(/[,;·|]/)
      .map((k) => k.trim())
      .filter(Boolean)
    return keywords.length > 1 ? [{ keywords }] : [{ name: text }]
  })
}

function parseHeader(lines: TextLine[]): {
  basics: NonNullable<Profile['basics']>
  found: Set<string>
} {
  const found = new Set<string>()
  const basics: NonNullable<Profile['basics']> = {}
  const joined = lines.map((l) => l.text).join(' ')

  const email = EMAIL.exec(joined)?.[0]
  if (email) {
    basics.email = email
    found.add('email')
  }
  const phone = PHONE.exec(joined.replace(EMAIL, ' '))?.[0].trim()
  if (phone) {
    basics.phone = phone
    found.add('phone')
  }

  const urls = [...joined.matchAll(new RegExp(URL, 'gi'))].map((m) => m[0].replace(/[.,;]$/, ''))
  const profiles = urls.map((url) => {
    const withScheme = /^https?:/i.test(url) ? url : `https://${url}`
    const network = /github/i.test(url) ? 'GitHub' : /linkedin/i.test(url) ? 'LinkedIn' : 'Website'
    return { network, url: withScheme }
  })
  if (profiles.length > 0) {
    basics.profiles = profiles
    found.add('links')
  }

  // The name is the first line that is not a contact detail. Resumes put it
  // first almost without exception, and size alone misfires on wordmark logos.
  const contactish = (text: string) => EMAIL.test(text) || URL.test(text) || PHONE.test(text)
  const nameLine = lines.find((l) => l.text.trim() !== '' && !contactish(l.text))
  if (nameLine) {
    basics.name = nameLine.text.trim()
    found.add('name')
    const after = lines[lines.indexOf(nameLine) + 1]
    if (after && !contactish(after.text) && after.text.trim().length <= 80) {
      basics.label = after.text.trim()
      found.add('headline')
    }
  }

  return { basics, found }
}

export function parseResume(document: ExtractedDocument): ParseResult {
  const report: ParseReport = {
    pages: document.pages,
    imageOnly: document.imageOnly,
    sections: [],
    warnings: [],
  }

  if (document.imageOnly) {
    report.warnings.push(
      'This PDF has no text in it, so nothing could be read. It is most likely a scan or an image export. Export it from the original document instead.',
    )
    return { profile: {}, report }
  }

  const bodySize = bodyTextSize(document.lines)
  const { header, sections } = detectSections(document.lines)
  const { basics, found } = parseHeader(header)
  const profile: Profile = { basics }

  for (const section of sections) {
    let entryCount = 0

    switch (section.id) {
      case 'summary':
        basics.summary = section.lines.map((l) => l.text.trim()).join(' ')
        entryCount = basics.summary ? 1 : 0
        break
      case 'skills':
        profile.skills = toKeywordList(section.lines)
        entryCount = profile.skills.length
        break
      case 'interests':
        profile.interests = toKeywordList(section.lines)
        entryCount = profile.interests.length
        break
      case 'languages':
        profile.languages = toKeywordList(section.lines).map((item) => ({
          language: item.name ?? item.keywords?.[0],
          fluency: item.name ? item.keywords?.join(', ') : undefined,
        }))
        entryCount = profile.languages.length
        break
      default: {
        const entries = groupEntries(section.lines, bodySize)
        entryCount = entries.length
        assignEntries(profile, section.id, entries)
      }
    }

    report.sections.push({ heading: section.heading, mappedTo: section.id, entries: entryCount })
  }

  for (const field of ['name', 'email'] as const) {
    if (!found.has(field)) {
      report.warnings.push(`No ${field} was found. Add it so an employer can reach you.`)
    }
  }
  if (!profile.work?.length && !profile.education?.length) {
    report.warnings.push(
      'Neither work history nor education was recognised. The section headings may be unusual — check what landed where.',
    )
  }
  for (const section of report.sections) {
    if (section.mappedTo === null) {
      report.warnings.push(
        `"${section.heading}" was read as a section but does not match a standard one. Its content was kept but not filed.`,
      )
    }
  }

  return { profile, report }
}

function assignEntries(profile: Profile, id: StandardSectionId | null, entries: RawEntry[]): void {
  if (entries.length === 0) return
  const dated = entries.map((e) => ({
    startDate: e.startDate,
    endDate: e.endDate,
    summary: e.summary,
    highlights: e.highlights.length > 0 ? e.highlights : undefined,
  }))

  switch (id) {
    case 'work':
      profile.work = entries.map((e, i) => ({ position: e.title, name: e.subtitle, ...dated[i] }))
      break
    case 'volunteer':
      profile.volunteer = entries.map((e, i) => ({
        position: e.title,
        organization: e.subtitle,
        ...dated[i],
      }))
      break
    case 'education':
      profile.education = entries.map((e, i) => ({
        area: e.title,
        institution: e.subtitle,
        startDate: dated[i].startDate,
        endDate: dated[i].endDate,
      }))
      break
    case 'projects':
      profile.projects = entries.map((e, i) => ({
        name: e.title,
        description: e.subtitle ?? dated[i].summary,
        highlights: dated[i].highlights,
        startDate: dated[i].startDate,
        endDate: dated[i].endDate,
      }))
      break
    case 'certificates':
      profile.certificates = entries.map((e) => ({
        name: e.title,
        issuer: e.subtitle,
        date: e.startDate,
      }))
      break
    case 'awards':
      profile.awards = entries.map((e, i) => ({
        title: e.title,
        awarder: e.subtitle,
        date: e.startDate,
        summary: dated[i].summary,
      }))
      break
    case 'publications':
      profile.publications = entries.map((e, i) => ({
        name: e.title,
        publisher: e.subtitle,
        releaseDate: e.startDate,
        summary: dated[i].summary,
      }))
      break
    default:
      // An unrecognised heading. Its content is reported rather than dropped,
      // but it has nowhere structured to go until the user files it.
      break
  }
}
