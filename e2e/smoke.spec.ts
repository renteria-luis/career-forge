import { expect, test } from '@playwright/test'

test.describe('pages render', () => {
  test('the home page states the thesis and routes into the editor', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('A resume is data')
    await page.getByRole('link', { name: 'Start writing' }).click()
    await expect(page).toHaveURL(/\/editor$/)
  })

  test('the home page links to the design system', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'The design system' }).click()
    await expect(page).toHaveURL(/\/design$/)
  })

  test('the design system page renders every token group', async ({ page }) => {
    await page.goto('/design')
    for (const heading of ['Type', 'Colour', 'Rhythm']) {
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible()
    }
  })
})

test.describe('quality floor', () => {
  test('the page never scrolls sideways', async ({ page }) => {
    // Horizontal overflow is the most common way a layout breaks on a phone,
    // and it is invisible on a desktop viewport.
    await page.goto('/design')
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })

  test('keyboard focus is visible', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const el = document.activeElement
      return el ? getComputedStyle(el).outlineStyle : 'none'
    })
    expect(outline).not.toBe('none')
  })

  test('there is exactly one h1', async ({ page }) => {
    await page.goto('/design')
    await expect(page.locator('h1')).toHaveCount(1)
  })

  test('nothing logs an error to the console', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/design')
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })
})
