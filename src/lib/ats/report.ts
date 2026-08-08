import { parseDateRange } from '@/lib/parse/dates'
import type { ExtractedDocument, TextLine } from '@/lib/parse/extract'
import { COLUMN_BREAK } from '@/lib/parse/extract'
import type { ParseReport } from '@/lib/parse/parse'
import type { Profile } from '@/lib/resume/profile'

/**
 * What a machine makes of a resume.
 *
 * Deliberately not a score. Every other tool returns a number out of a hundred
 * that nobody can check and nothing can be done about. What is actually useful
 * is the thing itself: which fields came out, in what order the text was read,
 * and which specific choices in the document made that go wrong.
 *
 * Every check here reports something the reader can verify against their own
 * file and act on. If a check cannot name a change, it does not belong.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface Check {
  id: string
  status: CheckStatus
  title: string
  /** What was found, in the reader's terms. */
  detail: string
  /** What to do about it. Absent when there is nothing to do. */
  advice?: string
}

export interface AtsReport {
  checks: Check[]
  /** Lines in the order a parser reads them, for showing the reader directly. */
  readingOrder: string[]
  pages: number
}

/** Text this close to the top or bottom edge sits where headers and footers go. */
const EDGE_MARGIN_PT = 34

/** How far apart two left edges must be before they read as separate columns. */
const COLUMN_SEPARATION_PT = 100

/** How much of the page the second column must hold to count as one. */
const MINORITY_SHARE = 0.12

/** True when a run of text is essentially just a date or a date range. */
function isMostlyDate(text: string): boolean {
  const range = parseDateRange(text)
  if (!range) return false
  // Allow for a trailing qualifier like "(Expected Dec 2026)".
  return range.matched.length >= text.length * 0.5
}

/** How much a column's left edge may wander before it is not a column. */
const COLUMN_EDGE_SPREAD_PT = 12

/**
 * Finds the widest jump between the left edges of the lines on a page, and how
 * much of the page sits past it. A second column shows up as a large jump with
 * a substantial share of lines beyond it; an indented bullet does not.
 *
 * The far group also has to line up with itself. Centred text — a name and its
 * contact line, which is how most resumes open — starts at a different place on
 * every line because every line is a different width, and that alone was enough
 * to make a perfectly ordinary resume look like two columns.
 */
function leftEdgeClusters(lines: TextLine[]): { gap: number; minorityShare: number } {
  const edges = lines.map((line) => line.x).sort((a, b) => a - b)
  if (edges.length < 6) return { gap: 0, minorityShare: 0 }

  let splitAt = 0
  let widest = 0
  for (let index = 1; index < edges.length; index++) {
    const gap = edges[index] - edges[index - 1]
    if (gap > widest) {
      widest = gap
      splitAt = index
    }
  }

  const left = edges.slice(0, splitAt)
  const right = edges.slice(splitAt)
  const minorityIsRight = right.length <= left.length
  const minorityGroup = minorityIsRight ? right : left
  const spread = minorityGroup.at(-1)! - minorityGroup[0]
  if (spread > COLUMN_EDGE_SPREAD_PT) return { gap: widest, minorityShare: 0 }

  return { gap: widest, minorityShare: minorityGroup.length / edges.length }
}

/**
 * Two columns is the single most common way a resume becomes unreadable: a
 * parser walks the page in reading order and interleaves them, so a job title
 * ends up glued to an unrelated skill.
 *
 * Two signals, because neither catches it alone. Where the columns happen to
 * share a baseline the extractor merges them into one line with a wide gap in
 * the middle. Where they do not — which is most of the time, since columns flow
 * independently — the lines come out separately, and what gives them away is
 * that they start at two very different distances from the left edge.
 */
function detectColumns(lines: TextLine[]): Check {
  const substantial = lines.filter((line) => line.text.replace(COLUMN_BREAK, '').length > 25)
  if (substantial.length < 6) {
    return {
      id: 'columns',
      status: 'pass',
      title: 'Single column',
      detail: 'There is not enough text here to run into a column problem.',
    }
  }

  const merged = substantial.filter((line) => {
    const parts = line.text.split(COLUMN_BREAK).map((part) => part.trim())
    if (parts.length < 2) return false
    /**
     * A date to the right of a job title produces the same wide gap a second
     * column does, and length cannot tell them apart — "Feb 2023 - Present" is
     * as long as a short sentence. What separates them is what the right-hand
     * side is: a date is a date, a column is prose.
     */
    return parts.filter((part) => part.length >= 18 && !isMostlyDate(part)).length >= 2
  })

  const { gap, minorityShare } = leftEdgeClusters(substantial)
  const clustered = gap > COLUMN_SEPARATION_PT && minorityShare > MINORITY_SHARE
  const mergedShare = merged.length / substantial.length

  if (clustered || mergedShare > 0.25) {
    return {
      id: 'columns',
      status: 'fail',
      title: 'Reads as two columns',
      detail: clustered
        ? `Body text starts at two positions ${Math.round(gap)}pt apart, with ${Math.round(minorityShare * 100)}% of lines in the second one.`
        : `${merged.length} of ${substantial.length} body lines carry text on both sides of a wide gap.`,
      advice:
        'Applicant tracking systems read a page left to right, so two columns interleave into one scrambled stream. Set the resume in a single column — the reading order below shows what a system actually receives.',
    }
  }

  if (mergedShare > 0.1) {
    return {
      id: 'columns',
      status: 'warn',
      title: 'Some lines may be reading as columns',
      detail: `${merged.length} of ${substantial.length} body lines have text on both sides of a wide gap.`,
      advice: 'Check the reading order below to see whether anything came out interleaved.',
    }
  }

  return {
    id: 'columns',
    status: 'pass',
    title: 'Single column',
    detail: 'Text runs in one column, which is what survives extraction.',
  }
}

