import { describe, expect, it } from 'vitest'
import { findPlace, parsePlace } from './location'

describe('parsePlace', () => {
  it.each([
    ['Lima, Peru', 'Lima', 'Peru'],
    ['Lima, PE', 'Lima', 'PE'],
    ['Arequipa, Peru', 'Arequipa', 'Peru'],
    ['Madrid, Spain', 'Madrid', 'Spain'],
    ['Austin, TX, USA', 'Austin, TX', 'United States'],
    // A province is part of the place, not a country of its own.
    ['London, ON, Canada', 'London, ON', 'Canada'],
  ])('reads %s as %s / %s', (input, city, country) => {
    expect(parsePlace(input)).toEqual({ city, countryCode: country })
  })

  it.each([
    ['London, ON', 'London, ON'],
    ['Boston, MA', 'Boston, MA'],
    ['Springfield, IL', 'Springfield, IL'],
    ['Baltimore, MD', 'Baltimore, MD'],
  ])('keeps %s whole, because the code is a state or a province', (input, city) => {
    // MA is Massachusetts and also Morocco; IL is Illinois and also Israel. On
    // a resume the subdivision is overwhelmingly the likelier reading.
    expect(parsePlace(input)).toEqual({ city })
  })
})

describe('findPlace', () => {
  it('picks the place out of a header line', () => {
    const segments = [
      'Available Fall 2026',
      'London, ON',
      '555-0100',
      'lu@example.com',
      'github.com/x',
    ]
    expect(findPlace(segments)).toEqual({ city: 'London, ON' })
  })

  it('ignores a phone number and a graduation year', () => {
    // Both look like a place if you only check for punctuation.
    expect(findPlace(['+51 999, 888', 'Class of 2026, honours'])).toBeUndefined()
  })

  it('finds nothing when there is no place', () => {
    expect(findPlace(['lu@example.com', 'github.com/x'])).toBeUndefined()
  })
})
