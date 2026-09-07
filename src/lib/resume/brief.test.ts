import { describe, expect, it } from 'vitest'
import { MAX_NOTES, MAX_POSTING, careerNotes, jobTarget } from './brief'

/**
 * The brief behaves like the profile does, because it is typed into the same
 * kind of form: a cleared box means "I do not have one", not an empty string
 * that later reads as a value.
 */

describe('a cleared field is an absent field', () => {
  it('drops blanks and trims what is left', () => {
    expect(jobTarget.parse({ company: '  Nomad Analytics ', role: '   ' })).toEqual({
      company: 'Nomad Analytics',
      role: undefined,
      url: undefined,
      posting: undefined,
    })
  })

  it('accepts a link the way somebody pastes it', () => {
    expect(jobTarget.parse({ url: 'company.com/careers/123' }).url).toBe(
      'https://company.com/careers/123',
    )
  })
})

describe('what arrives is bounded', () => {
  it('refuses an advert past the ceiling rather than sending it', () => {
    expect(jobTarget.safeParse({ posting: 'x'.repeat(MAX_POSTING + 1) }).success).toBe(false)
    expect(jobTarget.safeParse({ posting: 'x'.repeat(MAX_POSTING) }).success).toBe(true)
  })

  it('refuses notes past the ceiling', () => {
    expect(careerNotes.safeParse({ notes: 'x'.repeat(MAX_NOTES + 1) }).success).toBe(false)
  })
})

describe('an empty brief is a valid brief', () => {
  it.each([[{}], [{ notes: undefined }]])('accepts %o', (value) => {
    expect(careerNotes.safeParse(value).success).toBe(true)
  })
})
