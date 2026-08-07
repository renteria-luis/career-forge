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
