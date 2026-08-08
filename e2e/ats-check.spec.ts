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
  test('explains what it does without a file', async ({ page }) => {
    // Most visitors read before they drop anything, and many never drop at all.
    await page.goto('/ats-check')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('the way a machine does')
    await expect(page.getByText('What is an applicant tracking system?')).toBeVisible()
    await expect(page.getByText('Drop your resume here')).toBeVisible()
  })

  test('is reachable from the home page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Check your resume' }).click()
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
  })
})
