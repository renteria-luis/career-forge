import { expect } from '@playwright/test'
import { signedIn, test } from './accounts'

/**
 * Drafting a field with a model, from the editor.
 *
 * The seam's own tests cover what it decides. What is only true here is the
 * wiring: that the control knows whether it can be used, that the request
 * carries the session, that the event stream is read, and that a refusal from
 * the far end arrives as a sentence rather than as a button that does nothing.
 *
 * No key is configured for this suite, so the far end refuses. That is the
 * useful case to run every time: it exercises the whole path — consent, POST,
 * stream, failure event, message — without spending anything, and it is the
 * exact state a fresh deployment is in before somebody sets the key.
 */

test.describe('drafting', () => {
  test('offers a way in rather than a dead button when signed out', async ({ page }) => {
    await page.goto('/editor')

    const link = page.getByRole('link', { name: 'Sign in to draft this with AI' }).first()
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('says what is sent before it sends it, and once', async ({ page }) => {
    await signedIn(page, 'Grace Hopper')
    await page.goto('/editor')

    const draft = page.getByRole('button', { name: 'Draft a summary' })
    await expect(draft).toBeVisible()
    await draft.click()

    // Nothing has left the browser yet: the dialog is the disclosure, and it
    // says who receives the resume before anybody receives it.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Anthropic')
    await expect(dialog).toContainText('may not train')
    await dialog.getByRole('button', { name: 'Send it' }).click()

    // No key is configured here, so the seam answers that the feature is off —
    // through the stream, as an event, and the control turns it into a sentence.
    await expect(page.getByText('Drafting is switched off here.')).toBeVisible()

    // Asked once per browser. The second attempt goes straight through.
    await draft.click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Drafting is switched off here.')).toBeVisible()
  })
})
