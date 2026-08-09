import { describe, expect, it } from 'vitest'
import type { TextLine } from './extract'
import { toLanguages } from './parse'

/** A line off the page, with only the text mattering here. */
const line = (text: string, bold = false): TextLine => ({
  text,
  x: 40,
  y: 500,
  size: 10,
  bold,
  page: 1,
})

const read = (...texts: string[]) => toLanguages(texts.map((text) => line(text)))

describe('toLanguages', () => {
  it('reads several languages written on one line with colons', () => {
    // The bug this reader exists for. Read as a labelled list — which is what
    // a skills line is — the first language becomes the label and the whole
    // rest of the line becomes its level.
    expect(read('English: Advanced, Spanish: Native, French: Basic')).toEqual([
      { language: 'English', fluency: 'Advanced' },
      { language: 'Spanish', fluency: 'Native' },
      { language: 'French', fluency: 'Basic' },
    ])
  })

  it('reads a line separated by pipes', () => {
    expect(read('English (advanced) | Spanish (native)')).toEqual([
      { language: 'English', fluency: 'advanced' },
      { language: 'Spanish', fluency: 'native' },
    ])
  })

  it('reads one language per line, as bullets', () => {
    expect(read('• Spanish: Native', '• English: Professional')).toEqual([
      { language: 'Spanish', fluency: 'Native' },
      { language: 'English', fluency: 'Professional' },
    ])
  })

  it('reads a dash between the language and the level', () => {
    expect(read('English - Advanced')).toEqual([{ language: 'English', fluency: 'Advanced' }])
  })

  it('keeps a hyphenated name whole', () => {
    // Spaces are required around the dash for exactly this.
    expect(read('Serbo-Croatian')).toEqual([{ language: 'Serbo-Croatian' }])
  })

  it('keeps a level whole when it has a comma inside brackets', () => {
    expect(read('English (Native, C2), Spanish')).toEqual([
      { language: 'English', fluency: 'Native, C2' },
      { language: 'Spanish' },
    ])
  })

  it('reads a bare list with no levels at all', () => {
    expect(read('English, Spanish, French')).toEqual([
      { language: 'English' },
      { language: 'Spanish' },
      { language: 'French' },
    ])
  })

  it('reads square brackets the way it reads round ones', () => {
    expect(read('German [B2]')).toEqual([{ language: 'German', fluency: 'B2' }])
  })

  it('drops a language with nothing in it', () => {
    expect(read('English: Advanced, , Spanish')).toEqual([
      { language: 'English', fluency: 'Advanced' },
      { language: 'Spanish' },
    ])
  })

  it('leaves out a level that was never written', () => {
    expect(read('English:')).toEqual([{ language: 'English' }])
  })
})
