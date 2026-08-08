import { describe, expect, it } from 'vitest'
import { sampleDocument, sampleProfile } from '@/lib/resume/fixtures'
import { buildRenderModel, formatDate, formatRange } from './model'

describe('formatDate', () => {
  it('names the month when there is one', () => {
    expect(formatDate('2023-02')).toBe('Feb 2023')
  })

  it('leaves a year-only date as a year', () => {
    // Imported resumes often only remember the year, and inventing a month
    // would be inventing a fact.
    expect(formatDate('2021')).toBe('2021')
  })
})

describe('formatRange', () => {
  it('reads an open-ended role as Present', () => {
    expect(formatRange('2023-02', undefined)).toBe('Feb 2023 - Present')
  })

  it('joins a closed range', () => {
    expect(formatRange('2021', '2023-01')).toBe('2021 - Jan 2023')
  })

  it('returns nothing when there are no dates at all', () => {
    expect(formatRange(undefined, undefined)).toBeUndefined()
  })
})

describe('buildRenderModel', () => {
  it('renders sections in document order, not profile order', () => {
    const model = buildRenderModel(sampleProfile, {
      ...sampleDocument,
      sections: [
        { kind: 'standard', id: 'education', visible: true },
        { kind: 'standard', id: 'work', visible: true },
      ],
    })
    expect(model.sections.map((s) => s.title)).toEqual(['Education', 'Experience'])
  })

  it('drops a section the user hid', () => {
    const model = buildRenderModel(sampleProfile, {
      ...sampleDocument,
      sections: [{ kind: 'standard', id: 'work', visible: false }],
    })
    expect(model.sections).toHaveLength(0)
  })

  it('drops a section with no content rather than printing an empty heading', () => {
    const model = buildRenderModel(
      { basics: { name: 'Ana' } },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'work', visible: true }] },
    )
    expect(model.sections).toHaveLength(0)
  })

  it('honours a custom section title over the default', () => {
    const model = buildRenderModel(sampleProfile, {
      ...sampleDocument,
      sections: [{ kind: 'standard', id: 'work', visible: true, title: 'Where I have worked' }],
    })
    expect(model.sections[0]?.title).toBe('Where I have worked')
  })

  it('omits contact details the document turned off', () => {
    const model = buildRenderModel(sampleProfile, {
      ...sampleDocument,
      options: { ...sampleDocument.options, showPhone: false, showEmail: false },
    })
    expect(model.contacts.join(' ')).not.toContain('999')
    expect(model.contacts.join(' ')).not.toContain('@')
  })

  it('prefers the document headline over the profile label', () => {
    // The profile carries the person's usual headline; a document may aim at a
    // specific job, and that choice has to win.
    const model = buildRenderModel(sampleProfile, {
      ...sampleDocument,
      options: { ...sampleDocument.options, headline: 'Backend Engineer' },
    })
    expect(model.headline).toBe('Backend Engineer')
  })

  it('resolves the font id to the family name Typst looks up', () => {
    const model = buildRenderModel(sampleProfile, sampleDocument)
    expect(model.page.font).toBe('Carlito')
  })

  it('keeps an entry whose employer is missing', () => {
    // Imports lose fields. Dropping the entry would lose real work history.
    const model = buildRenderModel(sampleProfile, {
      ...sampleDocument,
      sections: [{ kind: 'standard', id: 'work', visible: true }],
    })
    const entries = model.sections[0]?.entries ?? []
    expect(entries).toHaveLength(3)
    expect(entries[2]?.subtitle).toBeUndefined()
    expect(entries[2]?.title).toBe('Research Assistant')
  })
})

describe('projects', () => {
  it('prints a project date range the way a job reads', () => {
    // Nothing covered projects here, and the form had no date inputs at all —
    // so a range that arrived from an import was carried the whole way to the
    // page with no test in between saying what it should look like.
    const model = buildRenderModel(
      {
        projects: [{ name: 'Ledger', startDate: '2023-02', endDate: '2024-06' }],
      },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'projects', visible: true }] },
    )
    expect(model.sections[0].entries[0].meta).toBe('Feb 2023 - Jun 2024')
  })

  it('leaves a dateless project without a date line', () => {
    const model = buildRenderModel(
      { projects: [{ name: 'Ledger', description: 'A double-entry ledger.' }] },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'projects', visible: true }] },
    )
    expect(model.sections[0].entries[0].meta).toBeUndefined()
  })
})

describe('empty entries', () => {
  it('drops an entry that would print nothing', () => {
    // The editor opens with a blank role so there is somewhere to type. It must
    // not produce an Experience heading with nothing under it.
    const model = buildRenderModel(
      { basics: { name: 'Ana' }, work: [{}] },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'work', visible: true }] },
    )
    expect(model.sections).toHaveLength(0)
  })

  it('keeps an entry that has only a date', () => {
    const model = buildRenderModel(
      { basics: { name: 'Ana' }, work: [{ startDate: '2021' }] },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'work', visible: true }] },
    )
    expect(model.sections[0]?.entries).toHaveLength(1)
  })

  it('keeps the entries that have content and drops the ones that do not', () => {
    const model = buildRenderModel(
      { basics: { name: 'Ana' }, work: [{ position: 'Engineer' }, {}, { name: 'Acme' }] },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'work', visible: true }] },
    )
    expect(model.sections[0]?.entries).toHaveLength(2)
  })
})

describe('blank lines', () => {
  it('drops the empty line a textarea leaves behind', () => {
    // The form keeps every line the user typed, including the one Enter has
    // just made, or the newline vanishes as fast as it is created. The page
    // must not print an empty bullet for it.
    const model = buildRenderModel(
      {
        basics: { name: 'Ana' },
        work: [{ position: 'Engineer', highlights: ['Did a thing', '', '  ', 'Did another'] }],
      },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'work', visible: true }] },
    )
    expect(model.sections[0]?.entries[0]?.highlights).toEqual(['Did a thing', 'Did another'])
  })

  it('leaves no bullet list at all when every line is blank', () => {
    const model = buildRenderModel(
      { basics: { name: 'Ana' }, work: [{ position: 'Engineer', highlights: ['', ''] }] },
      { ...sampleDocument, sections: [{ kind: 'standard', id: 'work', visible: true }] },
    )
    expect(model.sections[0]?.entries[0]?.highlights).toBeUndefined()
  })
})
