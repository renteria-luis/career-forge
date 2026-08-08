import { describe, expect, it } from 'vitest'
import { extractLines } from '@/lib/parse/extract'
import { parseResume } from '@/lib/parse/parse'
import { DEFAULT_SECTIONS } from '@/lib/resume/document'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { compileResume } from '@/lib/typst/compile'
import { buildAtsReport, overallStatus } from './report'

/** Our own compiler produces the resume we say people should write. */
const document = {
  ...sampleDocument,
  options: { ...sampleDocument.options, maxPages: 3 },
  sections: DEFAULT_SECTIONS,
}
const extracted = await extractLines(compileResume(sampleProfile, document).pdf)
const parsed = parseResume(extracted)
const report = buildAtsReport(extracted, parsed.profile, parsed.report)

describe('a resume we produced ourselves', () => {
  it('passes every check', () => {
    // The rules we hold the template to are the rules this reports on. If our
    // own output cannot pass, one of the two is wrong.
    expect(report.checks.filter((c) => c.status !== 'pass')).toEqual([])
    expect(overallStatus(report)).toBe('pass')
  })

  it('shows the text in the order a parser reads it', () => {
    expect(report.readingOrder[0]).toBe('Ana Ruiz Peña')
    expect(report.readingOrder).toContain('PROFESSIONAL SUMMARY')
  })
})

describe('a file with no text layer', () => {
  const scan = buildAtsReport(
    { pages: 2, lines: [], imageOnly: true },
    {},
    {
      pages: 2,
      imageOnly: true,
      sections: [],
      warnings: [],
    },
  )

  it('reports that and nothing else', () => {
    // Every other check is meaningless once there is no text to check.
    expect(scan.checks).toHaveLength(1)
    expect(scan.checks[0]).toMatchObject({ id: 'text-layer', status: 'fail' })
    expect(scan.checks[0].advice).toContain('scan')
  })
})

describe('columns', () => {
  const line = (text: string, y: number) => ({ text, x: 50, y, size: 10, bold: false, page: 1 })
  const empty = { pages: 1, imageOnly: false, sections: [], warnings: [] }

  it('flags a page where body lines carry text on both sides of a gap', () => {
    // Two columns interleave into one scrambled stream when read left to right,
    // which is the single most common way a resume becomes unreadable.
    const lines = Array.from({ length: 10 }, (_, i) =>
      line(`A reasonably long line of body text here\tAnd a second column beside it`, 700 - i * 12),
    )
    const result = buildAtsReport({ pages: 1, lines, imageOnly: false }, {}, empty)
    expect(result.checks.find((c) => c.id === 'columns')).toMatchObject({ status: 'fail' })
  })

  it('does not flag a date sitting to the right of a job title', () => {
    // The extractor marks that gap too, and it is not a column.
    const lines = Array.from({ length: 10 }, (_, i) =>
      line(`A reasonably long line of body text with no second column`, 700 - i * 12),
    ).concat([line('Senior ML Engineer\tFeb 2023 - Present', 560)])
    const result = buildAtsReport({ pages: 1, lines, imageOnly: false }, {}, empty)
    expect(result.checks.find((c) => c.id === 'columns')).toMatchObject({ status: 'pass' })
  })
})

describe('contact details', () => {
  const empty = { pages: 1, imageOnly: false, sections: [], warnings: [] }
  const doc = { pages: 1, lines: [], imageOnly: false }

  it('fails when most of them are missing', () => {
    const result = buildAtsReport(doc, { basics: { name: 'Ana' } }, empty)
    expect(result.checks.find((c) => c.id === 'contact')).toMatchObject({ status: 'fail' })
  })

  it('warns when one is missing', () => {
    const result = buildAtsReport(doc, { basics: { name: 'Ana', email: 'a@b.com' } }, empty)
    expect(result.checks.find((c) => c.id === 'contact')).toMatchObject({ status: 'warn' })
  })
})

describe('advice', () => {
  it('never reports a problem without saying what to do about it', () => {
    // A check that cannot name a change is a score in disguise.
    const scan = buildAtsReport(
      { pages: 1, lines: [], imageOnly: true },
      {},
      {
        pages: 1,
        imageOnly: true,
        sections: [],
        warnings: [],
      },
    )
    for (const c of [...report.checks, ...scan.checks]) {
      if (c.status !== 'pass') expect(c.advice, `${c.id} has no advice`).toBeTruthy()
    }
  })
})

describe('column detection against real layouts', () => {
  const line = (text: string, x: number, y: number) => ({
    text,
    x,
    y,
    size: 10,
    bold: false,
    page: 1,
  })
  const empty = { pages: 1, imageOnly: false, sections: [], warnings: [] }
  const columns = (lines: ReturnType<typeof line>[]) =>
    buildAtsReport({ pages: 1, lines, imageOnly: false }, {}, empty).checks.find(
      (c) => c.id === 'columns',
    )

  it('flags lines that start at two fixed positions far apart', () => {
    // What a real two-column layout looks like once extracted: the columns flow
    // independently, so they come out as separate lines at two left edges.
    const lines = [
      ...Array.from({ length: 8 }, (_, i) =>
        line('A body line of a reasonable length here', 57, 700 - i * 12),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        line('A body line in the second column here', 323, 690 - i * 12),
      ),
    ]
    expect(columns(lines)).toMatchObject({ status: 'fail' })
  })

  it('does not flag a centred header', () => {
    // Centred text starts somewhere different on every line because every line
    // is a different width. That alone made an ordinary resume look columnar.
    const lines = [
      line('A name centred across the page here', 210, 760),
      line('A headline centred across the page', 190, 745),
      line('An email and a phone centred here as well', 160, 730),
      ...Array.from({ length: 8 }, (_, i) =>
        line('A body line of a reasonable length here', 57, 700 - i * 12),
      ),
    ]
    expect(columns(lines)).toMatchObject({ status: 'pass' })
  })

  it('does not flag indented bullets', () => {
    const lines = [
      ...Array.from({ length: 5 }, (_, i) =>
        line('A body line of a reasonable length here', 57, 700 - i * 12),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        line('A bullet of a reasonable length here too', 68, 630 - i * 12),
      ),
    ]
    expect(columns(lines)).toMatchObject({ status: 'pass' })
  })
})
