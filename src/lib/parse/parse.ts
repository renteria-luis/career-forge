import type { StandardSectionId } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import { parseDateRange, type DateRange } from './dates'
import { splitEmployer } from './employment'
import { splitKeywords } from '@/lib/resume/keywords'
import { COLUMN_BREAK, type ExtractedDocument, type TextLine } from './extract'
import { findPlace } from './location'
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
  /** The paper the file was set on, when recognisable. */
  paper?: 'a4' | 'letter'
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

/**
 * Nobody writes "https://" on a resume, so a bare domain has to be recognised.
 * Anchored on a known top-level domain rather than "any dot", or "Node.js",
 * "e.g." and version numbers all read as addresses.
 */
const TLD =
  'com|me|dev|io|net|org|co|ai|app|xyz|tech|page|site|info|edu|gov|design|studio|' +
  'ca|us|uk|es|pe|mx|ar|cl|br|de|fr|it|nl|se|jp|in|au'
const URL = new RegExp(
  `\\bhttps?://[^\\s,;|]+|\\b(?:[a-z0-9-]+\\.)+(?:${TLD})\\b(?:/[^\\s,;|]*)?`,
  'i',
)
// Loose on purpose: phone formats vary by country far more than resumes do.
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/
const BULLET = /^[•\-*‣▪·—–]\s*/

/** Past this, a colon is punctuation in a sentence rather than a field label. */
const LABEL_MAX_CHARS = 40

/** Longest an employer or institution name realistically runs. */
const NAME_MAX_CHARS = 60

/**
 * How much further right a line must sit to count as a wrapped continuation
 * rather than a new line of its own. Hanging indents are several points; this
 * is small enough to catch them and large enough to survive rounding.
 */
const INDENT_TOLERANCE = 2

/** Removes any column marker, for text going into a profile field. */
function flatten(text: string): string {
  return text.split(COLUMN_BREAK).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Splits an entry line into its columns and pulls the date off the right.
 *
 * Templates right-align the date against the title on the same line, so the
 * rightmost column is where it lives. Reading it from there rather than
 * searching the whole line is what keeps trailing qualifiers attached to it —
 * "Sep 2025 - Present (Expected Dec 2026)" is one date column, and hunting for
 * a range inside the whole line stripped only part of it and left the remainder
 * stuck on the end of the degree title.
 */
function splitColumns(text: string): { left: string; date?: DateRange } {
  const columns = text.split(COLUMN_BREAK)
  if (columns.length > 1) {
    const last = columns.at(-1)!.trim()
    const date = parseDateRange(last)
    // A right-aligned date column opens with the date. Judging by where the
    // match starts rather than how much of the column it covers is what keeps
    // trailing qualifiers with it: "Sep 2025 - Present (Expected Dec 2026)" is
    // one date column, and a length test throws the qualifier back onto the
    // degree title.
    if (date && last.indexOf(date.matched) <= 2) {
      return { left: columns.slice(0, -1).join(' ').trim(), date }
    }
  }
  const flat = flatten(text)
  const date = parseDateRange(flat)
  if (!date) return { left: flat }

  // A long title can sit close enough to its date that no column break is
  // detected, and then removing just the range leaves the qualifier behind —
  // "… (Co-op) (Expected Dec 2026)". Any trailing parenthetical carrying a year
  // belongs to the date, not the title.
  const left = flat
    .replace(date.matched, ' ')
    .replace(/\((?:[^()]*\b(?:19|20)\d{2}\b[^()]*)\)\s*$/, '')
    .replace(/[\s|·—–,-]+$/, '')
    .trim()
  return { left, date }
}

/** Splits a heading line into a title and whatever follows a separator. */
function splitTitle(text: string): { title?: string; subtitle?: string } {
  const separator = /\s+(?:—|–|\||·|@|,\s|\bat\b|\ben\b)\s+/i.exec(text)
  if (!separator) return { title: text.trim() || undefined }
  return {
    title: text.slice(0, separator.index).trim() || undefined,
    subtitle:
      text
        .slice(separator.index + separator[0].length)
        .replace(/^[|·—–,]\s*/, '')
        .trim() || undefined,
  }
}

interface RawEntry {
  title?: string
  subtitle?: string
  /**
   * The subtitle line as it was set, columns and all.
   *
   * `subtitle` is the left column flattened, which is what an issuer or a
   * publisher wants. A job needs the rest of the line too: the template
   * right-aligns how the job was worked against the employer, and reading only
   * the left column threw that away.
   */
  subtitleLine?: string
  startDate?: string
  endDate?: string
  summary?: string
  highlights: string[]
  /** A line under the entry that is nothing but an address. */
  url?: string
}

/** True when a line is an address and nothing else. */
function isBareUrl(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '' || /\s/.test(trimmed)) return false
  return new RegExp(`^(?:${URL.source})$`, 'i').test(trimmed)
}

