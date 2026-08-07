/**
 * Reads date ranges out of a line of resume text.
 *
 * People write dates every way imaginable and an importer that only understands
 * one of them loses most of a work history. Everything here returns the partial
 * ISO form the profile schema stores, so an entry remembered only as "2019"
 * stays a year rather than being padded with a month nobody wrote down.
 */

export interface DateRange {
  startDate?: string
  endDate?: string
  /** True when the range explicitly said the role is ongoing. */
  current: boolean
  /** The matched substring, so callers can strip it off the line. */
  matched: string
}

const MONTHS: Record<string, number> = {}
const MONTH_NAMES = [
  ['jan', 'january', 'ene', 'enero'],
  ['feb', 'february', 'febrero'],
  ['mar', 'march', 'marzo'],
  ['apr', 'april', 'abr', 'abril'],
  ['may', 'mayo'],
  ['jun', 'june', 'junio'],
  ['jul', 'july', 'julio'],
  ['aug', 'august', 'ago', 'agosto'],
  ['sep', 'sept', 'september', 'set', 'septiembre'],
  ['oct', 'october', 'octubre'],
  ['nov', 'november', 'noviembre'],
  ['dec', 'december', 'dic', 'diciembre'],
]
MONTH_NAMES.forEach((names, index) => {
  for (const name of names) MONTHS[name] = index + 1
})

const PRESENT = /^(present|current|now|ongoing|actualidad|actual|presente|hoy)$/i

/**
 * Anything a resume uses to mean "from … to …".
 *
 * Word separators must be surrounded by whitespace. Without that, the Spanish
 * "a" matches the one inside "Marzo" and splits the month in half.
 */
const SEPARATOR = /(?:\s*[–—-]\s*|\s+(?:to|until|hasta|até|a)\s+)/i

/**
 * Longest first. Regex alternation is ordered, so "jan" placed before "january"
 * matches the prefix and leaves "uary" behind, and the date never parses.
 */
const MONTH_WORD = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|')

/** "Feb 2023", "February 2023", "feb. 2023" */
const NAMED = new RegExp(`\\b(${MONTH_WORD})\\.?\\s+(\\d{4})\\b`, 'i')
/** "03/2021" or "3-2021" */
const NUMERIC = /\b(0?[1-9]|1[0-2])[/.-](\d{4})\b/
/** A bare year, but not something that is really a number like "2,019 users". */
const YEAR = /\b(19|20)\d{2}\b/

function pad(month: number): string {
  return String(month).padStart(2, '0')
}

/** Parses one endpoint of a range. Returns undefined when nothing reads as a date. */
export function parseDatePart(input: string): string | undefined {
  const text = input.trim()
  if (text === '') return undefined

  const named = NAMED.exec(text)
  if (named) return `${named[2]}-${pad(MONTHS[named[1].toLowerCase()])}`

  const numeric = NUMERIC.exec(text)
  if (numeric) return `${numeric[2]}-${pad(Number(numeric[1]))}`

  const year = YEAR.exec(text)
  if (year) return year[0]

  return undefined
}

/**
 * Finds the first date range on a line.
 *
 * A line with only one date is treated as a start date rather than a guess at
 * which end it belongs to — "Started 2019" is far more common on a resume than
 * a bare end date.
 */
export function parseDateRange(line: string): DateRange | undefined {
  // Work over the tail of the line first: dates sit on the right in most
  // layouts, and job titles sometimes contain years ("Web 2.0 Lead").
  const candidates = findRangeCandidates(line)

  for (const candidate of candidates) {
    const [rawStart, rawEnd] = splitOnce(candidate, SEPARATOR)
    const startDate = parseDatePart(rawStart)

    if (rawEnd !== undefined) {
      const current = PRESENT.test(rawEnd.trim())
      const endDate = current ? undefined : parseDatePart(rawEnd)
      if (startDate && (endDate || current)) {
        return { startDate, endDate, current, matched: candidate }
      }
    }

    if (startDate && rawEnd === undefined) {
      return { startDate, current: false, matched: candidate }
    }
  }

  return undefined
}

function splitOnce(input: string, separator: RegExp): [string, string?] {
  const match = separator.exec(input)
  if (!match || match.index === 0) return [input]
  return [input.slice(0, match.index), input.slice(match.index + match[0].length)]
}

/**
 * Pulls out substrings that could be a range, longest first, so a full
 * "Feb 2023 – Present" is tried before the bare "2023" inside it.
 */
function findRangeCandidates(line: string): string[] {
  const pattern = new RegExp(
    `((?:${MONTH_WORD})\\.?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\b(?:19|20)\\d{2}\\b)` +
      `(?:${SEPARATOR.source}` +
      `((?:${MONTH_WORD})\\.?\\s+\\d{4}|\\d{1,2}[/.-]\\d{4}|\\b(?:19|20)\\d{2}\\b|` +
      `present|current|now|ongoing|actualidad|actual|presente|hoy))?`,
    'gi',
  )
  return [...line.matchAll(pattern)].map((m) => m[0]).sort((a, b) => b.length - a.length)
}
