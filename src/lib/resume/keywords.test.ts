import { describe, expect, it } from 'vitest'
import { hasSeparator, splitKeywords } from './keywords'

describe('splitKeywords', () => {
  it('splits a plain list', () => {
    expect(splitKeywords('Python, Pandas, SQL')).toEqual(['Python', 'Pandas', 'SQL'])
  })

  it('keeps a bracketed list with the keyword it belongs to', () => {
    // The whole reason this function exists. Split naively it comes out as
    // "Python (Pandas" and "Regex)", which is wrong and unreadable.
    expect(splitKeywords('Python (Pandas, Pydantic, Regex)')).toEqual([
      'Python (Pandas, Pydantic, Regex)',
    ])
  })

  it('splits between bracketed keywords but not inside them', () => {
    expect(splitKeywords('Python (Pandas, Regex), SQL (Postgres, DuckDB), Go')).toEqual([
      'Python (Pandas, Regex)',
      'SQL (Postgres, DuckDB)',
      'Go',
    ])
  })

  it('reads the other separators a resume uses', () => {
    expect(splitKeywords('Python; Pandas · SQL | Go')).toEqual(['Python', 'Pandas', 'SQL', 'Go'])
  })

  it('handles square and curly brackets too', () => {
    expect(splitKeywords('AWS [EC2, S3], Terraform')).toEqual(['AWS [EC2, S3]', 'Terraform'])
  })

  it('leaves an unclosed bracket running rather than repairing it', () => {
    // Someone mid-way through typing has an open bracket and does not want the
    // comma they are about to type to cut the line in half.
    expect(splitKeywords('Python (Pandas, Pydantic')).toEqual(['Python (Pandas, Pydantic'])
  })

  it('drops the empty pieces a trailing separator leaves', () => {
    expect(splitKeywords('Python, , SQL,')).toEqual(['Python', 'SQL'])
  })

  it('returns nothing for nothing', () => {
    expect(splitKeywords('')).toEqual([])
    expect(splitKeywords('   ')).toEqual([])
  })
})

describe('hasSeparator', () => {
  it('is true once a keyword has actually ended', () => {
    expect(hasSeparator('Python,')).toBe(true)
    expect(hasSeparator('Python, Pandas')).toBe(true)
  })

  it('is false for a comma inside brackets', () => {
    // Committing here would cut the keyword in half as it was being typed.
    expect(hasSeparator('Python (Pandas,')).toBe(false)
    expect(hasSeparator('Python (Pandas, Pydantic')).toBe(false)
  })

  it('is true again once the brackets close', () => {
    expect(hasSeparator('Python (Pandas, Pydantic),')).toBe(true)
  })

  it('is false for a keyword still being typed', () => {
    expect(hasSeparator('Python')).toBe(false)
  })
})