/**
 * Groups a section's lines into entries.
 *
 * A date or a bold line opens a new entry; bullets attach to the one above.
 * Templates vary, but nearly all of them mark the start of a job with one of
 * those two things.
 */
/**
 * Rejoins a line that wrapped mid-phrase.
 *
 * "… | Fanshawe College, London," runs out of width and leaves "ON" on a line
 * of its own. Nothing about the fragment says what it is, but the line above it
 * ends on a comma, and a line ending on a separator has not finished.
 *
 * Only applied to lines at the same indent that carry no bullet, so a genuine
 * next entry is never swallowed.
 */
function joinDanglingLines(lines: TextLine[]): TextLine[] {
  const joined: TextLine[] = []

  for (const line of lines) {
    const previous = joined.at(-1)
    const dangles = previous !== undefined && /[,|·\-–—/]$/.test(previous.text.trim())
    const continues =
      dangles &&
      !BULLET.test(line.text.trim()) &&
      Math.abs(line.x - previous.x) < 2 &&
      !parseDateRange(line.text)

    if (continues) {
      joined[joined.length - 1] = {
        ...previous,
        text: `${previous.text.trim()} ${line.text.trim()}`,
      }
      continue
    }
    joined.push(line)
  }

  return joined
}

function groupEntries(rawLines: TextLine[], bodySize: number): RawEntry[] {
  const lines = joinDanglingLines(rawLines)
  const entries: RawEntry[] = []
  let current: RawEntry | undefined
  /**
   * Left edge of the bullet currently being read.
   *
   * A bullet that runs past one line wraps with a hanging indent, so the
   * continuation sits further right than the marker while carrying no marker of
   * its own. Without this it reads as loose prose, and half of every long
   * bullet ends up in the entry description instead of the bullet it belongs to.
   */
  let bulletX: number | undefined

  for (const line of lines) {
    const text = line.text.trim()
    if (text === '') continue

    if (BULLET.test(text)) {
      const highlight = flatten(text.replace(BULLET, ''))
      if (!current) current = { highlights: [] }
      if (highlight) current.highlights.push(highlight)
      bulletX = line.x
      continue
    }

    // Projects and portfolios put a repository address on its own line under
    // the title. It is a field, not a sentence, so it must not land in prose.
    if (current && !current.url && isBareUrl(text)) {
      current.url = /^https?:/i.test(text.trim()) ? text.trim() : `https://${text.trim()}`
      continue
    }

    const lastHighlight = current?.highlights.at(-1)
    if (bulletX !== undefined && lastHighlight && line.x > bulletX + INDENT_TOLERANCE) {
      current!.highlights[current!.highlights.length - 1] = `${lastHighlight} ${flatten(text)}`
      continue
    }

    const { left, date } = splitColumns(text)
    const opensEntry = Boolean(date) || (line.bold && line.size >= bodySize)

    if (opensEntry) {
      if (current) entries.push(current)
      bulletX = undefined
      const { title, subtitle } = splitTitle(
        left
          .replace(/[|·—–,]\s*$/, '')
          .replace(/^[|·—–,]\s*/, '')
          .trim(),
      )
      current = {
        title,
        subtitle,
        startDate: date?.startDate,
        endDate: date?.endDate,
        highlights: [],
      }
      continue
    }

    if (!current) current = { highlights: [] }
    // The line under a job title is the employer, with anything right-aligned
    // beside it — where the job was, or how it was worked. Only the left column
    // decides whether this reads as a name at all; the whole line is kept so
    // the right of it can be read for the fields that now exist.
    const [firstColumn] = text.split(COLUMN_BREAK)
    const name = flatten(firstColumn)
    /**
     * An employer or an institution is a name: short, and not a sentence.
     * Without this guard, a paragraph of detail sitting under a degree — "GPA
     * 4.18/4.2, Dean's Honour Roll. Coursework: …" — was filed as the college.
     */
    const looksLikeName = name.length <= NAME_MAX_CHARS && !/[.;]$/.test(name)
    if (!current.subtitle && current.highlights.length === 0 && !current.summary && looksLikeName) {
      current.subtitle = name
      current.subtitleLine = text
    } else {
      const line = flatten(text)
      current.summary = current.summary ? `${current.summary} ${line}` : line
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
  const items: KeywordItem[] = []
  /** True when the last item came from a "Label: a, b, c" line. */
  let labelled = false

  for (const line of lines) {
    const text = flatten(line.text.replace(BULLET, ''))
    if (text === '') continue

    const colon = text.indexOf(':')
    const hasLabel = colon > 0 && colon < LABEL_MAX_CHARS

    /**
     * A skills line that runs past the width of the page wraps with no marker
     * and no indent, so position says nothing about it. What does say something
     * is weight: the label that opens the line is bold and the wrap is not.
     *
     * Without this the tail of a long skill group becomes a group of its own
     * with an empty name, which is exactly how it looked in the form.
     */
    if (!hasLabel && !line.bold && labelled && items.length > 0) {
      const last = items[items.length - 1]
      last.keywords = [...(last.keywords ?? []), ...splitKeywords(text)]
      continue
    }

    if (hasLabel) {
      items.push({
        name: text.slice(0, colon).trim(),
        keywords: splitKeywords(text.slice(colon + 1)),
      })
      labelled = true
      continue
    }

    // No label, so the whole line is a list of skills.
    const keywords = splitKeywords(text)
    items.push(keywords.length > 1 ? { keywords } : { name: text })
    labelled = false
  }

  return items
}

/**
 * Reads one language and the level beside it.
 *
 * Every shape a resume writes it in: "Spanish: Native", "Spanish (Native)",
 * "Spanish [C2]", "Spanish - Native", or the language on its own.
 */
function toLanguage(text: string): { language?: string; fluency?: string } | undefined {
  const item = text.trim()
  if (item === '') return undefined

  const bracketed = /^(.*?)\s*[([]([^)\]]+)[)\]]\s*$/.exec(item)
  if (bracketed) return { language: bracketed[1].trim(), fluency: bracketed[2].trim() }

  const colon = item.indexOf(':')
  if (colon > 0) {
    return {
      language: item.slice(0, colon).trim(),
      fluency: item.slice(colon + 1).trim() || undefined,
    }
  }

  // Spaces are required around the dash: a language can carry a hyphen, and
  // "Serbo-Croatian" is one name rather than a level.
  const dashed = /^(.*?)\s+[-–—]\s+(.*)$/.exec(item)
  if (dashed) return { language: dashed[1].trim(), fluency: dashed[2].trim() }

  return { language: item }
}

