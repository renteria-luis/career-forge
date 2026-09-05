import { expect, test } from '@playwright/test'

/**
 * Both of these endpoints were reachable by anyone with the URL, and both spend
 * CPU on a document the caller chose. What is asserted here is the part that is
 * easy to get subtly wrong: that the address the limit keys on is the one the
 * proxy wrote, not the one the caller did.
 *
 * Every test uses a trailing address of its own, because the buckets live in
 * the server these tests share. A test that spent another test's allowance
 * would fail the other one instead of itself.
 */

const BOUNDARY = '----e2e'

function multipart(): { body: Buffer; contentType: string } {
  const head =
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="a.pdf"\r\n` +
    `Content-Type: application/pdf\r\n\r\n`
  return {
    body: Buffer.from(`${head}%PDF-1.4\n${'A'.repeat(64)}\r\n--${BOUNDARY}--\r\n`),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  }
}

/**
 * As Cloud Run delivers it: whatever the caller sent, then the address it saw.
 *
 * The address carries the project name because desktop and mobile run the same
 * spec against the same server. Sharing one would have each project spending
 * the other's allowance, and the second to arrive fails a limit the first
 * reached — which is what happened the first time this ran.
 */
const forwarded = (proxySaw: string, callerClaimed = '10.1.2.3') => ({
  'x-forwarded-for': `${callerClaimed}, ${proxySaw}-${test.info().project.name}`,
})

test.describe('rate limiting', () => {
  test('refuses an eleventh import from one caller, and says when to return', async ({
    request,
  }) => {
    const { body, contentType } = multipart()
    const headers = { ...forwarded('203.0.113.10'), 'content-type': contentType }

    const codes: number[] = []
    for (let i = 0; i < 12; i += 1) {
      codes.push((await request.post('/api/import', { headers, data: body })).status())
    }

    // The allowance is ten. What the parser makes of the file is not the point;
    // that it was let through is.
    expect(codes.slice(0, 10).every((code) => code !== 429)).toBe(true)
    expect(codes[10]).toBe(429)

    const refused = await request.post('/api/import', { headers, data: body })
    expect(Number(refused.headers()['retry-after'])).toBeGreaterThan(0)
    expect((await refused.json()).error).toContain('Too many requests')
  })

  /**
   * The failure this exists to prevent. `X-Forwarded-For` is a list the caller
   * can start and the proxy appends to, so reading the first entry — which is
   * what the header's own documentation invites — turns a per-address limit
   * into a per-header-value one, and rotating the header restores the full
   * allowance on every request.
   */
  test('a caller cannot mint a fresh allowance by rewriting the header', async ({ request }) => {
    const { body, contentType } = multipart()

    const codes: number[] = []
    for (let i = 0; i < 12; i += 1) {
      const headers = { ...forwarded('203.0.113.11', `10.0.0.${i}`), 'content-type': contentType }
      codes.push((await request.post('/api/import', { headers, data: body })).status())
    }

    expect(codes[10]).toBe(429)
    expect(codes.filter((code) => code === 429).length).toBeGreaterThan(0)
  })

  test('one caller reaching the limit does not refuse another', async ({ request }) => {
    const { body, contentType } = multipart()

    const spend = async (proxySaw: string) =>
      (
        await request.post('/api/import', {
          headers: { ...forwarded(proxySaw), 'content-type': contentType },
          data: body,
        })
      ).status()

    for (let i = 0; i < 11; i += 1) await spend('203.0.113.12')
    expect(await spend('203.0.113.12')).toBe(429)
    expect(await spend('203.0.113.13')).not.toBe(429)
  })

  test('compiling at the speed the preview types is not limited', async ({ request }) => {
    const headers = forwarded('203.0.113.14')
    const data = {
      profile: { basics: { name: 'Ana Ruiz' } },
      document: { id: 'e2e', sections: [{ kind: 'standard', id: 'work', visible: true }] },
    }

    // The editor debounces at 250 ms, so this is well past what a tab produces.
    const codes: number[] = []
    for (let i = 0; i < 30; i += 1) {
      codes.push((await request.post('/api/compile', { headers, data })).status())
    }

    expect(codes.every((code) => code === 200)).toBe(true)
  })
})
