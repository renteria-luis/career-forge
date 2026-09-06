import { describe, expect, it } from 'vitest'
import { credentialsSchema, emailSchema, normaliseEmail, registrationSchema } from './identity'

describe('normaliseEmail', () => {
  it('folds case, so one person cannot hold two accounts by accident', () => {
    expect(normaliseEmail('A@Example.COM')).toBe('a@example.com')
    expect(normaliseEmail('  ada@example.com  ')).toBe('ada@example.com')
  })

  it('leaves a tagged address alone', () => {
    // Deliberate: folding `+tags` is an anti-farming measure for stage 3, and
    // applied now it would break filing this app's mail into its own folder.
    expect(normaliseEmail('ada+jobs@example.com')).toBe('ada+jobs@example.com')
  })
})

describe('emailSchema', () => {
  it('normalises before it validates, so the stored value is the checked one', () => {
    expect(emailSchema.parse(' Ada@Example.com ')).toBe('ada@example.com')
  })

  it('refuses what is not an address', () => {
    expect(emailSchema.safeParse('ada').success).toBe(false)
    expect(emailSchema.safeParse('').success).toBe(false)
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@example.com`).success).toBe(false)
  })
})

describe('credentialsSchema', () => {
  it('holds the length bounds', () => {
    expect(credentialsSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false)
    expect(
      credentialsSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(129) }).success,
    ).toBe(false)
    expect(credentialsSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(12) }).success).toBe(
      true,
    )
  })
})

describe('registrationSchema', () => {
  it('wants a name that is not whitespace', () => {
    const body = { email: 'a@b.co', password: 'x'.repeat(12) }
    expect(registrationSchema.safeParse({ ...body, name: '   ' }).success).toBe(false)
    expect(registrationSchema.parse({ ...body, name: '  Ada  ' }).name).toBe('Ada')
  })
})
