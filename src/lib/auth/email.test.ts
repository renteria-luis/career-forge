import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailNotSent, sendEmail } from './email'

/**
 * The test that would have caught the suite mailing real people.
 *
 * The sink used to be the fallback when no provider was configured, which read
 * as harmless. Then the end-to-end run happened on a machine with real
 * credentials in `.env.local`, and it posted its `@example.com` fixtures to the
 * live provider. Which one wins is the behaviour, not an implementation detail.
 */

const MESSAGE = { to: 'ada@example.com', subject: 'Confirm', text: 'Follow http://x/y' }

let sink: string

beforeEach(async () => {
  sink = await mkdtemp(join(tmpdir(), 'career-forge-mail-test-'))
  vi.unstubAllEnvs()
})

afterEach(async () => {
  await rm(sink, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function watchFetch() {
  const spy = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('sendEmail', () => {
  it('writes to the sink instead of a configured provider', async () => {
    const spy = watchFetch()
    vi.stubEnv('EMAIL_SINK_DIR', sink)
    vi.stubEnv('RESEND_API_KEY', 're_a_real_looking_key')
    vi.stubEnv('EMAIL_FROM', 'Career Forge <noreply@example.com>')

    await sendEmail(MESSAGE)

    expect(spy).not.toHaveBeenCalled()
    const [file] = await readdir(sink)
    expect(file).toBeDefined()
    const written = await readFile(join(sink, file!), 'utf8')
    expect(written).toContain('To: ada@example.com')
    expect(written).toContain('http://x/y')
  })

  it('sends through the provider when no sink is named', async () => {
    const spy = watchFetch()
    vi.stubEnv('RESEND_API_KEY', 'a-key')
    vi.stubEnv('EMAIL_FROM', 'Career Forge <noreply@example.com>')

    await sendEmail(MESSAGE)

    expect(spy).toHaveBeenCalledOnce()
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(init.body))).toMatchObject({ to: 'ada@example.com' })
  })

  it('refuses to pretend in production when nothing is configured', async () => {
    // An account whose confirmation email silently failed is an account nobody
    // can reach. Failing loudly is what lets the person be told to try again.
    vi.stubEnv('NODE_ENV', 'production')
    await expect(sendEmail(MESSAGE)).rejects.toThrow(EmailNotSent)
  })

  it('reports a provider that refuses, rather than swallowing it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 422 })),
    )
    vi.stubEnv('RESEND_API_KEY', 'a-key')
    vi.stubEnv('EMAIL_FROM', 'Career Forge <noreply@example.com>')

    await expect(sendEmail(MESSAGE)).rejects.toThrow(/422/)
  })

  it('never puts the recipient in the error it throws', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(sendEmail(MESSAGE)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('ada@example.com') }),
    )
  })
})
