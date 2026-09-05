import { expect, test } from '@playwright/test'

/**
 * The check is the way most people will arrive, so it has to work for someone
 * who has never seen the rest of the product.
 */

async function compiledResume(
  request: import('@playwright/test').APIRequestContext,
  profile: unknown,
): Promise<Buffer> {
  const response = await request.post('/api/compile', {
    data: {
      profile,
      document: {
        id: 'x',
        sections: [
          { kind: 'standard', id: 'summary', visible: true },
          { kind: 'standard', id: 'work', visible: true },
        ],
      },
    },
  })
  return Buffer.from(await response.body())
}

const complete = {
  basics: {
    name: 'Ana Ruiz',
    email: 'ana@example.com',
    phone: '+1 987-654-3210',
    summary: 'Machine learning engineer with four years building retrieval systems in production.',
  },
  work: [
    {
      name: 'Nomad Analytics',
      position: 'Senior ML Engineer',
      startDate: '2023-02',
      highlights: ['Cut retrieval latency from 240ms to 45ms by replacing the vector index.'],
    },
  ],
}

test.describe('the page itself', () => {
  test('is a title and the control, and nothing above it', async ({ page }) => {
    await page.goto('/ats-check')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ATS checker')
    await expect(page.getByText('Drop your resume here')).toBeVisible()

    // Somebody arrived here to use a tool. The explanation is a link away, and
    // this asserts it did not creep back above the control.
    await expect(page.getByText('What is an applicant tracking system?')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'How it works' })).toBeVisible()
  })

  test('is reachable from the home page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /Drop a PDF/ }).click()
    await expect(page).toHaveURL(/\/ats-check$/)
  })
})

test.describe('checking a resume', () => {
  test('reports what a parser read, and uploads nothing', async ({ page, request }) => {
    const pdf = await compiledResume(request, complete)

    const posts: string[] = []
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(r.url())
    })

    await page.goto('/ats-check')
    await page.setInputFiles('input[type=file]', {
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    })

    await expect(page.getByText('A machine reads this cleanly.')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('The text can be read')).toBeVisible()
    await expect(page.getByText('Single column')).toBeVisible()

    // The whole privacy claim rests on this: there is no endpoint that receives
    // the file, so nothing can be stored whatever a policy might say.
    expect(posts).toEqual([])
  })

  test('shows the fields it filled and the ones it could not', async ({ page, request }) => {
    const pdf = await compiledResume(request, {
      basics: { name: 'Ana Ruiz' },
      work: [{ name: 'Acme', position: 'Engineer', startDate: '2023-02' }],
    })

    await page.goto('/ats-check')
    await page.setInputFiles('input[type=file]', {
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    })

    await expect(page.getByText('What it took from the page')).toBeVisible({ timeout: 30_000 })
    // An empty field is the finding, so it has to be visible as one.
    await expect(page.getByText('not found').first()).toBeVisible()
    await expect(page.getByText('Missing contact details')).toBeVisible()
  })

  test('refuses a file that is not a PDF', async ({ page }) => {
    await page.goto('/ats-check')
    await page.setInputFiles('input[type=file]', {
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is not a pdf'),
    })
    await expect(page.getByText('not a PDF')).toBeVisible({ timeout: 20_000 })
  })

  test('hands what it read to the editor', async ({ page, request }) => {
    // There must be exactly one copy of pdf.js in the application. Two register
    // two workers and the first to claim the global wins, which made this exact
    // journey fail with "The API version does not match the Worker version".
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    const pdf = await compiledResume(request, complete)
    await page.goto('/ats-check')
    await page.setInputFiles('input[type=file]', {
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    })

    await expect(page.getByRole('button', { name: 'Open this in the editor' })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Open this in the editor' }).click()

    await expect(page).toHaveURL(/\/editor$/)
    await expect(page.getByLabel('Full name')).toHaveValue('Ana Ruiz', { timeout: 20_000 })

    // The preview has to draw without a refresh, which is what the version
    // clash prevented. On a phone it is the other view, so ask for it.
    const toggle = page.getByRole('button', { name: 'See the preview' })
    if (await toggle.isVisible()) await toggle.click()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 })
    expect(errors).toEqual([])
  })
})
