import { describe, expect, it } from 'vitest'
import type { TextLine } from './extract'
import { parseResume } from './parse'

/**
 * A degree written on one line, which is how most resumes write one:
 * "Qualification - Institution, Place", with the dates set to the right.
 */
const line = (text: string, y: number, size = 10, bold = false): TextLine => ({
  text,
  x: 40,
  y,
  size,
  bold,
  page: 1,
})

function educationFrom(...entries: string[]) {
  const lines: TextLine[] = [
    line('Ana Ruiz', 740, 16, true),
    line('EDUCATION', 700, 11, true),
    ...entries.map((text, index) => line(text, 680 - index * 20, 10, true)),
    line('Written as an ordinary sentence.', 400),
  ]
  return parseResume({ pages: 1, lines, imageOnly: false }).profile.education ?? []
}

describe('a degree written with a hyphen', () => {
  it('separates the qualification, the institution and the place', () => {
    // All three used to land in the field of study together, because a plain
    // hyphen was not one of the separators a title line could carry — only the
    // em dash, the en dash and the pipe were.
    const [entry] = educationFrom(
      'Graduate Certificate - Fanshawe College, London, ON, Canada\tSep 2025 - Present',
    )
    expect(entry).toMatchObject({
      area: 'Graduate Certificate',
      institution: 'Fanshawe College',
      location: 'London, ON, Canada',
      startDate: '2025-09',
    })
    // No end date: still studying, which is what Present means.
    expect(entry.endDate).toBeUndefined()
  })

  it('reads a degree that names its field, and a place with no province', () => {
    const [entry] = educationFrom(
      "Bachelor's in Electronic Engineering - Catholic University of San Pablo, " +
        'Arequipa, Peru\tAug 2015 - Aug 2020',
    )
    expect(entry).toMatchObject({
      area: "Bachelor's in Electronic Engineering",
      institution: 'Catholic University of San Pablo',
      location: 'Arequipa, Peru',
      startDate: '2015-08',
      endDate: '2020-08',
    })
  })

  it('reads several degrees on their own lines', () => {
    const entries = educationFrom(
      'Graduate Certificate - Fanshawe College, London, ON, Canada\tSep 2025 - Present',
      "Bachelor's in Electronic Engineering - Catholic University of San Pablo, " +
        'Arequipa, Peru\tAug 2015 - Aug 2020',
    )
    expect(entries.map((entry) => entry.institution)).toEqual([
      'Fanshawe College',
      'Catholic University of San Pablo',
    ])
  })

  it('does not cut a date range in half', () => {
    // The hyphen is also how a range is written. A date that never made it
    // into a column of its own is still sitting in the line, and splitting
    // there would file "Aug 2020" as the institution.
    const [entry] = educationFrom("Bachelor's in Engineering, UNI, Lima, Peru | 2015 - Aug 2020")
    expect(entry).toMatchObject({ startDate: '2015', endDate: '2020-08' })
    // Nothing of the range was left behind in a field of its own.
    expect(entry.area).not.toMatch(/20\d\d/)
  })

  it('leaves a line with no separator whole', () => {
    const [entry] = educationFrom('Universidad Nacional de Ingeniería\t2016 - 2020')
    expect(entry.area).toBe('Universidad Nacional de Ingeniería')
  })
})
