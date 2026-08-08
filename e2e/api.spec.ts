import { expect, test } from '@playwright/test'

test.describe('/api/health', () => {
  test('compiles a resume and reports it', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body).toMatchObject({ ok: true, pageCount: 1 })
    expect(body.bytes).toBeGreaterThan(1000)
  })
})

test.describe('/api/compile', () => {
  const document = {
    id: 'e2e',
    sections: [{ kind: 'standard', id: 'work', visible: true }],
  }

  test('returns a PDF for a valid profile', async ({ request }) => {
    const response = await request.post('/api/compile', {
      data: {
        profile: { basics: { name: 'Ana Ruiz' }, work: [{ name: 'Acme', position: 'Engineer' }] },
        document,
      },
    })
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('application/pdf')
    expect(response.headers()['x-page-count']).toBe('1')
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('reports which field failed validation without echoing its value', async ({ request }) => {
    const response = await request.post('/api/compile', {
      data: { profile: { work: [{ startDate: 'last summer' }] }, document },
    })
    expect(response.status()).toBe(422)
    const body = await response.json()
    expect(body.fields[0].path).toBe('profile.work.0.startDate')
    // The value is somebody's data; it must not come back in an error.
    expect(JSON.stringify(body)).not.toContain('last summer')
  })

  test('rejects a body that is not JSON at all', async ({ request }) => {
    const response = await request.post('/api/compile', {
      headers: { 'content-type': 'application/json' },
      // Raw bytes, so this is genuinely unparseable rather than a JSON string.
      data: Buffer.from('{ this is not json'),
    })
    expect(response.status()).toBe(400)
  })

  test('rejects valid JSON of the wrong shape', async ({ request }) => {
    const response = await request.post('/api/compile', { data: { nope: true } })
    expect(response.status()).toBe(422)
  })
})

test.describe('/api/import', () => {
  test('parses an uploaded resume', async ({ request }) => {
    // Compiled by our own health route, so this is a genuine PDF round trip.
    const pdf = Buffer.from(
      await (
        await request.post('/api/compile', {
          data: {
            profile: {
              basics: { name: 'Ana Ruiz', email: 'ana@example.com' },
              work: [{ name: 'Acme', position: 'Engineer', startDate: '2021-03' }],
            },
            document: { id: 'x', sections: [{ kind: 'standard', id: 'work', visible: true }] },
          },
        })
      ).body(),
    )

    const response = await request.post('/api/import', {
      multipart: { file: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: pdf } },
    })
    expect(response.ok()).toBe(true)
    const { profile, report } = await response.json()
    expect(profile.basics.name).toBe('Ana Ruiz')
    expect(report.sections[0].mappedTo).toBe('work')
  })

  test('refuses a file that is not a PDF', async ({ request }) => {
    const response = await request.post('/api/import', {
      multipart: {
        file: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello') },
      },
    })
    expect(response.status()).toBe(415)
    expect((await response.json()).error).toContain('not a PDF')
  })

  test('refuses a request with no file', async ({ request }) => {
    const response = await request.post('/api/import', { multipart: {} })
    expect(response.status()).toBe(400)
  })
})