/** Text in the header or footer band, which many parsers never look at. */
function detectEdgeText(document: ExtractedDocument, pageHeightPt: number): Check {
  const edge = document.lines.filter(
    (line) => line.y > pageHeightPt - EDGE_MARGIN_PT || line.y < EDGE_MARGIN_PT,
  )
  if (edge.length === 0) {
    return {
      id: 'edges',
      status: 'pass',
      title: 'Nothing hidden in the margins',
      detail: 'No text sits in the header or footer band.',
    }
  }
  return {
    id: 'edges',
    status: 'warn',
    title: 'Text sits in the header or footer',
    detail: `${edge.length} ${edge.length === 1 ? 'line is' : 'lines are'} within ${EDGE_MARGIN_PT}pt of the top or bottom edge.`,
    advice:
      'Many systems skip headers and footers entirely. If your name or phone number is up there, move it into the body of the page.',
  }
}

function contactCheck(profile: Profile): Check {
  const basics = profile.basics
  const missing = [
    !basics?.name && 'your name',
    !basics?.email && 'an email address',
    !basics?.phone && 'a phone number',
  ].filter((value): value is string => typeof value === 'string')

  if (missing.length === 0) {
    return {
      id: 'contact',
      status: 'pass',
      title: 'Contact details found',
      detail: `Name, email and phone all came out: ${basics?.name}.`,
    }
  }
  return {
    id: 'contact',
    status: missing.length >= 2 ? 'fail' : 'warn',
    title: 'Missing contact details',
    detail: `Could not find ${missing.join(' or ')}.`,
    advice:
      'A record with no way to contact you is a record nobody acts on. Put these in the body of the first page as plain text, not in a header, an image or a text box.',
  }
}

function sectionCheck(parse: ParseReport): Check {
  const unmapped = parse.sections.filter((section) => section.mappedTo === null)
  const mapped = parse.sections.filter((section) => section.mappedTo !== null)

  if (parse.sections.length === 0) {
    return {
      id: 'sections',
      status: 'fail',
      title: 'No sections recognised',
      detail: 'Nothing on the page reads as a section heading.',
      advice:
        'Use plain headings a machine already knows: Summary, Experience, Education, Skills, Projects.',
    }
  }
  if (unmapped.length === 0) {
    return {
      id: 'sections',
      status: 'pass',
      title: 'Every heading recognised',
      detail: `${mapped.length} sections found: ${mapped.map((section) => section.mappedTo).join(', ')}.`,
    }
  }
  return {
    id: 'sections',
    status: 'warn',
    title: 'Some headings were not recognised',
    detail: `Filed nothing under: ${unmapped.map((section) => `"${section.heading}"`).join(', ')}.`,
    advice:
      'A heading a system does not know becomes text with no section attached. Rename it to something standard, or accept that its content lands loose.',
  }
}

function dateCheck(profile: Profile): Check {
  const roles = profile.work ?? []
  if (roles.length === 0) {
    return {
      id: 'dates',
      status: 'warn',
      title: 'No work history found',
      detail: 'No entries were read under an experience heading.',
      advice: 'Check the reading order below to see where your roles ended up.',
    }
  }
  const undated = roles.filter((role) => !role.startDate)
  if (undated.length === 0) {
    return {
      id: 'dates',
      status: 'pass',
      title: 'Dates read cleanly',
      detail: `All ${roles.length} ${roles.length === 1 ? 'role has' : 'roles have'} a start date.`,
    }
  }
  return {
    id: 'dates',
    status: 'warn',
    title: 'Some dates could not be read',
    detail: `${undated.length} of ${roles.length} roles came out with no start date.`,
    advice:
      'Systems sort and filter by date, so a role without one may be treated as having no duration. Write them as "Mar 2023 - Jan 2025".',
  }
}

export function buildAtsReport(
  document: ExtractedDocument,
  profile: Profile,
  parse: ParseReport,
  pageHeightPt = 792,
): AtsReport {
  const readingOrder = document.lines.map((line) => line.text.split(COLUMN_BREAK).join('    '))

  if (document.imageOnly) {
    return {
      pages: document.pages,
      readingOrder,
      checks: [
        {
          id: 'text-layer',
          status: 'fail',
          title: 'This file has no text in it',
          detail: 'Nothing could be read from the page at all.',
          advice:
            'It is a scan or an image export, so every system will see an empty document. Export it again from the original file rather than printing and scanning it.',
        },
      ],
    }
  }

  return {
    pages: document.pages,
    readingOrder,
    checks: [
      {
        id: 'text-layer',
        status: 'pass',
        title: 'The text can be read',
        detail: `${document.lines.length} lines across ${document.pages} ${document.pages === 1 ? 'page' : 'pages'}.`,
      },
      detectColumns(document.lines),
      contactCheck(profile),
      sectionCheck(parse),
      dateCheck(profile),
      detectEdgeText(document, pageHeightPt),
    ],
  }
}

/** Worst status in the report, for the one-line verdict at the top. */
export function overallStatus(report: AtsReport): CheckStatus {
  if (report.checks.some((check) => check.status === 'fail')) return 'fail'
  if (report.checks.some((check) => check.status === 'warn')) return 'warn'
  return 'pass'
}
