import { expect, test } from '@playwright/test'

const BOUNDARY = '----e2e-ceiling'

/**
 * Measured before this existed: the route checked `file.size`, which is only
 * knowable once `formData()` holds the whole body, so a 300 MB upload took RSS
 * to 1,085 MB and the 512 MiB instance was killed with no reply at all. A
 * ceiling has to stop the stream, not describe it afterwards.
 *
 * The address is per project because desktop and mobile share one server, and
 * the rate limit these requests also pass through is per address.
 */
const forwarded = () => ({
  'x-forwarded-for': `10.1.2.3, 203.0.113.15-${test.info().project.name}`,
})

test.describe('the upload ceiling', () => {
  test('stops a body past the ceiling instead of buffering it', async ({ request }) => {
    const oversized = Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="big.pdf"\r\n` +
          `Content-Type: application/pdf\r\n\r\n%PDF-1.4\n`,
      ),
      Buffer.alloc(9 * 1024 * 1024, 0x41),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ])

    const response = await request.post('/api/import', {
      headers: { ...forwarded(), 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      data: oversized,
    })

    expect(response.status()).toBe(413)
    // Still answering, which is the whole point of refusing early.
    expect((await request.get('/api/health')).status()).toBe(200)
  })

  test('accepts one inside it', async ({ request }) => {
    const body = Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n` +
          `Content-Type: application/pdf\r\n\r\n%PDF-1.4\n`,
      ),
      Buffer.alloc(64 * 1024, 0x41),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ])

    const response = await request.post('/api/import', {
      headers: { ...forwarded(), 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      data: body,
    })

    // Not a readable PDF, but it got past the ceiling to be told so.
    expect(response.status()).not.toBe(413)
  })
})
