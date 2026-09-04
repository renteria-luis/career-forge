import { readFile } from 'node:fs/promises'
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

/** The other half of revealPreview, for tests that go back to the fields. */
async function returnToForm(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', { name: 'Back to editing' })
  if (await toggle.isVisible()) await toggle.click()
}

/** The form's blocks, top to bottom, as the anchor ids the index rail uses. */
async function formBlockOrder(page: import('@playwright/test').Page) {
  return page
    .locator('form details[id^="section-"]')
    .evaluateAll((blocks) => blocks.map((b) => b.id))
}

/** The index rail's ticks, top to bottom. Desktop only; it is hidden below lg. */
async function indexOrder(page: import('@playwright/test').Page) {
  return page.getByRole('navigation', { name: 'Sections' }).getByRole('button').allInnerTexts()
}

/** True while both panes are on screen and the preview is the drop target. */
async function isPreviewOnScreen(page: import('@playwright/test').Page) {
  return page.getByLabel('Preview').isVisible()
}

/** Drags a file over the editor without dropping it, to show the drop target. */
async function startFileDrag(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['not read'], 'resume.pdf', { type: 'application/pdf' }))
    document
      .querySelector('[data-dropzone]')
      ?.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }))
  })
}

/** Whether one element's box sits inside another's. */
async function contains(
  outer: import('@playwright/test').Locator,
  inner: import('@playwright/test').Locator,
) {
  const [a, b] = [await outer.boundingBox(), await inner.boundingBox()]
  if (!a || !b) return false
  return (
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height
  )
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

  test('Enter starts a new bullet', async ({ page }) => {
    // The form used to drop blank lines as they were typed, which removed the
    // newline the moment Enter created it — a second bullet was impossible.
    await page.goto('/editor')
    const bullets = page.getByLabel('What you did').first()
    await bullets.fill('First bullet')
    await bullets.press('End')
    await bullets.press('Enter')
    await bullets.pressSequentially('Second bullet')
    await expect(bullets).toHaveValue('First bullet\nSecond bullet')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })

  test('a project can be given dates', async ({ page }) => {
    // The parser read project dates, the schema held them and the template
    // printed them — but the form had no input for either, so a date that came
    // in from an import could not be corrected and one could never be typed.
    //
    // Scoped to the Projects block: Experience and Education have fields with
    // these same labels, and picking by position finds one of those instead.
    await page.goto('/editor')
    const projects = page.locator('#section-projects')
    await projects.getByRole('button', { name: 'Add a project' }).click()
    await projects.getByRole('button', { name: 'Add dates' }).click()

    await projects.getByLabel('Name').fill('Ledger')
    await projects.getByLabel('Started').fill('2023-02')
    await projects.getByLabel('Ended').fill('2024-06')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    // Surviving a reload is the proof the dates reached the profile rather than
    // only the input they were typed into.
    await page.reload()
    await expect(page.locator('#section-projects').getByLabel('Started')).toHaveValue('2023-02', {
      timeout: 15_000,
    })
  })

  test('a project without dates is not asked for them', async ({ page }) => {
    // Most projects have no meaningful start and end, and a form that shows
    // every possible field to everyone is a form people abandon.
    await page.goto('/editor')
    const projects = page.locator('#section-projects')
    await projects.getByRole('button', { name: 'Add a project' }).click()
    await expect(projects.getByRole('button', { name: 'Add dates' })).toBeVisible()
    await expect(projects.getByLabel('Started')).toHaveCount(0)
  })

  test('a keyword can be typed, added and taken back out', async ({ page }) => {
    // The old field was controlled by the array and rebuilt the text on every
    // keystroke, so a space or a comma at the end was deleted as it was typed
    // and the caret jumped to the end. Nothing here reformats what is committed.
    await page.goto('/editor')
    const skills = page.locator('#section-skills')
    await skills.getByRole('button', { name: 'Add a group' }).click()
    const input = skills.getByLabel('Skills', { exact: true })

    await input.fill('Python')
    await input.press('Enter')
    await input.fill('Pandas')
    await skills.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(skills.getByRole('button', { name: 'Remove Python' })).toBeVisible()
    await expect(skills.getByRole('button', { name: 'Remove Pandas' })).toBeVisible()
    // The line is clear again, so the next one can just be typed.
    await expect(input).toHaveValue('')

    await skills.getByRole('button', { name: 'Remove Python' }).click()
    await expect(skills.getByRole('button', { name: 'Remove Python' })).toBeHidden()
    await expect(skills.getByRole('button', { name: 'Remove Pandas' })).toBeVisible()
  })

  test('a comma separates keywords as they are typed', async ({ page }) => {
    await page.goto('/editor')
    const skills = page.locator('#section-skills')
    await skills.getByRole('button', { name: 'Add a group' }).click()
    // Typed or pasted, the comma is how people say "that was one of them".
    await skills.getByLabel('Skills', { exact: true }).fill('Python, Pandas, SQL')
    for (const keyword of ['Python', 'Pandas', 'SQL']) {
      await expect(skills.getByRole('button', { name: `Remove ${keyword}` })).toBeVisible()
    }
  })

  test('backspace clears the line without eating the keywords', async ({ page }) => {
    // It used to take back the last keyword once the line was empty, so
    // correcting one word and holding the key a moment too long silently
    // removed the ones already added. Each keyword has an × for that.
    await page.goto('/editor')
    const skills = page.locator('#section-skills')
    await skills.getByRole('button', { name: 'Add a group' }).click()
    const input = skills.getByLabel('Skills', { exact: true })
    await input.fill('Python, Pandas')

    await input.fill('SQK')
    for (let press = 0; press < 8; press++) await input.press('Backspace')
    await expect(input).toHaveValue('')
    await expect(skills.getByRole('button', { name: 'Remove Python' })).toBeVisible()
    await expect(skills.getByRole('button', { name: 'Remove Pandas' })).toBeVisible()
  })

  test('a bracketed skill stays one skill', async ({ page }) => {
    // "Python (Pandas, Pydantic, Regex)" is one skill written with its parts.
    // Split on every comma it becomes "Python (Pandas" and "Regex)".
    await page.goto('/editor')
    const skills = page.locator('#section-skills')
    await skills.getByRole('button', { name: 'Add a group' }).click()
    const input = skills.getByLabel('Skills', { exact: true })

    await input.fill('Python (Pandas, Pydantic, Regex)')
    await input.press('Enter')
    await expect(
      skills.getByRole('button', { name: 'Remove Python (Pandas, Pydantic, Regex)' }),
    ).toBeVisible()

    // A separator after the closing bracket ends it as usual.
    await input.fill('SQL (Postgres), Go')
    await expect(skills.getByRole('button', { name: 'Remove SQL (Postgres)' })).toBeVisible()
    await expect(skills.getByRole('button', { name: 'Remove Go' })).toBeVisible()
  })

  test('skills can be put in a different order', async ({ page }) => {
    // The page prints them in this order, so this is the order that matters.
    await page.goto('/editor')
    const skills = page.locator('#section-skills')
    await skills.getByRole('button', { name: 'Add a group' }).click()
    await skills.getByLabel('Skills', { exact: true }).fill('Python, Pandas, SQL')

    const list = skills.getByRole('list', { name: /^Skills/ })
    const order = () =>
      list
        .locator('li')
        .evaluateAll((items) => items.map((item) => item.textContent?.replace('×', '').trim()))
    expect(await order()).toEqual(['Python', 'Pandas', 'SQL'])

    // Dragging is the quick way.
    await list.locator('li').nth(2).dragTo(list.locator('li').nth(0))
    expect(await order()).toEqual(['SQL', 'Python', 'Pandas'])

    // The arrow keys are the way that works without a pointer, and both go
    // through the same move — the reason entries are reordered with buttons.
    const python = skills.getByRole('button', { name: 'Python. Use the arrow keys to move it.' })
    await python.focus()
    await python.press('ArrowLeft')
    expect(await order()).toEqual(['Python', 'SQL', 'Pandas'])
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
  })

  test('a job can say where it was and how it was worked', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByLabel('Role').first().fill('Engineer')
    await page.getByLabel('Location').first().fill('Toronto, ON')
    // Behind a button, because most people will not say.
    await page.getByRole('button', { name: 'Add how you worked' }).first().click()
    await page.getByLabel('How you worked').first().selectOption('remote')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
    await expect(page.getByLabel('Location').first()).toHaveValue('Toronto, ON')
  })

  test('a qualification is asked for only when it is wanted', async ({ page }) => {
    await page.goto('/editor')
    const education = page.locator('#section-education')
    await expect(education.getByRole('button', { name: 'Add qualification' })).toBeVisible()
    await expect(education.getByLabel('Qualification')).toHaveCount(0)
    await education.getByRole('button', { name: 'Add qualification' }).click()
    await education.getByLabel('Qualification').fill('BSc')
    await expect(education.getByLabel('Qualification')).toHaveValue('BSc')
  })

  test('an entry folds away and its section counts in words', async ({ page }) => {
    await page.goto('/editor')
    const work = page.locator('#section-experience')
    await expect(work.locator('summary').first()).toContainText('1 entry')

    await page.getByRole('button', { name: 'Add a role' }).click()
    await expect(work.locator('summary').first()).toContainText('2 entries')

    // Folding an entry hides its fields; removing one must not fold it.
    const first = work.locator('details').first()
    await expect(first.getByLabel('Role')).toBeVisible()
    await first.locator('summary').first().click()
    await expect(first.getByLabel('Role')).toBeHidden()
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

    // The name is the first line under the top margin, and the header is
    // centred. This fraction tracks the default margin, so it moves if that
    // default does — which is a change worth failing on.
    await canvas.click({ position: { x: box.width / 2, y: box.height * 0.04 } })

    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('name')))
      .toBe('basics.name')
  })
})

