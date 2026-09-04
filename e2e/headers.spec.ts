import { expect, test } from '@playwright/test'

/**
 * The headers were absent entirely until the audit looked for them, on a
 * deployment that already had a public URL. They are cheap, and the only thing
 * that would have caught their absence is a test that asks for them.
 */
const PAGES = ['/', '/ats-check', '/editor', '/design']

test.describe('security headers', () => {
  for (const path of PAGES) {
    test(`${path} is served with them`, async ({ request }) => {
      const headers = (await request.get(path)).headers()

      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['x-frame-options']).toBe('DENY')
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(headers['strict-transport-security']).toContain('max-age=')

      const csp = headers['content-security-policy']
      // The parts that do the work: no other origin's scripts, no framing, no
      // plugins, and a form cannot be pointed somewhere else.
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("form-action 'self'")
      // Fonts are self-hosted by next/font at build time. If this ever needs a
      // remote origin, something started fetching from Google at runtime.
      expect(csp).toContain("font-src 'self'")
    })
  }

  test('the API routes get them too', async ({ request }) => {
    const headers = (await request.post('/api/compile', { data: {} })).headers()

    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['content-security-policy']).toContain("default-src 'self'")
  })

  test('the whole app runs without tripping the policy', async ({ page }) => {
    const refusals: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) refusals.push(message.text())
    })

    for (const path of PAGES) {
      await page.goto(path)
      await expect(page.locator('body')).toBeVisible()
    }

    // The editor is where the policy is most likely to bite: a worker, wasm,
    // and object URLs for the download.
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await expect(page.locator('header p.font-mono')).toContainText('compiled in', {
      timeout: 20_000,
    })

    expect(refusals).toEqual([])
  })
})

test.describe('page structure', () => {
  test('the editor has a heading and a main landmark', async ({ page }) => {
    await page.goto('/editor')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Career Forge')
    await expect(page.getByRole('main')).toHaveCount(1)
  })

  test('the Content and Layout tabs name the panel they switch', async ({ page }) => {
    await page.goto('/editor')

    const content = page.getByRole('tab', { name: 'content' })
    const layout = page.getByRole('tab', { name: 'layout' })
    await expect(content).toHaveAttribute('aria-selected', 'true')
    await expect(layout).toHaveAttribute('aria-selected', 'false')

    // A tab that controls nothing announces a state about no region. The panel
    // is one element either way, so both tabs point at it and it says which
    // tab it belongs to.
    const panel = page.getByRole('tabpanel')
    await expect(panel).toHaveCount(1)
    await expect(panel).toHaveAttribute('aria-labelledby', 'pane-tab-content')

    await layout.click()
    await expect(layout).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'pane-tab-layout')
  })

  for (const [path, trigger] of [
    ['/editor', 'Import'],
    ['/ats-check', 'Drop your resume here'],
  ] as const) {
    test(`${path} offers one named control for choosing a file`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('button', { name: trigger })).toHaveCount(1)

      // The input itself is plumbing behind that button. Announced as a second,
      // unnamed file control it is noise, and it is not another way in.
      const input = page.locator('input[type=file]')
      await expect(input).toHaveAttribute('aria-hidden', 'true')
      await expect(input).toHaveAttribute('tabindex', '-1')
    })
  }
})
