import { describe, expect, it } from 'vitest'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { compileResume } from '@/lib/typst/compile'
import { extractLines } from './extract'
import { parseResume } from './parse'

/**
 * Full round trip: profile → PDF → text → profile. Anything the parser drops
 * here is something a user would have to retype after importing their own
 * resume, so this is the test that says whether import is worth offering.
 */
const compiled = compileResume(sampleProfile, sampleDocument)
const { profile, report } = parseResume(await extractLines(compiled.pdf))

describe('parseResume round trip', () => {
  it('recovers the name and headline', () => {
    expect(profile.basics?.name).toBe('Ana Ruiz Peña')
    expect(profile.basics?.label).toBe('ML Engineer | Data Scientist')
  })

  it('recovers contact details', () => {
    expect(profile.basics?.email).toBe('ana@example.com')
    expect(profile.basics?.phone).toContain('999 888 777')
    expect(profile.basics?.profiles?.some((p) => p.network === 'GitHub')).toBe(true)
  })

  it('recovers the summary', () => {
    expect(profile.basics?.summary).toContain('Machine learning engineer with four years')
  })

  it('maps every heading to the right section', () => {
    expect(report.sections.map((s) => s.mappedTo)).toEqual([
      'summary',
      'work',
      'projects',
      'education',
      'skills',
    ])
  })

  it('recovers all three roles with their dates', () => {
    expect(profile.work).toHaveLength(3)
    expect(profile.work?.[0]).toMatchObject({
      position: 'Senior ML Engineer',
      name: 'Nomad Analytics',
      startDate: '2023-02',
    })
    // An open-ended role must come back open-ended, not with a made-up end.
    expect(profile.work?.[0].endDate).toBeUndefined()
    expect(profile.work?.[1]).toMatchObject({ startDate: '2021', endDate: '2023-01' })
  })

  it('recovers bullets as separate highlights', () => {
    expect(profile.work?.[0].highlights).toHaveLength(2)
    expect(profile.work?.[0].highlights?.[0]).toContain('Cut retrieval latency')
  })

  it('recovers education', () => {
    expect(profile.education?.[0]).toMatchObject({
      institution: 'Universidad Nacional de Ingeniería',
      startDate: '2016',
      endDate: '2020',
    })
  })

  it('recovers skills as labelled keyword lists', () => {
    const machineLearning = profile.skills?.find((s) => s.name === 'Machine learning')
    expect(machineLearning?.keywords).toEqual(['PyTorch', 'scikit-learn'])
  })

  it('produces a profile the schema accepts', async () => {
    // The parser feeds the editor, so anything it emits has to survive the
    // same validation a hand-typed profile does.
    const { profile: schema } = await import('@/lib/resume/profile')
    expect(schema.safeParse(profile).success).toBe(true)
  })

  it('reports no warnings for a resume it fully understood', () => {
    expect(report.warnings).toEqual([])
  })
})

describe('parseResume reporting', () => {
  it('says so plainly when the PDF has no text layer', () => {
    const result = parseResume({ pages: 2, lines: [], imageOnly: true })
    expect(result.report.warnings[0]).toContain('no text in it')
    expect(result.profile).toEqual({})
  })

  it('warns when there is no way to contact the person', () => {
    const line = (text: string, y: number, size = 10, bold = false) => ({
      text,
      x: 50,
      y,
      size,
      bold,
      page: 1,
    })
    const result = parseResume({
      pages: 1,
      imageOnly: false,
      lines: [
        line('Ana Ruiz', 720, 18, true),
        line('EXPERIENCE', 700, 10, true),
        line('Engineer 2020 - 2021', 680),
      ],
    })
    expect(result.profile.basics?.name).toBe('Ana Ruiz')
    expect(result.report.warnings.join(' ')).toContain('No email')
  })

  it('files an unrecognised heading as unmapped instead of guessing', () => {
    const line = (text: string, y: number, size = 10, bold = false) => ({
      text,
      x: 50,
      y,
      size,
      bold,
      page: 1,
    })
    const result = parseResume({
      pages: 1,
      imageOnly: false,
      lines: [
        line('Ana Ruiz', 720, 18, true),
        line('ana@example.com', 710),
        line('THINGS I HAVE SHIPPED', 690, 10, true),
        line('Built a compiler 2020 - 2021', 670),
      ],
    })
    const unmapped = result.report.sections.find((s) => s.mappedTo === null)
    expect(unmapped?.heading).toBe('THINGS I HAVE SHIPPED')
    expect(result.report.warnings.join(' ')).toContain('does not match a standard one')
  })
})
