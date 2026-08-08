import type { Arrangement } from '@/lib/resume/profile'
import { splitTrailingPlace } from './location'

/**
 * Reads an employer line into the employer, where the job was, and how it was
 * worked.
 *
 * The line under a job title carries all three run together: "Nomad Analytics |
 * Toronto, ON | Remote". Read whole it becomes an employer nobody has heard of,
 * and the location and the arrangement are lost.
 *
 * Only an explicit separator splits it. "Acme, Inc., Toronto, ON" cannot be cut
 * on a comma without knowing that "Inc." is part of the name and "Toronto" is
 * not, and a parser that guesses puts half a company name in the location field
 * on every resume that names a company with a comma in it. Left whole it is
 * wrong in one visible way the user can fix, which is the trade this parser
 * makes everywhere else too.
 */

/**
 * What resumes put between an employer and a place.
 *
 * A tab is one of them. The extractor writes it where a line has a gap wide
 * enough to be a column, which is how a right-aligned "Remote" reaches here —
 * set against the employer it is separated by space alone, and no amount of
 * looking at the words would tell it apart from part of the name.
 */
const SEPARATOR = /\s*[|•·\t]\s*|\s*[—–]\s*|\s+-\s+/

const ARRANGEMENT_WORDS = new Map<string, Arrangement>([
  ['remote', 'remote'],
  ['fully remote', 'remote'],
  ['hybrid', 'hybrid'],
  ['on-site', 'on-site'],
  ['on site', 'on-site'],
  ['onsite', 'on-site'],
  ['in-office', 'on-site'],
  ['in office', 'on-site'],
])

/**
 * Matched only against a whole segment, never searched for inside one.
 *
 * "Remote Sensing Engineer" and "Hybrid Systems Lab" are a job title and an
 * employer, not arrangements, and a substring search files both wrongly.
 */
function readArrangement(segment: string): Arrangement | undefined {
  return ARRANGEMENT_WORDS.get(segment.toLowerCase().replace(/[().]/g, '').trim())
}

export interface Employment {
  name?: string
  location?: string
  arrangement?: Arrangement
}

export function splitEmployer(line?: string): Employment {
  const text = line?.trim()
  if (!text) return {}

  const segments = text
    .split(SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean)

  let arrangement: Arrangement | undefined
  const rest: string[] = []
  for (const segment of segments) {
    // A trailing comma part carries it as often as a segment of its own:
    // "Toronto, ON, Remote".
    const parts = segment.split(',').map((part) => part.trim())
    const tail = parts.length > 1 ? readArrangement(parts.at(-1)!) : undefined
    const whole = readArrangement(segment)

    if (whole) {
      arrangement ??= whole
      continue
    }
    if (tail) {
      arrangement ??= tail
      rest.push(parts.slice(0, -1).join(', '))
      continue
    }
    rest.push(segment)
  }

  const [first, ...place] = rest
  if (place.length > 0) {
    return { name: first || undefined, location: place.join(', '), arrangement }
  }

  // No separator to go on, so the only thing that can cut this line is knowing
  // that what it ends in is a real place. "Fanshawe College, London, ON" is one
  // the template itself writes, so an import of our own output has to survive.
  const { head, place: trailing } = splitTrailingPlace(first ?? '')
  return { name: head, location: trailing, arrangement }
}
