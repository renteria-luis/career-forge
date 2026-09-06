import { describe, expect, it } from 'vitest'
import { hashPassword, needsRehash, verifyPassword } from './password'

describe('hashPassword', () => {
  it('produces Argon2id at the parameters the plan names', async () => {
    // The stored string carries its own parameters, which is what makes
    // `needsRehash` possible and what this asserts on: m=19456, t=2, p=1.
    expect(await hashPassword('a-long-enough-password')).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
    )
  })

  it('salts, so the same password twice is not the same row', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')])
    expect(first).not.toBe(second)
  })
})

describe('verifyPassword', () => {
  it('accepts the password and refuses everything else', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(stored, 'correct horse batterz')).toBe(false)
    expect(await verifyPassword(stored, '')).toBe(false)
  })

  it('treats an unreadable stored hash as a failed login, not an error', async () => {
    // A 500 here would answer a question the login form must not answer.
    expect(await verifyPassword('not a hash', 'anything')).toBe(false)
  })
})

describe('needsRehash', () => {
  it('leaves a hash made under the current parameters alone', async () => {
    expect(needsRehash(await hashPassword('a-long-enough-password'))).toBe(false)
  })

  it('flags weaker parameters and anything it cannot read', () => {
    expect(needsRehash('$argon2id$v=19$m=4096,t=2,p=1$c29tZXNhbHQ$aGFzaA')).toBe(true)
    expect(needsRehash('$argon2i$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA')).toBe(true)
    expect(needsRehash('$2b$12$something')).toBe(true)
  })
})
