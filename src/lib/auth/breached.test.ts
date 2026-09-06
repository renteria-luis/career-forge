import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkBreached } from './breached'

/**
 * A password and the two halves of its SHA-1, written out rather than computed.
 *
 * Computing it in the test would be the implementation checking itself. These
 * are the values the real service is asked for, and the string is distinctive
 * so "the password did not travel" is something the assertions can actually see.
 */
const PASSWORD = 'correct horse battery staple'
const PREFIX = 'ABF7A'
const SUFFIX = 'AD6438836DBE526AA231ABDE2D0EEF74D42'

afterEach(() => {
  vi.unstubAllGlobals()
})

function answerWith(body: string, ok = true) {
  const fetchMock = vi.fn(async () => new Response(body, { status: ok ? 200 : 503 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('checkBreached', () => {
  it('sends five characters of a hash and never the password', async () => {
    const fetchMock = answerWith('')
    await checkBreached(PASSWORD)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`)
    expect(url).not.toContain(PASSWORD)
    expect(JSON.stringify(init)).not.toContain(PASSWORD)
    // Asks for padding, so the size of the answer says nothing about the prefix.
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true')
  })

  it('finds the suffix in the list', async () => {
    answerWith(`0000000000000000000000000000000000A:3\r\n${SUFFIX}:12345\r\n`)
    expect(await checkBreached(PASSWORD)).toEqual({ breached: true, unavailable: false })
  })

  it('clears a password the corpus does not hold', async () => {
    answerWith('0000000000000000000000000000000000A:3\r\n')
    expect(await checkBreached(PASSWORD)).toEqual({ breached: false, unavailable: false })
  })

  it('does not count a padded entry as a match', async () => {
    // The service pads its answer with real-looking suffixes at a count of
    // zero. Reading the presence of the line rather than the count would refuse
    // passwords that were never breached.
    answerWith(`${SUFFIX}:0\r\n`)
    expect(await checkBreached(PASSWORD)).toEqual({ breached: false, unavailable: false })
  })

  it('fails open, and says that is what happened', async () => {
    // Failing closed would mean a third-party outage stops anyone registering.
    answerWith('', false)
    expect(await checkBreached(PASSWORD)).toEqual({ breached: false, unavailable: true })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    expect(await checkBreached(PASSWORD)).toEqual({ breached: false, unavailable: true })
  })
})
