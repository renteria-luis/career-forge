import { describe, expect, it } from 'vitest'
import {
  PASSWORD_RULES,
  credentialsSchema,
  emailSchema,
  normaliseEmail,
  registrationSchema,
  unmetRules,
} from './identity'

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

const GOOD = 'a-long-enough-1'

describe('PASSWORD_RULES', () => {
  it('is what both the form and the server read', () => {
    // One list, three consumers: the marks under the field, the check before
    // hashing, and the wording of the refusal. Three copies would be three
    // chances for the form to promise what the server does not enforce.
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual(['length', 'digit', 'symbol'])
  })

  it('names every rule a password falls short of, not just the first', () => {
    expect(unmetRules('short').map((rule) => rule.id)).toEqual(['length', 'digit', 'symbol'])
    expect(unmetRules('abcdefghijklm').map((rule) => rule.id)).toEqual(['digit', 'symbol'])
    expect(unmetRules('abcdefghijkl1').map((rule) => rule.id)).toEqual(['symbol'])
    expect(unmetRules(GOOD)).toEqual([])
  })

  it('counts a space as a symbol, so a passphrase is not refused', () => {
    // Words separated by spaces are the strongest thing most people will
    // willingly type. Refusing them for lacking punctuation would push somebody
    // towards something shorter.
    expect(unmetRules('correct horse battery 9').map((rule) => rule.id)).toEqual([])
  })

  it('counts digits and letters from any alphabet', () => {
    expect(unmetRules('contraseñalarga1!')).toEqual([])
    expect(unmetRules('пароль-достаточно-длинный9')).toEqual([])
  })
})

describe('credentialsSchema', () => {
  it('holds the rules and the ceiling', () => {
    expect(credentialsSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false)
    // Long enough, and nothing else. The two composition rules are recorded in
    // `PASSWORD_RULES` as a decision made against current guidance.
    expect(credentialsSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(20) }).success).toBe(
      false,
    )
    expect(
      credentialsSchema.safeParse({ email: 'a@b.co', password: `${GOOD}${'x'.repeat(129)}` })
        .success,
    ).toBe(false)
    expect(credentialsSchema.safeParse({ email: 'a@b.co', password: GOOD }).success).toBe(true)
  })
})

describe('registrationSchema', () => {
  it('wants a name that is not whitespace', () => {
    const body = { email: 'a@b.co', password: GOOD }
    expect(registrationSchema.safeParse({ ...body, name: '   ' }).success).toBe(false)
    expect(registrationSchema.parse({ ...body, name: '  Ada  ' }).name).toBe('Ada')
  })
})
