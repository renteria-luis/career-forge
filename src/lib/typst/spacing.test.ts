import { describe, expect, it } from 'vitest'
import { extractLines } from '@/lib/parse/extract'
import { DEFAULT_SECTIONS } from '@/lib/resume/document'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { compileResume } from './compile'

/**
 * Measures the compiled page rather than trusting the template to be
 * consistent.
 *
 * A reader separates content by comparing gaps, so what matters is not any
 * single value but the ordering between them: two lines of one bullet closer
 * than two bullets, two bullets closer than two jobs, two jobs closer than two
 * sections. Reading positions back out of the PDF is the only way to assert it.
 */

const document = {
  ...sampleDocument,
  options: { ...sampleDocument.options, maxPages: 3 },
  sections: DEFAULT_SECTIONS,
}
const { lines } = await extractLines(compileResume(sampleProfile, document).pdf)

const HEADINGS = ['PROFESSIONAL SUMMARY', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'SKILLS']

function indexOf(prefix: string): number {
  const index = lines.findIndex((line) => line.text.startsWith(prefix))
  if (index < 1) throw new Error(`No line starting with ${prefix}; the fixture changed.`)
  return index
}

/** Anchored on structure, not on wording — where a paragraph wraps moves. */
function headingIndex(title: string): number {
  const index = lines.findIndex((line) => line.text.trim() === title)
  if (index < 1) throw new Error(`No ${title} heading; the fixture changed.`)
  return index
}

/** Baseline-to-baseline distance from the line above, in points. */
function gapAbove(index: number): number {
  return lines[index - 1].y - lines[index].y
}

// The second line of the summary, whatever it happens to say.
const withinParagraph = gapAbove(headingIndex('PROFESSIONAL SUMMARY') + 2)
const betweenBullets = gapAbove(indexOf('• Owned the ranking service'))
const betweenEntries = gapAbove(indexOf('Data Scientist'))
const sectionGaps = lines
  .map((line, index) => (index > 0 && HEADINGS.includes(line.text.trim()) ? gapAbove(index) : null))
  .filter((gap): gap is number => gap !== null)

describe('vertical rhythm', () => {
  it('renders every section heading', () => {
    expect(lines.filter((l) => HEADINGS.includes(l.text.trim())).map((l) => l.text)).toEqual(
      HEADINGS,
    )
  })

  it('leaves the same gap above every section heading', () => {
    // The user-visible rule: the last line of one section sits the same
    // distance from the next section's title wherever that happens.
    expect(sectionGaps).toHaveLength(HEADINGS.length)
    expect(Math.max(...sectionGaps) - Math.min(...sectionGaps)).toBeLessThan(0.5)
  })

  it('leaves the same gap below every section heading', () => {
    // The summary sat twice as far from its rule as every other section,
    // because the prose layout added a gap the heading already carried.
    const below = lines
      .map((line, index) =>
        HEADINGS.includes(line.text.trim()) && lines[index + 1]
          ? line.y - lines[index + 1].y
          : null,
      )
      .filter((gap): gap is number => gap !== null)

    expect(below).toHaveLength(HEADINGS.length)
    expect(Math.max(...below) - Math.min(...below)).toBeLessThan(0.5)
  })

  it('grows each gap strictly over the one it contains', () => {
    // This is the whole point. Bullets set tighter than the lines inside them
    // makes a page read as one undifferentiated column.
    expect(withinParagraph).toBeLessThan(betweenBullets)
    expect(betweenBullets).toBeLessThan(betweenEntries)
    expect(betweenEntries).toBeLessThan(Math.min(...sectionGaps))
  })

  it('sets a wrapped summary and a wrapped bullet on the same leading', () => {
    // Both are lines of one paragraph to a reader, so they cannot differ.
    const dense = { ...document, typography: { ...document.typography, size: 12 } }
    const wide = compileResume(
      {
        ...sampleProfile,
        basics: { ...sampleProfile.basics, summary: 'A '.repeat(80) },
        work: [{ name: 'Acme', position: 'Engineer', highlights: ['B '.repeat(80)] }],
      },
      dense,
    )
    return extractLines(wide.pdf).then(({ lines: wrapped }) => {
      const summaryStart = wrapped.findIndex((l) => l.text.startsWith('A A'))
      const bulletStart = wrapped.findIndex((l) => l.text.startsWith('• B'))
      const summaryLeading = wrapped[summaryStart].y - wrapped[summaryStart + 1].y
      const bulletLeading = wrapped[bulletStart].y - wrapped[bulletStart + 1].y
      expect(Math.abs(summaryLeading - bulletLeading)).toBeLessThan(0.5)
    })
  })
})
