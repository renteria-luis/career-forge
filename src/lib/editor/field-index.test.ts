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