/**
 * Languages, however they are laid out.
 *
 * They arrive run together on one line — "English: Advanced, Spanish: Native"
 * or "English (advanced) | Spanish (native)" — or one per line as bullets. Each
 * piece is its own language either way.
 *
 * They used to be read through the skills reader, which is built for a line
 * like "Machine learning: PyTorch, scikit-learn": one label, then a list that
 * belongs to it. Applied to languages that makes the first language the label
 * and everything after it the level, so "English: Advanced, Spanish: Native,
 * French: Basic" came back as English with a fluency of "Advanced, Spanish:
 * Native, French: Basic". Languages are a list of pairs, not a labelled list,
 * and they need their own reader.
 */
export function toLanguages(lines: TextLine[]): { language?: string; fluency?: string }[] {
  const languages: { language?: string; fluency?: string }[] = []

  for (const line of lines) {
    const text = flatten(line.text.replace(BULLET, ''))
    if (text === '') continue
    // splitKeywords knows the separators a written list uses and leaves what is
    // inside brackets alone, so "Spanish (Native, C2)" stays one language.
    for (const piece of splitKeywords(text)) {
      const entry = toLanguage(piece)
      if (entry?.language) languages.push(entry)
    }
  }

  return languages
}

/**
 * Softens a shouted name.
 *
 * Resumes often set the name in capitals as a typographic choice, but the
 * stored value is the person's name, not a style — and every template that
 * wants capitals can apply them. A name already written in mixed case is left
 * exactly as it is, because "McDonald" and "van der Berg" know better than a
 * rule does.
 */
