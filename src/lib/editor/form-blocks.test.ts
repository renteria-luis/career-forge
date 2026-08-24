import { describe, expect, it } from 'vitest'
import type { DocumentSection } from '@/lib/resume/document'
import { formBlockTitles, formBlocks } from './form-blocks'

const standard = (id: string, visible = true): DocumentSection => ({
  kind: 'standard',
  id,
  visible,
})

describe('formBlocks', () => {
  it('follows the order the document puts sections in', () => {
    // Rearranging on the page moves the document's sections. The form used to
    // render in a fixed order regardless, so moving Projects above Experience
    // changed the PDF and left the form describing the old arrangement.
    expect(formBlocks([standard('projects'), standard('work'), standard('education')])).toEqual([
      'projects',
      'work',
      'education',
    ])
    expect(formBlocks([standard('work'), standard('projects'), standard('education')])).toEqual([
      'work',
      'projects',
      'education',
    ])
  })

  it('leaves out a section the user hid', () => {
    expect(formBlocks([standard('work'), standard('projects', false)])).toEqual(['work'])
  })

  it('leaves out sections the form has no fields for', () => {
    // Summary is edited inside "You", and awards have no form yet. Listing
    // either would put a heading in the index that leads nowhere.
    expect(formBlocks([standard('summary'), standard('awards'), standard('work')])).toEqual([
      'work',
    ])
  })

  it('ignores a custom section, which the form cannot edit', () => {
    const custom: DocumentSection = { kind: 'custom', id: 'work', visible: true }
    expect(formBlocks([custom, standard('projects')])).toEqual(['projects'])
  })
})

describe('formBlockTitles', () => {
  it('heads the blocks in the order they are rendered', () => {
    expect(formBlockTitles([standard('projects'), standard('work')])).toEqual([
      'You',
      'Projects',
      'Experience',
    ])
  })

  it('keeps You first however the document is arranged', () => {
    // It holds the name and the contact details, which are not a section of the
    // resume and cannot be moved on the page.
    expect(formBlockTitles([standard('skills'), standard('work')])[0]).toBe('You')
  })

  it('is just You when the document has no sections the form can edit', () => {
    expect(formBlockTitles([])).toEqual(['You'])
  })
})
