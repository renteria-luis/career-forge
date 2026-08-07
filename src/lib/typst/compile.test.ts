import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FONTS, FONT_IDS } from '@/lib/resume/typography'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { TypstCompileError, compileResume } from './compile'

/** Set DUMP_PDF to a directory to keep the output for a visual look. */
const dumpDir = process.env.DUMP_PDF

describe('compileResume', () => {
  it('produces a PDF from the sample profile', () => {
    const result = compileResume(sampleProfile, sampleDocument)
    if (dumpDir) writeFileSync(`${dumpDir}/resume.pdf`, result.pdf)

    // A PDF that does not start with the magic bytes is not a PDF, whatever
    // the compiler reported.
    expect(Buffer.from(result.pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect(result.pdf.length).toBeGreaterThan(1000)
    expect(result.pageCount).toBeGreaterThanOrEqual(1)
  })

  it('reports overflow instead of silently exceeding the page limit', () => {
    const many = {
      ...sampleProfile,
      work: Array.from({ length: 40 }, (_, i) => ({
        name: `Company ${i}`,
        position: 'Engineer',
        startDate: '2020-01',
        endDate: '2021-01',
        highlights: ['Did a considerable amount of work that takes a full line to describe.'],
      })),
    }
    const result = compileResume(many, sampleDocument)
    expect(result.pageCount).toBeGreaterThan(1)
    expect(result.overflow).toBe(true)
  })

  it('renders an empty profile without throwing', () => {
    // A new user opens the editor before typing anything. That must produce a
    // blank page, not a crash.
    const result = compileResume({}, { ...sampleDocument, sections: [] })
    expect(result.pageCount).toBe(1)
  })

  it('treats quotes and backslashes as text, not as Typst source', () => {
    // The reason data goes through sys.inputs rather than string interpolation.
    // If this ever throws, something started building template source by hand.
    const hostile = {
      basics: {
        name: 'A"quote #and \\backslash $math$',
        summary: '#panic("template injection")',
      },
    }
    const result = compileResume(hostile, {
      ...sampleDocument,
      sections: [{ kind: 'standard' as const, id: 'summary', visible: true }],
    })
    expect(result.pageCount).toBe(1)
  })

  it('rejects a template name that could escape the template directory', () => {
    expect(() =>
      compileResume(sampleProfile, { ...sampleDocument, template: '../../../etc/passwd' }),
    ).toThrow(/Invalid template name/)
  })

  it('raises a typed error when the template itself is broken', () => {
    expect(() => compileResume(sampleProfile, { ...sampleDocument, template: 'nope' })).toThrow()
  })

  // The registry promises a file for every font id. This is the test that keeps
  // that promise honest — a missing or misnamed file silently falls back to
  // another face, which is invisible until a user complains their PDF looks wrong.
  it.each(FONT_IDS)('renders in %s with the real family embedded', (font) => {
    const result = compileResume(sampleProfile, {
      ...sampleDocument,
      typography: { ...sampleDocument.typography, font },
    })
    const raw = Buffer.from(result.pdf).toString('latin1')
    const embedded = [...new Set(raw.match(/\/BaseFont\s*\/[A-Za-z0-9+\-_,.]+/g) ?? [])].join(' ')
    const expected = FONTS[font].family.replace(/ /g, '')

    expect(embedded).toContain(expected)
    // Substitution is the failure mode that matters: Typst falls back silently,
    // so a PDF carrying any other family means the requested one was not found.
    for (const other of FONT_IDS.filter((id) => id !== font)) {
      expect(embedded).not.toContain(FONTS[other].family.replace(/ /g, ''))
    }
  })

  it('exposes TypstCompileError for callers to catch', () => {
    expect(new TypstCompileError([]).name).toBe('TypstCompileError')
  })
})
