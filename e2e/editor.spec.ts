import { expect, test } from '@playwright/test'

const status = 'header p.font-mono'

/**
 * Below the large breakpoint the two panes cannot both fit, so the preview is
 * behind a toggle. Tests that need to see the page have to ask for it.
 */
async function revealPreview(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', { name: 'See the preview' })
  if (await toggle.isVisible()) await toggle.click()
}

test.describe('editing', () => {
  test('typing a name recompiles the preview', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz Peña')
    await expect(page.locator(status)).toContainText('1 page', { timeout: 15_000 })
    await revealPreview(page)
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('the preview keeps the last good page while the next compiles', async ({
    page,
  }, testInfo) => {
    // The whole reason the preview draws to a canvas instead of an iframe.
    // Only observable where the form and the preview are on screen together;
    // on a phone they are alternate views, so there is nothing to flicker.
    test.skip(testInfo.project.name === 'mobile', 'Both panes are never visible at once.')
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana')
    await revealPreview(page)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('Summary').fill('Machine learning engineer.')
    // No gap where the canvas disappears while the next compile is in flight.
    await expect(page.locator('canvas')).toBeVisible()
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })

  test('a bad date is reported on the field and not swallowed', async ({ page }) => {
    await page.goto('/editor')
    const started = page.getByLabel('Started').first()
    await started.fill('last summer')
    await started.blur()
    await expect(page.getByText('Use YYYY, YYYY-MM or YYYY-MM-DD').first()).toBeVisible()
  })

  test('clearing an optional field does not break the compile', async ({ page }) => {
    // Empty inputs arrive as "", which is not a valid email. If the schema did
    // not treat blank as absent, every half-filled form would fail to compile.
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana')
    await page.getByLabel('Email').fill('ana@example.com')
    await page.getByLabel('Email').fill('')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })
})

test.describe('layout controls', () => {
  test('hiding a section removes it from the document', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByLabel('Role').first().fill('Engineer')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    await page.getByRole('tab', { name: 'layout' }).click()
    await page.getByLabel('Experience', { exact: true }).uncheck()
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })

  test('changing the typeface recompiles', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByRole('tab', { name: 'layout' }).click()
    await page.getByLabel('Typeface').selectOption('eb-garamond')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })
})

test.describe('the draft survives', () => {
  test('a refresh keeps what was typed', async ({ page }) => {
    // A form this long is not one people will risk filling in twice.
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz Peña')
    await page.getByLabel('Role').first().fill('Senior ML Engineer')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    await page.reload()
    await expect(page.getByLabel('Full name')).toHaveValue('Ana Ruiz Peña', { timeout: 15_000 })
    await expect(page.getByLabel('Role').first()).toHaveValue('Senior ML Engineer')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })

  test('a corrupted draft is discarded rather than crashing the editor', async ({ page }) => {
    // Storage is editable by hand and outlives versions of this app.
    await page.goto('/editor')
    await page.evaluate(() =>
      localStorage.setItem('career-forge:draft:v1', '{"profile":{"basics":{"email":42}}}'),
    )
    await page.reload()
    await expect(page.getByLabel('Full name')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })
})

test.describe('profile links', () => {
  test('a handle is stored as a full address', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('GitHub').fill('octocat')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
    // Shown as the handle, kept as the address the document can link to.
    await expect(page.getByLabel('GitHub')).toHaveValue('octocat')
  })

  test('a pasted address is accepted and shown as a handle', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('LinkedIn').fill('https://linkedin.com/in/octocat')
    await expect(page.getByLabel('LinkedIn')).toHaveValue('octocat')
  })
})

test.describe('preview navigation', () => {
  test('clicking a line in the preview opens the field it came from', async ({ page }) => {
    // The preview is a picture of the document, so finding what to change means
    // hunting through the form. Clicking the line itself is the shorter route.
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByLabel('Role').first().fill('Senior ML Engineer')
    await page.getByLabel('Employer').first().fill('Nomad Analytics')
    await revealPreview(page)

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    const box = await canvas.boundingBox()
    if (!box) throw new Error('The preview did not render.')

    // The name sits at the top of the page, left-aligned.
    await canvas.click({ position: { x: 60, y: box.height * 0.06 } })

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('name')))
      .toBe('basics.name')
  })
})

test.describe('import and export', () => {
  test('importing a PDF fills the form and reports what was read', async ({ page, request }) => {
    const pdf = Buffer.from(
      await (
        await request.post('/api/compile', {
          data: {
            profile: {
              basics: { name: 'Ana Ruiz Peña', email: 'ana@example.com' },
              work: [
                {
                  name: 'Nomad Analytics',
                  position: 'Senior ML Engineer',
                  startDate: '2023-02',
                  highlights: ['Cut retrieval latency from 240ms to 45ms.'],
                },
              ],
            },
            document: { id: 'x', sections: [{ kind: 'standard', id: 'work', visible: true }] },
          },
        })
      ).body(),
    )

    await page.goto('/editor')
    await page.setInputFiles('input[type=file]', {
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    })

    await expect(page.getByLabel('Full name')).toHaveValue('Ana Ruiz Peña', { timeout: 15_000 })
    await expect(page.getByLabel('Role').first()).toHaveValue('Senior ML Engineer')
    await expect(page.getByText('What we read from your PDF')).toBeVisible()
  })

  test('a file that is not a PDF is refused with a usable message', async ({ page }) => {
    await page.goto('/editor')
    await page.setInputFiles('input[type=file]', {
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is not a pdf'),
    })
    await expect(page.getByText('not a PDF')).toBeVisible({ timeout: 15_000 })
  })

  test('download produces a PDF', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]).then(([event]) => event)

    expect(download.suggestedFilename()).toBe('ana-ruiz.pdf')
  })
})
