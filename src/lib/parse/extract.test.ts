import { describe, expect, it } from 'vitest'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { compileResume } from '@/lib/typst/compile'
import { extractLines } from './extract'

/**
 * Round trip: compile the sample, then read it back the way a parser would.
 * This proves the extractor works and, just as importantly, that the resumes we
 * produce survive extraction — which is the whole reason for the layout rules.
 */
const extracted = await extractLines(compileResume(sampleProfile, sampleDocument).pdf)
const lines = extracted.lines.map((l) => l.text)

describe('extractLines', () => {
  it('reports the page count', () => {
    expect(extracted.pages).toBe(1)
    expect(extracted.imageOnly).toBe(false)
  })

  it('keeps the name on its own line', () => {
    // Plain text extraction runs the name into the headline. Rebuilding lines
    // from coordinates is the only way to separate them.
    expect(lines[0]).toBe('Ana Ruiz Peña')
    expect(lines[1]).toBe('ML Engineer | Data Scientist')
  })

  it('recovers every section heading in reading order', () => {
    const headings = lines.filter((l) => /^[A-Z][A-Z ]+$/.test(l))
    expect(headings).toEqual([
      'PROFESSIONAL SUMMARY',
      'EXPERIENCE',
      'PROJECTS',
      'EDUCATION',
      'SKILLS',
    ])
  })

  it('keeps a right-aligned date on the same line as its job title', () => {
    // The date sits far to the right of the title. If the extractor split the
    // line, every downstream date heuristic would be reading the wrong rows.
    const line = lines.find((l) => l.startsWith('Senior ML Engineer'))
    expect(line).toContain('Feb 2023')
    expect(line).toContain('Present')
  })

  it('marks headings and job titles as bold', () => {
    const title = extracted.lines.find((l) => l.text.startsWith('Senior ML Engineer'))
    const bullet = extracted.lines.find((l) => l.text.includes('Cut retrieval latency'))
    expect(title?.bold).toBe(true)
    expect(bullet?.bold).toBe(false)
  })

  it('sets the name in the largest type on the page', () => {
    const sizes = extracted.lines.map((l) => l.size)
    expect(extracted.lines[0].size).toBe(Math.max(...sizes))
  })

  it('preserves accented characters', () => {
    expect(lines).toContain('Universidad Nacional de Ingeniería, Lima, Peru')
  })

  it('keeps bullet text intact', () => {
    expect(lines.some((l) => l.includes('99.95% availability'))).toBe(true)
  })
})

describe('paper', () => {
  it('recognises the size our own compiler produced', async () => {
    // Someone importing a resume already chose a size; asking again is asking
    // twice. Letter is what the sample document is set on.
    expect(extracted.paper).toBe('letter')
  })

  it('recognises A4', async () => {
    const a4 = compileResume(sampleProfile, {
      ...sampleDocument,
      typography: { ...sampleDocument.typography, paper: 'a4' },
    })
    expect((await extractLines(a4.pdf)).paper).toBe('a4')
  })
})
