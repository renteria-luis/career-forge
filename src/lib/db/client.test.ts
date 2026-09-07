import { describe, expect, it } from 'vitest'
import { connection } from './client'

/**
 * The tests that would have caught a connection quietly stopping being
 * verified.
 *
 * Measured against a real managed Postgres: `pg` builds its TLS settings from
 * `sslmode` when the connection string carries one, and ignores the `ssl`
 * option handed to it alongside. A certificate signed by an unknown authority
 * was accepted. With `sslmode` absent, the same connection refused it.
 */

const NEON = 'postgresql://user:secret@host-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'

describe('connection', () => {
  it('takes sslmode out of the string, so the driver cannot decide for us', () => {
    const { connectionString } = connection(NEON)
    expect(connectionString).not.toContain('sslmode')
  })

  it('verifies the certificate by default', () => {
    expect(connection(NEON).ssl).toEqual({ rejectUnauthorized: true })
    expect(connection('postgresql://user:secret@host/db').ssl).toEqual({
      rejectUnauthorized: true,
    })
  })

  it('does not let the string weaken it', () => {
    // Every one of these is a caller asking to encrypt without checking who is
    // on the other end. The answer is the same as for a URL that asks for
    // nothing at all.
    for (const mode of ['prefer', 'allow', 'require', 'no-verify', 'verify-ca']) {
      const { connectionString, ssl } = connection(`${NEON.replace('require', mode)}`)
      expect(ssl).toEqual({ rejectUnauthorized: true })
      expect(connectionString).not.toContain('sslmode')
    }
  })

  it('turns TLS off only for the local test database', () => {
    // The one case that has to work: PGlite over a socket on this machine,
    // which cannot offer a certificate.
    expect(
      connection('postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable').ssl,
    ).toBe(false)
  })

  it('keeps everything else in the string intact', () => {
    // Removing a parameter by hand once produced `/neondb&channel_binding=...`
    // as the database name, which the server answered by saying no such
    // database exists.
    const { connectionString } = connection(`${NEON}&channel_binding=require`)
    const parsed = new URL(connectionString)

    expect(parsed.pathname).toBe('/neondb')
    expect(parsed.username).toBe('user')
    expect(parsed.password).toBe('secret')
    expect(parsed.hostname).toBe('host-pooler.us-east-2.aws.neon.tech')
    expect(parsed.searchParams.get('channel_binding')).toBe('require')
  })
})
