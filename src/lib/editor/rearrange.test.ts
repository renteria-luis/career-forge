import { describe, expect, it } from 'vitest'
import { DEFAULT_SECTIONS, resumeDocument } from '@/lib/resume/document'
import { sampleProfile } from '@/lib/resume/fixtures'
import { canSwap, moveEntry, moveSection, parseBlockId, toBands } from './rearrange'
import { sectionsForProfile } from './starter'

const document = resumeDocument.parse({ id: 'd', sections: DEFAULT_SECTIONS })

describe('parseBlockId', () => {
  it.each([
    ['section:work', 'section', 'work'],
    ['work.2', 'work', '2'],
    ['projects.0', 'projects', '0'],
  ])('reads %s', (id, kind, key) => {
    expect(parseBlockId(id)).toEqual({ kind, key })
  })

  it('rejects something that is not a block id', () => {
    expect(parseBlockId('nonsense')).toBeUndefined()
  })
})

describe('canSwap', () => {
  it('allows two entries of the same list', () => {
    expect(canSwap('work.0', 'work.2')).toBe(true)
  })

  it('refuses a job dropped among degrees', () => {
    // Nothing sensible happens if a job lands in the education list.
    expect(canSwap('work.0', 'education.1')).toBe(false)
  })

  it('refuses an entry dropped among sections', () => {
    expect(canSwap('work.0', 'section:work')).toBe(false)
  })

  it('refuses a block dropped on itself', () => {
    expect(canSwap('work.1', 'work.1')).toBe(false)
  })
})

describe('moveSection', () => {
  it('moves a section to where another one was', () => {
    const moved = moveSection(document, 'section:skills', 'section:work')
    expect(moved.sections.map((s) => s.id)).toEqual([
      'summary',
      'skills',
      'work',
      'projects',
      'education',
    ])
  })

  it('leaves the document alone when the move is not a move', () => {
    expect(moveSection(document, 'section:work', 'section:work')).toBe(document)
  })

  it('leaves the document alone for a section it does not have', () => {
    expect(moveSection(document, 'section:awards', 'section:work')).toBe(document)
  })
})

describe('moveEntry', () => {
  it('brings an older role to the top', () => {
    // The whole point: relevance is not always chronology.
    const moved = moveEntry(sampleProfile, 'work.2', 'work.0')
    expect(moved.work?.map((w) => w.position)).toEqual([
      'Research Assistant',
      'Senior ML Engineer',
      'Data Scientist',
    ])
  })

  it('does not touch the other lists', () => {
    const moved = moveEntry(sampleProfile, 'work.1', 'work.0')
    expect(moved.education).toBe(sampleProfile.education)
  })

  it('refuses to move between different lists', () => {
    expect(moveEntry(sampleProfile, 'work.0', 'education.0')).toBe(sampleProfile)
  })

  it('refuses an index the list does not have', () => {
    expect(moveEntry(sampleProfile, 'work.0', 'work.9')).toBe(sampleProfile)
  })
})

describe('toBands', () => {
  const blocks = [
    { id: 'section:work', page: 1, y: 100 },
    { id: 'work.0', page: 1, y: 120 },
    { id: 'work.1', page: 1, y: 200 },
    { id: 'section:education', page: 1, y: 300 },
    { id: 'education.0', page: 2, y: 40 },
  ]

  it('runs each band to where the next one starts', () => {
    const bands = toBands(blocks, [792, 792], 'entry')
    expect(bands.map((b) => [b.id, b.top, b.bottom])).toEqual([
      ['work.0', 120, 200],
      // Last entry on its page, so it runs to the bottom.
      ['work.1', 200, 792],
      ['education.0', 40, 792],
    ])
  })

  it('shows only what can be dropped on', () => {
    // A band that cannot accept the thing being dragged is worse than no band.
    expect(toBands(blocks, [792, 792], 'section').map((b) => b.id)).toEqual([
      'section:work',
      'section:education',
    ])
  })
})

describe('sectionsForProfile', () => {
  it('turns on a section the imported profile has content for', () => {
    // Parsing Languages correctly and then showing nothing is the same as not
    // parsing it: the document only renders the sections it lists.
    const sections = sectionsForProfile({ languages: [{ language: 'Spanish' }] }, document.sections)
    expect(sections.map((s) => s.id)).toContain('languages')
  })

  it('leaves a section off when there is nothing in it', () => {
    const sections = sectionsForProfile({ basics: { name: 'Ana' } }, document.sections)
    expect(sections.map((s) => s.id)).not.toContain('languages')
  })

  it('keeps the order the document already had', () => {
    const reordered = [...document.sections].reverse()
    const sections = sectionsForProfile({ awards: [{ title: 'Prize' }] }, reordered)
    expect(sections.slice(0, reordered.length)).toEqual(reordered)
    expect(sections.at(-1)?.id).toBe('awards')
  })

  it('returns the same array when nothing needs adding', () => {
    expect(sectionsForProfile({}, document.sections)).toBe(document.sections)
  })
})
