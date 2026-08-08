import { describe, expect, it } from 'vitest'
import { FONT_SIZE_MAX, FONT_SIZE_MIN } from './typography'
import { documentSection, resumeDocument, typography } from './document'

describe('typography', () => {
  it('fills in defaults for an empty object', () => {
    expect(typography.parse({})).toEqual({
      paper: 'letter',
      font: 'carlito',
      size: 10,
      margin: 30,
      density: 0.9,
    })
  })

  it.each([FONT_SIZE_MIN - 0.5, FONT_SIZE_MAX + 0.5])('rejects %ppt body size', (size) => {
    // Outside this range a resume either stops being readable or stops fitting
    // on one page, so the schema refuses rather than the template coping.
    expect(typography.safeParse({ size }).success).toBe(false)
  })

  it('rejects a font with no bundled file', () => {
    expect(typography.safeParse({ font: 'comic-sans' }).success).toBe(false)
  })
})

describe('resumeDocument', () => {
  it('resolves nested defaults from a bare document', () => {
    const doc = resumeDocument.parse({ id: 'd1' })
    expect(doc.typography.font).toBe('carlito')
    expect(doc.options.maxPages).toBe(1)
    expect(doc.sections).toEqual([])
  })

  it('treats a section with no entryIds as including every entry', () => {
    // Absent means "all", empty array means "none". Conflating the two would
    // silently blank a section during tailoring.
    const all = documentSection.parse({ kind: 'standard', id: 'work' })
    const none = documentSection.parse({ kind: 'standard', id: 'work', entryIds: [] })
    expect(all.entryIds).toBeUndefined()
    expect(none.entryIds).toEqual([])
  })

  it('defaults a section to visible', () => {
    expect(documentSection.parse({ kind: 'standard', id: 'work' }).visible).toBe(true)
  })

  it('preserves section order, which is render order', () => {
    const doc = resumeDocument.parse({
      id: 'd1',
      sections: [
        { kind: 'standard', id: 'education' },
        { kind: 'standard', id: 'work' },
      ],
    })
    expect(doc.sections.map((s) => s.id)).toEqual(['education', 'work'])
  })
})