export function toTitleCase(name: string): string {
  if (/[a-z]/.test(name)) return name
  return name
    .toLowerCase()
    .replace(
      /(^|[\s'\u2019-])([a-z\u00e0-\u00ff])/g,
      (_, before: string, letter: string) => before + letter.toUpperCase(),
    )
}

function parseHeader(lines: TextLine[]): {
  basics: NonNullable<Profile['basics']>
  found: Set<string>
} {
  const found = new Set<string>()
  const basics: NonNullable<Profile['basics']> = {}
  const joined = lines.map((l) => l.text.split(COLUMN_BREAK).join(' ')).join(' ')

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

  // Strip the email out first: its domain would otherwise read as a bare URL.
  const withoutEmails = joined.replace(new RegExp(EMAIL, 'gi'), ' ')
  const urls = [
    ...new Set(
      [...withoutEmails.matchAll(new RegExp(URL, 'gi'))].map((m) => m[0].replace(/[.,;]$/, '')),
    ),
  ]

  const profiles: { network: string; url: string }[] = []
  for (const raw of urls) {
    const href = /^https?:/i.test(raw) ? raw : `https://${raw}`
    if (/github\./i.test(raw)) profiles.push({ network: 'GitHub', url: href })
    else if (/linkedin\./i.test(raw)) profiles.push({ network: 'LinkedIn', url: href })
    // A personal site is the person's own address, not a profile on someone
    // else's platform, so it belongs in basics.url where the template expects it.
    else if (!basics.url) basics.url = href
    else profiles.push({ network: 'Website', url: href })
  }
  if (profiles.length > 0) basics.profiles = profiles
  if (profiles.length > 0 || basics.url) found.add('links')

  // Location sits in the same run of details as the phone and the email.
  const segments = lines.flatMap((line) =>
    line.text.split(COLUMN_BREAK).flatMap((part) => part.split(/[|·•]/)),
  )
  const place = findPlace(segments)
  if (place) {
    basics.location = place
    found.add('location')
  }

  // The name is the first line that is not a contact detail. Resumes put it
  // first almost without exception, and size alone misfires on wordmark logos.
  const contactish = (text: string) => EMAIL.test(text) || URL.test(text) || PHONE.test(text)
  const nameLine = lines.find((l) => l.text.trim() !== '' && !contactish(l.text))
  if (nameLine) {
    basics.name = toTitleCase(flatten(nameLine.text))
    found.add('name')
    const after = lines[lines.indexOf(nameLine) + 1]
    if (after && !contactish(after.text) && after.text.trim().length <= 80) {
      basics.label = flatten(after.text)
      found.add('headline')
    }
  }

  return { basics, found }
}

export function parseResume(document: ExtractedDocument): ParseResult {
  const report: ParseReport = {
    pages: document.pages,
    paper: document.paper,
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
        basics.summary = section.lines.map((l) => flatten(l.text)).join(' ')
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
        profile.languages = toLanguages(section.lines)
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
      profile.work = entries.map((e, i) => {
        // The employer line carries where the job was and how it was worked.
        const { name, location, arrangement } = splitEmployer(e.subtitleLine ?? e.subtitle)
        return { position: e.title, name, location, arrangement, ...dated[i] }
      })
      break
    case 'volunteer':
      profile.volunteer = entries.map((e, i) => ({
        position: e.title,
        organization: e.subtitle,
        ...dated[i],
      }))
      break
    case 'education':
      profile.education = entries.map((e, i) => {
        // Same line, same split — "Fanshawe College | London, ON".
        const { name, location } = splitEmployer(e.subtitleLine ?? e.subtitle)
        return {
          area: e.title,
          institution: name,
          location,
          startDate: dated[i].startDate,
          endDate: dated[i].endDate,
          // GPA, honours and coursework sit under a degree the way achievements
          // sit under a job. Written as bullets they arrive as bullets; written as
          // a paragraph they are still details, not a description of the degree.
          courses: dated[i].highlights ?? (dated[i].summary ? [dated[i].summary] : undefined),
          url: e.url,
        }
      })
      break
    case 'projects':
      profile.projects = entries.map((e, i) => ({
        name: e.title,
        // "Pipeline | Python, Pandas, SQL" puts the stack after a pipe on the
        // title line. Read as a description it becomes a sentence that is not
        // one; read as keywords it is what it actually is.
        keywords: e.subtitle ? splitKeywords(e.subtitle) : undefined,
        description: dated[i].summary,
        highlights: dated[i].highlights,
        startDate: dated[i].startDate,
        endDate: dated[i].endDate,
        url: e.url,
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
