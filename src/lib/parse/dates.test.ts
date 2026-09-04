import { describe, expect, it } from 'vitest'
import { parseDatePart, parseDateRange } from './dates'

describe('parseDatePart', () => {
  it.each([
    ['Feb 2023', '2023-02'],
    ['February 2023', '2023-02'],
    ['Sept 2019', '2019-09'],
    ['03/2021', '2021-03'],
    ['3-2021', '2021-03'],
    ['2019', '2019'],
    // Spanish resumes are the common case for this project's first users.
    ['Marzo 2020', '2020-03'],
    ['dic. 2018', '2018-12'],
  ])('reads %s as %s', (input, expected) => {
    expect(parseDatePart(input)).toBe(expected)
  })

  it('returns nothing for text that is not a date', () => {
    expect(parseDatePart('Senior Engineer')).toBeUndefined()
  })
})

describe('parseDateRange', () => {
  it.each([
    ['Feb 2023 – Present', '2023-02', undefined, true],
    ['Feb 2023 - Present', '2023-02', undefined, true],
    ['January 2020 to December 2021', '2020-01', '2021-12', false],
    ['2021 – Jan 2023', '2021', '2023-01', false],
    ['2019-2023', '2019', '2023', false],
    ['01/2020 – 03/2021', '2020-01', '2021-03', false],
    ['Marzo 2020 – Actualidad', '2020-03', undefined, true],
    ['Ene 2018 hasta Dic 2019', '2018-01', '2019-12', false],
    // Year first. Read as a bare year before, which dropped the month and then
    // the whole second half of the range with it.
    ['2020-01 - 2021-03', '2020-01', '2021-03', false],
    ['2020-01', '2020-01', undefined, false],
    ['2020-01 – Present', '2020-01', undefined, true],
    // A quarter spans three months, so no month is invented. Matching the
    // prefix is still what keeps the end of the range from being dropped.
    ['Q1 2020 - Q3 2021', '2020', '2021', false],
    ['Q3 2021', '2021', undefined, false],
  ])('reads %s', (line, start, end, current) => {
    const range = parseDateRange(line)
    expect(range?.startDate).toBe(start)
    expect(range?.endDate).toBe(end)
    expect(range?.current).toBe(current)
  })

  it('finds the range inside a full entry line', () => {
    // This is the shape the extractor actually produces: title, wide gap, date.
    const range = parseDateRange('Senior ML Engineer Feb 2023 – Present')
    expect(range?.startDate).toBe('2023-02')
    expect(range?.current).toBe(true)
  })

  it('treats a lone date as a start, not an end', () => {
    const range = parseDateRange('Freelance consultant 2022')
    expect(range?.startDate).toBe('2022')
    expect(range?.endDate).toBeUndefined()
    expect(range?.current).toBe(false)
  })

  it('does not read a hyphenated standard number as a date', () => {
    // "01-2015" sits inside "9001-2015" and used to be read as January 2015,
    // which put a certification number into a date field.
    const range = parseDateRange('ISO 9001-2015 certified')
    expect(range?.startDate).toBe('2015')
    expect(range?.endDate).toBeUndefined()
  })

  it('reports the matched text so callers can strip it from the title', () => {
    const range = parseDateRange('Data Scientist 2021 – Jan 2023')
    expect(range?.matched).toBe('2021 – Jan 2023')
  })

  it('finds nothing in a line with no dates', () => {
    expect(parseDateRange('Built the demand forecast for 40 stores')).toBeUndefined()
  })

  it('ignores numbers that are not years', () => {
    // Metrics are everywhere in good bullets and none of them are dates.
    expect(parseDateRange('Cut latency from 240ms to 45ms')).toBeUndefined()
  })
})