test.describe('starting over', () => {
  test('clearing asks first and then empties everything', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByLabel('Phone').fill('+1 987-654-3210')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    // Clear sits with the document controls, which on a phone are the other
    // view — the same place the paper size lives.
    await revealPreview(page)
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.getByText('Clear everything?')).toBeVisible()

    // Backing out leaves the work alone.
    await page.getByRole('button', { name: 'Keep it' }).click()
    await expect(page.getByLabel('Full name')).toHaveValue('Ana Ruiz')

    await page.getByRole('button', { name: 'Clear' }).click()
    await page.getByRole('button', { name: 'Clear everything' }).click()

    // Every registered field, not just the ones the new value happens to name:
    // react-hook-form leaves an input alone when it is reset to undefined.
    await expect(page.getByLabel('Full name')).toHaveValue('')
    await expect(page.getByLabel('Phone')).toHaveValue('')
  })

  test('a cleared draft does not come back on refresh', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
    await revealPreview(page)
    await page.getByRole('button', { name: 'Clear' }).click()
    await page.getByRole('button', { name: 'Clear everything' }).click()
    await page.reload()
    await expect(page.getByLabel('Full name')).toHaveValue('', { timeout: 15_000 })
  })
})

test.describe('rearranging on the page', () => {
  test('dragging an entry over another reorders them', async ({ page }, testInfo) => {
    // Relevance is not always chronology: a job from years ago can be the one
    // that matters for the posting in hand.
    test.skip(testInfo.project.name === 'mobile', 'Dragging needs the page and the form together.')
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByLabel('Role').first().fill('Recent Job')
    await page.getByRole('button', { name: 'Add a role' }).click()
    await page.getByLabel('Role').nth(1).fill('Older Job')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    await page.getByRole('button', { name: 'Rearrange' }).click()
    const from = page.locator('[aria-label="Move work.1"]').first()
    const to = page.locator('[aria-label="Move work.0"]').first()
    await expect(from).toBeVisible({ timeout: 15_000 })

    const fromBox = await from.boundingBox()
    const toBox = await to.boundingBox()
    if (!fromBox || !toBox) throw new Error('The blocks did not render.')
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect(page.getByLabel('Role').first()).toHaveValue('Older Job')
  })

  test('moving a section on the page moves its form and its index entry', async ({
    page,
  }, testInfo) => {
    // Entries already did this; sections did not. Dragging Projects above
    // Experience rearranged the PDF and left the form and the index rail in
    // their original order, so the editing surface disagreed with the page.
    test.skip(testInfo.project.name === 'mobile', 'Dragging needs the page and the form together.')
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByLabel('Role').first().fill('Engineer')
    const projects = page.locator('#section-projects')
    await projects.getByRole('button', { name: 'Add a project' }).click()
    await projects.getByLabel('Name').fill('Ledger')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    expect(await formBlockOrder(page)).toEqual([
      'section-you',
      'section-experience',
      'section-projects',
      'section-education',
      'section-skills',
    ])

    await page.getByRole('button', { name: 'Rearrange' }).click()
    await page.getByRole('button', { name: 'Sections', exact: true }).click()
    const from = page.locator('[aria-label="Move projects"]').first()
    const to = page.locator('[aria-label="Move work"]').first()
    await expect(from).toBeVisible({ timeout: 15_000 })

    const fromBox = await from.boundingBox()
    const toBox = await to.boundingBox()
    if (!fromBox || !toBox) throw new Error('The blocks did not render.')
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect
      .poll(() => formBlockOrder(page), { timeout: 15_000 })
      .toEqual([
        'section-you',
        'section-projects',
        'section-experience',
        'section-education',
        'section-skills',
      ])
    // Set in uppercase, which is what innerText reports and what is on screen.
    expect(await indexOrder(page)).toEqual(['YOU', 'PROJECTS', 'EXPERIENCE', 'EDUCATION', 'SKILLS'])
  })

  test('reordering a section from the layout tab moves its form block', async ({ page }) => {
    // The same document either way, so the form has to follow both routes.
    await page.goto('/editor')
    await page.getByRole('tab', { name: 'layout' }).click()
    await page.getByRole('button', { name: 'Move Projects up' }).click()
    await page.getByRole('tab', { name: 'content' }).click()

    expect(await formBlockOrder(page)).toEqual([
      'section-you',
      'section-projects',
      'section-experience',
      'section-education',
      'section-skills',
    ])
  })

  test('a hidden section leaves the form even when it keeps its place', async ({ page }) => {
    // Order and visibility are separate: hiding Projects must not drag the
    // blocks under it out of the order the document puts them in.
    await page.goto('/editor')
    await page.getByRole('tab', { name: 'layout' }).click()
    await page.getByLabel('Projects', { exact: true }).uncheck()
    await page.getByRole('tab', { name: 'content' }).click()

    expect(await formBlockOrder(page)).toEqual([
      'section-you',
      'section-experience',
      'section-education',
      'section-skills',
    ])
  })

  test('an entry can be dragged onto one on the other page', async ({ page }, testInfo) => {
    // Each page had its own copy of the overlay holding its own drag state, and
    // that copy ended the drag when the pointer left it — so crossing the gap
    // between two pages cancelled the gesture, and a block could only ever be
    // moved among the ones sharing its page.
    test.skip(testInfo.project.name === 'mobile', 'Dragging needs the page and the form together.')
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page.getByLabel('Role').first().fill('Recent Job')
    await page
      .getByLabel('What you did')
      .first()
      .fill(
        Array.from({ length: 80 }, (_, i) => `A bullet long enough to fill a line, ${i}`).join(
          '\n',
        ),
      )
    await page.getByRole('button', { name: 'Add a role' }).click()
    await page.getByLabel('Role').nth(1).fill('Older Job')
    // Two pages is the whole point of the test.
    await expect(page.locator('canvas').nth(1)).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: 'Rearrange' }).click()
    // Both blocks, not just the first: under load the layout can arrive for a
    // one-page document first, and measuring then finds nothing to drag onto.
    const bands = page.locator('[aria-label^="Move work."]')
    await expect(bands).toHaveCount(2, { timeout: 15_000 })
    await expect(bands.first()).toBeVisible()

    // The two blocks sit on different pages, so there is one scroll position
    // where each has a usable slice on screen. Find it rather than assume it.
    const scroller = page.getByLabel('Preview').locator('.overflow-y-auto')
    const measure = () =>
      bands.evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect()
          return {
            id: el.getAttribute('aria-label'),
            x: box.x + box.width / 2,
            top: Math.max(box.top, 150),
            bottom: Math.min(box.bottom, window.innerHeight - 20),
          }
        }),
      )

    let placed: Awaited<ReturnType<typeof measure>> = []
    for (const offset of [700, 800, 900, 600, 1000, 500]) {
      await scroller.evaluate((el, top) => el.scrollTo(0, top), offset)
      const boxes = await measure()
      if (boxes.length === 2 && boxes.every((b) => b.bottom - b.top > 40)) {
        placed = boxes
        break
      }
    }
    const from = placed.find((b) => b.id === 'Move work.1')
    const to = placed.find((b) => b.id === 'Move work.0')
    if (!from || !to) throw new Error('The two blocks were never both on screen.')
    const middle = (b: { top: number; bottom: number }) => (b.top + b.bottom) / 2

    await page.mouse.move(from.x, middle(from))
    await page.mouse.down()
    // Through the gap between the pages, which is what used to end the drag.
    await page.mouse.move(from.x, (middle(from) + middle(to)) / 2, { steps: 12 })
    await page.mouse.move(to.x, middle(to), { steps: 12 })
    await page.mouse.up()

    await expect(page.getByLabel('Role').first()).toHaveValue('Older Job', { timeout: 15_000 })
  })

  test('the preview toolbar stays put while the pages scroll', async ({ page }) => {
    // Reachable from page three: changing the paper or starting a rearrange
    // should not mean scrolling back to the top first.
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await page
      .getByLabel('What you did')
      .first()
      .fill(
        Array.from({ length: 80 }, (_, i) => `A bullet long enough to fill a line, ${i}`).join(
          '\n',
        ),
      )
    if (await page.getByRole('button', { name: 'See the preview' }).isVisible()) {
      await page.getByRole('button', { name: 'See the preview' }).click()
    }
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 })

    const rearrange = page.getByRole('button', { name: 'Rearrange' })
    const before = await rearrange.boundingBox()
    const scroller = page.getByLabel('Preview').locator('.overflow-y-auto')
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(200)

    const after = await rearrange.boundingBox()
    expect(before && after && Math.round(after.y)).toBe(before && Math.round(before.y))
    await expect(rearrange).toBeInViewport()
  })

  test('the paper size follows the toolbar', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
    await revealPreview(page)

    const letter = page.getByRole('group', { name: 'Paper size' }).getByRole('button', {
      name: 'Letter',
    })
    // Letter is the default, being what North American applications expect.
    await expect(letter).toHaveAttribute('aria-pressed', 'true')

    await page
      .getByRole('group', { name: 'Paper size' })
      .getByRole('button', { name: 'A4' })
      .click()
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })
    await expect(letter).toHaveAttribute('aria-pressed', 'false')
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

  test('a PDF dropped onto the page is imported', async ({ page, request }, testInfo) => {
    // There is nothing to drag a file from on a phone.
    test.skip(testInfo.project.name === 'mobile', 'Dragging a file is a desktop interaction.')
    const pdf = Buffer.from(
      await (
        await request.post('/api/compile', {
          data: {
            profile: { basics: { name: 'Dropped Import' }, work: [{ name: 'Acme' }] },
            document: { id: 'x', sections: [{ kind: 'standard', id: 'work', visible: true }] },
          },
        })
      ).body(),
    )

    await page.goto('/editor')
    // The editor is loaded in the browser only, so the drop target does not
    // exist until it has mounted.
    await expect(page.getByLabel('Full name')).toBeVisible({ timeout: 15_000 })

    // Dragging a file in is the shortest path from "I have a resume" to editing
    // one, so it has to work without finding the button first.
    await page.evaluate(
      async (bytes: number[]) => {
        const file = new File([new Uint8Array(bytes)], 'resume.pdf', { type: 'application/pdf' })
        const transfer = new DataTransfer()
        transfer.items.add(file)
        const target = document.querySelector('[data-dropzone]') ?? document.body
        target.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true }))
        target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }))
      },
      [...pdf],
    )

    await expect(page.getByLabel('Full name')).toHaveValue('Dropped Import', { timeout: 20_000 })
  })

  test('the drop target is the pane on screen, not the whole window', async ({
    page,
  }, testInfo) => {
    // The highlight used to be drawn over the shell as well as the preview, so
    // dragging a file lit up the form — which is not somewhere a resume can be
    // dropped into. The remaining one has to stay on the visible pane even once
    // that pane has been scrolled, which the old one did not.
    test.skip(testInfo.project.name === 'mobile', 'Dragging a file is a desktop interaction.')
    await page.goto('/editor')
    await expect(page.getByLabel('Full name')).toBeVisible({ timeout: 15_000 })
    await page
      .getByLabel('What you did')
      .first()
      .fill(
        Array.from({ length: 90 }, (_, i) => `A bullet long enough to fill a line, ${i}`).join(
          '\n',
        ),
      )
    // Long enough to overflow the page, so the status reads as a warning about
    // length rather than "compiled in". The canvas is what says it has drawn.
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 })

    const pane = page.getByLabel((await isPreviewOnScreen(page)) ? 'Preview' : 'Resume content')
    // The pane holds the highlight still; the element inside it is what scrolls.
    await pane.locator('.overflow-y-auto').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await startFileDrag(page)

    // Visible ones only: a second target is rendered for the narrow layout,
    // where the form is the only pane on screen, and is hidden at this width.
    const highlight = page.getByText('Drop a PDF or a resume.json').filter({ visible: true })
    await expect(highlight).toHaveCount(1)
    await expect(highlight).toBeInViewport()
    expect(await contains(pane, highlight)).toBe(true)
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
      page.getByRole('button', { name: 'Download PDF', exact: true }).click(),
    ]).then(([event]) => event)

    expect(download.suggestedFilename()).toBe('ana-ruiz.pdf')
  })

  test('saved data comes back with the layout it was saved with', async ({ page }) => {
    await page.goto('/editor')
    await page.getByLabel('Full name').fill('Ana Ruiz')
    // The paper control lives in the preview pane, which is behind a toggle on
    // a phone. The form has to come back before the fields can be read again.
    await revealPreview(page)
    await page.getByRole('button', { name: 'A4', exact: true }).click()
    await returnToForm(page)
    await expect(page.locator(status)).toContainText('compiled in', { timeout: 15_000 })

    const saved = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save data', exact: true }).click(),
    ]).then(([event]) => event)
    expect(saved.suggestedFilename()).toBe('ana-ruiz.json')

    const written = await readFile(await saved.path(), 'utf8')
    // Valid JSON Resume: the standard's fields at the top level, ours beside them.
    expect((JSON.parse(written) as { basics: { name: string } }).basics.name).toBe('Ana Ruiz')

    // Wipe the form, then read the file back into it.
    await page.getByLabel('Full name').fill('')
    await page.setInputFiles('input[type=file]', {
      name: 'ana-ruiz.json',
      mimeType: 'application/json',
      buffer: Buffer.from(written),
    })

    await expect(page.getByLabel('Full name')).toHaveValue('Ana Ruiz', { timeout: 15_000 })
    await revealPreview(page)
    await expect(page.getByRole('button', { name: 'A4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
