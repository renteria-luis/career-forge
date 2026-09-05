import { expect, test } from '@playwright/test'

test.describe('pages render', () => {
  test('the home page states the thesis and routes into the editor', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Build your resume')
    await page.getByRole('link', { name: 'Start writing' }).click()
    await expect(page).toHaveURL(/\/editor$/)
  })

  test('the home page shows the same resume read both ways', async ({ page }) => {
    await page.goto('/')

    // The signature of the page, and the product's whole argument: the left
    // column is what a person reads and the right is what a parser filed.
    const sheet = page.getByText('What a person reads')
    const record = page.getByText('What a parser keeps')
    await expect(sheet).toBeVisible()
    await expect(record).toBeVisible()

    // The field paths are the ones the editor really computes, so a path that
    // drifted out of the index would show as unfiled rather than silently pass.
    await expect(page.getByText('basics.name', { exact: true })).toBeVisible()
    await expect(page.getByText('work.0.position', { exact: true })).toBeVisible()

    // A section heading is typography. Nothing crosses, and saying so is the
    // reason the comparison is worth showing at all.
    await expect(page.getByText('nothing is filed').first()).toBeVisible()
  })

  test('the two ways in go to different places', async ({ page }) => {
    await page.goto('/')

    // There is one route to each thing and no more. Two links to the editor
    // used to sit side by side with the same href, and a second route to the
    // checker sat in a header nav above them.
    await expect(page.getByRole('link', { name: /editor|start writing/i })).toHaveCount(1)
    await expect(page.getByRole('link', { name: /ATS|check/i })).toHaveCount(1)

    await page.getByRole('link', { name: /Drop a PDF/ }).click()
    await expect(page).toHaveURL(/\/ats-check$/)
  })

  test('the explanation is one link away, not in the way', async ({ page }) => {
    await page.goto('/')

    // Everything that explains the product moved off the pages people arrive
    // to use. What is left on the home page is a title, two routes and the
    // demonstration; the prose is here.
    await page.getByRole('link', { name: 'How it works' }).click()
    await expect(page).toHaveURL(/\/how-it-works$/)

    for (const heading of [
      'The PDF is a build, not a file you edit',
      'The reading is rules, not a model',
      'What happens to your data',
      'Questions',
    ]) {
      await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible()
    }
    await expect(page.getByText('What is an applicant tracking system?')).toBeVisible()
  })

  test('the design system is linked from how it works', async ({ page }) => {
    await page.goto('/how-it-works')
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
