import { describe, expect, it } from 'vitest'
import { waitSecondsFrom } from './gemini'

/**
 * How long the free provider says to wait.
 *
 * Read out of the message because that is where it is: the quota error carries
 * the delay in its text and the SDK surfaces the message rather than the
 * structured field beside it. Worth a test precisely because it is a regular
 * expression over somebody else's prose — the day that sentence is reworded,
 * this is what says so.
 */
describe('the wait the provider names', () => {
  it('reads the delay out of a real quota message', () => {
    const message =
      'You exceeded your current quota, please check your plan and billing details. ' +
      'Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, ' +
      'model: gemini-3.5-flash Please retry in 45.701810252s.'

    // Rounded up: telling somebody 45 when it is 45.7 sends them back one second early.
    expect(waitSecondsFrom(message)).toBe(46)
  })

  it.each([
    ['a message with no delay in it', 'Resource has been exhausted.'],
    ['an empty message', ''],
    ['a delay that is not a number', 'Please retry in soons.'],
  ])('falls back to the length of the window for %s', (_name, message) => {
    // The allowance runs by the minute, so a minute is the honest guess.
    expect(waitSecondsFrom(message)).toBe(60)
  })
})
