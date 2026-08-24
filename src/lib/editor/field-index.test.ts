import { describe, expect, it } from 'vitest'
import { sampleProfile } from '@/lib/resume/fixtures'
import { buildFieldIndex, findField } from './field-index'

const index = buildFieldIndex(sampleProfile)

describe('findField', () => {
  it.each([
    ['Ana Ruiz Peña', 'basics.name'],
    ['ML Engineer | Data Scientist', 'basics.label'],
    ['Senior ML Engineer', 'work.0.position'],
    ['Nomad Analytics', 'work.0.name'],
    ['Data Scientist', 'work.1.position'],
    ['Retail Grid', 'work.1.name'],
    ['tiny-rerank', 'projects.0.name'],
    ['Universidad Nacional de Ingeniería', 'education.0.institution'],
  ])('sends %s to %s', (clicked, path) => {
    expect(findField(index, clicked)).toBe(path)
  })

  it('matches a fragment of a wrapped paragraph', () => {
    // A click lands on one line of the summary, never the whole thing.
    expect(findField(index, 'Comfortable owning a model from dataset')).toBe('basics.summary')
  })

  it('matches a fragment of a bullet', () => {
    expect(findField(index, 'Cut retrieval latency from 240ms')).toBe('work.0.highlights')
  })

  it('prefers the most specific field when several contain the words', () => {
    // "Data Scientist" appears in the headline and as a job title. The shorter
    // field is the one the click was aimed at.
    expect(findField(index, 'Data Scientist')).toBe('work.1.position')
  })

  it('returns nothing for text that belongs to no field', () => {
    // Dates and section headings are produced by the template, not typed.
    expect(findField(index, 'EXPERIENCE')).toBeUndefined()
    expect(findField(index, 'x')).toBeUndefined()
  })
})

describe('accidental collisions', () => {
  it('does not send a summary sentence to a skills group', () => {
    // "Tools" is a skills group and also the last word of a summary sentence.
    // Unrestricted containment sent every click on that line to the wrong
    // section of the form.
    const profile = {
      basics: { summary: 'Structured user feedback on new features for AI/ML labelling tools.' },
      skills: [{ name: 'Tools', keywords: ['Python'] }],
    }
    const index = buildFieldIndex(profile)
    expect(
      findField(index, 'structured user feedback on new features for AI/ML labelling tools.'),
    ).toBe('basics.summary')
  })

  it('still reaches a field long enough to be unambiguous', () => {
    const profile = {
      basics: { name: 'Ana' },
      work: [{ name: 'Nomad Analytics', position: 'Engineer' }],
    }
    const index = buildFieldIndex(profile)
    expect(findField(index, 'Nomad Analytics is where I work')).toBe('work.0.name')
  })
})

describe('dates', () => {
  const profile = {
    work: [{ position: 'Engineer', startDate: '2023-02', endDate: '2024-06' }],
    education: [{ institution: 'Fanshawe', startDate: '2025-09' }],
  }
  const index = buildFieldIndex(profile)

  it('sends a printed range to the start date', () => {
    // The PDF prints one run for the whole range, so which half was clicked is
    // not knowable. The two fields sit beside each other in the form.
    expect(findField(index, 'Feb 2023 - Jun 2024')).toBe('work.0.startDate')
  })

  it('sends an open-ended range to the start date', () => {
    expect(findField(index, 'Sep 2025 - Present')).toBe('education.0.startDate')
  })

  it('sends a single printed date to its own field', () => {
    expect(findField(index, 'Jun 2024')).toBe('work.0.endDate')
  })
})

describe('sections the index used to skip', () => {
  it('finds the field a language came from', () => {
    // Languages were not indexed at all, so clicking one on the page matched
    // nothing and the click was silently dropped.
    const index = buildFieldIndex({
      languages: [
        { language: 'Spanish', fluency: 'Native' },
        { language: 'English', fluency: 'Professional' },
      ],
    })
    expect(findField(index, 'Spanish')).toBe('languages.0.language')
    expect(findField(index, 'Native')).toBe('languages.0.fluency')
    expect(findField(index, 'English')).toBe('languages.1.language')
  })

  it('finds the field a certificate came from', () => {
    const index = buildFieldIndex({
      certificates: [{ name: 'AWS Solutions Architect', issuer: 'Amazon', date: '2025-04' }],
    })
    expect(findField(index, 'AWS Solutions Architect')).toBe('certificates.0.name')
    expect(findField(index, 'Amazon')).toBe('certificates.0.issuer')
    // Dates print formatted and are stored raw, so the printed form is indexed.
    expect(findField(index, 'Apr 2025')).toBe('certificates.0.date')
  })
})

describe('a run that carries more than one field', () => {
  // The runs a compiled resume actually draws, taken off the page: the employer
  // and the place beside it come out as one, and so do both ends of a date.
  const profile = {
    work: [
      {
        position: 'Senior ML Engineer',
        name: 'Retail Grid',
        location: 'Toronto, ON',
        arrangement: 'remote' as const,
        startDate: '2023-02',
      },
      {
        position: 'Data Scientist',
        name: 'Nomad Analytics',
        startDate: '2021',
        endDate: '2023-01',
      },
    ],
    languages: [{ language: 'Spanish', fluency: 'Native' }],
  }
  const index = buildFieldIndex(profile)

  it('finds the employer at the left of a line it shares with a place', () => {
    // "Retail Grid" is eleven characters, one short of the reach the last-resort
    // rule allows, so clicking it used to match nothing at all.
    expect(findField(index, 'Retail Grid, Toronto, ON', 0.1)).toBe('work.0.name')
  })

  it('finds the place at the right of that same line', () => {
    expect(findField(index, 'Retail Grid, Toronto, ON', 0.9)).toBe('work.0.location')
  })

  it('finds the language behind the colon the template sets after it', () => {
    // The run is "Spanish:", and the field is "Spanish".
    expect(findField(index, 'Spanish:', 0.5)).toBe('languages.0.language')
    expect(findField(index, 'Native', 0.5)).toBe('languages.0.fluency')
  })

  it('tells the two ends of a date range apart by where it was clicked', () => {
    expect(findField(index, '2021 - Jan 2023', 0.1)).toBe('work.1.startDate')
    expect(findField(index, '2021 - Jan 2023', 0.9)).toBe('work.1.endDate')
  })

  it('reaches the end date through the word standing in for it', () => {
    // An open range prints "Present", and that is the field that would close it.
    expect(findField(index, 'Feb 2023 - Present', 0.9)).toBe('work.0.endDate')
  })

  it('finds how the job was worked', () => {
    expect(findField(index, 'Remote', 0.5)).toBe('work.0.arrangement')
  })

  it('still answers without a position', () => {
    // Older callers pass none, and the whole run is still the first thing tried.
    expect(findField(index, 'Senior ML Engineer')).toBe('work.0.position')
    expect(findField(index, 'Spanish:')).toBe('languages.0.language')
  })
})
