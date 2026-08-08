import { describe, expect, it } from 'vitest'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { compileResume } from '@/lib/typst/compile'
import { extractLines } from './extract'
import { parseResume, toTitleCase } from './parse'

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

describe('real-world layouts', () => {
  const line = (text: string, y: number, size = 10, bold = false) => ({
    text,
    x: 50,
    y,
    size,
    bold,
    page: 1,
  })
  const doc = (lines: ReturnType<typeof line>[]) => ({ pages: 1, imageOnly: false, lines })

  it('maps a heading by its trailing noun', () => {
    // "PROFESSIONAL SUMMARY" and "RELEVANT PROJECTS" are not in the vocabulary
    // verbatim, and demanding an exact match left both unfiled.
    const result = parseResume(
      doc([
        line('James Smith', 760, 16, true),
        line('PROFESSIONAL SUMMARY', 740, 10, true),
        line('Data engineer.', 730),
        line('RELEVANT PROJECTS', 710, 10, true),
        line('Pipeline\t2026', 700, 10, true),
      ]),
    )
    expect(result.report.sections.map((s) => s.mappedTo)).toEqual(['summary', 'projects'])
  })

  it('does not read a sentence ending in a section word as a heading', () => {
    // A summary opening "Co-op student … with hands-on experience" ends on the
    // word "experience". Read as the work history, it swallowed the summary
    // whole and filed the rest of its lines as jobs.
    const result = parseResume(
      doc([
        line('James Smith', 760, 16, true),
        line('PROFESSIONAL SUMMARY', 740, 10, true),
        line('Co-op student in Machine Learning at Fanshawe College with hands-on experience', 730),
        line('in data mapping and data quality assurance.', 720),
      ]),
    )
    expect(result.report.sections.map((s) => s.mappedTo)).toEqual(['summary'])
    expect(result.profile.basics?.summary).toContain('Co-op student')
  })

  it('does not read "Work Authorization" as a work history', () => {
    // The reason matching is anchored to the tail rather than anywhere in the
    // heading: a wrong mapping silently misfiles, which is worse than none.
    const result = parseResume(
      doc([
        line('James Smith', 760, 16, true),
        line('WORK AUTHORIZATION', 740, 10, true),
        line('Permanent resident.', 730),
      ]),
    )
    expect(result.report.sections[0]?.mappedTo).toBeNull()
  })

  it('keeps a right-aligned location out of the employer name', () => {
    const result = parseResume(
      doc([
        line('James Smith', 760, 16, true),
        line('EXPERIENCE', 740, 10, true),
        line('Technical Support Analyst\tAug 2023 - Feb 2024', 730, 10, true),
        line('Hikvision\tPeru - Remote', 720),
      ]),
    )
    expect(result.profile.work?.[0]).toMatchObject({
      position: 'Technical Support Analyst',
      name: 'Hikvision',
      startDate: '2023-08',
      endDate: '2024-02',
    })
  })

  it('keeps a trailing qualifier with the date instead of the title', () => {
    // A long title can sit close enough to its date that no column break is
    // detected, and stripping only the range left "(Expected Dec 2026)" behind.
    const result = parseResume(
      doc([
        line('James Smith', 760, 16, true),
        line('EDUCATION', 740, 10, true),
        line(
          'Graduate Certificate in Machine Learning (Co-op) Sep 2025 - Present (Expected Dec 2026)',
          730,
          10,
          true,
        ),
        line('Fanshawe College', 720),
      ]),
    )
    expect(result.profile.education?.[0]?.area).toBe(
      'Graduate Certificate in Machine Learning (Co-op)',
    )
    expect(result.profile.education?.[0]?.startDate).toBe('2025-09')
  })

  it('joins a bullet that wrapped onto a second line', () => {
    // Wrapped bullets carry a hanging indent and no marker of their own. Read as
    // loose prose, the tail of every long bullet ends up in the description.
    const at = (text: string, y: number, x: number, bold = false) => ({
      text,
      x,
      y,
      size: 10,
      bold,
      page: 1,
    })
    const result = parseResume(
      doc([
        at('James Smith', 760, 14, true),
        at('EXPERIENCE', 740, 14, true),
        at('Technical Support Analyst\tAug 2023 - Feb 2024', 730, 14, true),
        at('Hikvision', 720, 14),
        at('- Tested pre-release hardware, identifying defects on new features to', 710, 18),
        at('product teams with exact reproduction steps.', 700, 28),
        at('- Audited incoming specifications, executing checks to', 690, 18),
        at('prevent hardware mismatches.', 680, 28),
      ]),
    )
    const work = result.profile.work?.[0]
    expect(work?.highlights).toEqual([
      'Tested pre-release hardware, identifying defects on new features to product teams with exact reproduction steps.',
      'Audited incoming specifications, executing checks to prevent hardware mismatches.',
    ])
    expect(work?.summary).toBeUndefined()
  })

  it('finds an address written without a scheme', () => {
    const result = parseResume(
      doc([
        line('James Smith', 760, 16, true),
        line('lu@example.com | github.com/x | linkedin.com/in/x | Portfolio: jamessmith.dev', 750),
      ]),
    )
    // A personal site is the person's own address, not a profile elsewhere.
    expect(result.profile.basics?.url).toBe('https://jamessmith.dev')
    expect(result.profile.basics?.profiles?.map((p) => p.network)).toEqual(['GitHub', 'LinkedIn'])
  })

  it('does not mistake an email domain or a version number for a link', () => {
    const result = parseResume(
      doc([
        line('James Smith', 760, 16, true),
        line('lu@example.com | Node.js 20.1 and e.g. Python', 750),
      ]),
    )
    expect(result.profile.basics?.url).toBeUndefined()
    expect(result.profile.basics?.profiles).toBeUndefined()
  })
})

describe('toTitleCase', () => {
  it.each([
    ['JAMES SMITH DOE', 'James Smith Doe'],
    ['ANA RUIZ PEÑA', 'Ana Ruiz Peña'],
    ["MARY-JANE O'BRIEN", "Mary-Jane O'Brien"],
  ])('softens %s to %s', (shouted, softened) => {
    // Capitals on a resume are a typographic choice; the stored value is a name.
    expect(toTitleCase(shouted)).toBe(softened)
  })

  it.each(['McDonald Smith', 'van der Berg', 'Ana Ruiz Peña'])('leaves %s alone', (name) => {
    // A name already in mixed case knows better than a rule does.
    expect(toTitleCase(name)).toBe(name)
  })
})
