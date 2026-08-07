import { describe, expect, it } from 'vitest'
import { sampleProfile } from './fixtures'
import { partialDate, profile, work } from './profile'

describe('partialDate', () => {
  it.each(['2024', '2024-03', '2024-03-15'])('accepts %s', (value) => {
    expect(partialDate.safeParse(value).success).toBe(true)
  })

  // Users type dates by hand and importers guess at them. These are the shapes
  // that must fail loudly rather than reach a template.
  it.each(['March 2024', '2024/03', '24-03', '', '2024-3'])('rejects %s', (value) => {
    expect(partialDate.safeParse(value).success).toBe(false)
  })
})

describe('profile', () => {
  it('accepts the sample profile', () => {
    expect(profile.safeParse(sampleProfile).success).toBe(true)
  })

  it('accepts a profile with nothing in it', () => {
    // A brand new user has an empty profile, and it must survive a round trip
    // through the schema before they have typed anything.
    expect(profile.parse({})).toEqual({})
  })

  it('keeps a current role distinguishable from one that ended', () => {
    const parsed = profile.parse(sampleProfile)
    const current = parsed.work?.[0]
    const past = parsed.work?.[1]
    expect(current?.endDate).toBeUndefined()
    expect(past?.endDate).toBe('2023-01')
  })

  it('drops unknown keys so imports from other tools do not fail', () => {
    // Other JSON Resume tools add their own fields. We read what we understand
    // and ignore the rest rather than rejecting the whole document.
    const parsed = work.parse({ name: 'Acme', position: 'Engineer', theme: 'kendall' })
    expect(parsed).toEqual({ name: 'Acme', position: 'Engineer' })
  })

  it('rejects an invalid date rather than passing it to a template', () => {
    const result = profile.safeParse({ work: [{ name: 'Acme', startDate: 'last year' }] })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed email', () => {
    expect(profile.safeParse({ basics: { email: 'ana@' } }).success).toBe(false)
  })
})
