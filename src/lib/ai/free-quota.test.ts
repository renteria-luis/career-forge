import { afterEach, describe, expect, it } from 'vitest'
import {
  FREE_MODELS,
  PER_MODEL_PER_DAY,
  nextModel,
  recordExhausted,
  recordRequest,
  remaining,
  resetFreeQuota,
  usage,
} from './free-quota'

/**
 * The free provider's day.
 *
 * Worth its own tests because every number here was measured off a refusal
 * rather than read in documentation, and because the failure it prevents is
 * silent: a button that works twenty times and then stops.
 */

afterEach(() => resetFreeQuota())

/** Noon in Los Angeles, so a day boundary cannot be crossed mid-test. */
const NOON = Date.UTC(2026, 8, 11, 19)

describe('a model is used until its day runs out', () => {
  it('starts on the first and stays there', () => {
    expect(nextModel(NOON)).toBe(FREE_MODELS[0])
    recordRequest(FREE_MODELS[0], NOON)
    expect(nextModel(NOON)).toBe(FREE_MODELS[0])
  })

  it('moves on once the count reaches the allowance', () => {
    for (let n = 0; n < PER_MODEL_PER_DAY; n += 1) recordRequest(FREE_MODELS[0], NOON)
    expect(nextModel(NOON)).toBe(FREE_MODELS[1])
  })

  it('moves on the moment the provider itself refuses, whatever we counted', () => {
    // Its refusal is the authority; the tally here is a guess that starts at
    // zero after every deploy.
    recordExhausted(FREE_MODELS[0], NOON)
    expect(nextModel(NOON)).toBe(FREE_MODELS[1])
    expect(usage(NOON)[0]?.used).toBe(PER_MODEL_PER_DAY)
  })

  it('has nothing left when every model has refused', () => {
    for (const model of FREE_MODELS) recordExhausted(model, NOON)
    expect(nextModel(NOON)).toBeNull()
    expect(remaining(NOON)).toEqual({
      used: FREE_MODELS.length * PER_MODEL_PER_DAY,
      limit: FREE_MODELS.length * PER_MODEL_PER_DAY,
    })
  })
})

describe('the day belongs to the provider, not to us', () => {
  it('carries the tally across a local midnight', () => {
    // 03:00 UTC is still the previous afternoon in Los Angeles, which is where
    // the allowance turns over. A tally that reset at local midnight would hand
    // back an allowance that is not there.
    const lateUtc = Date.UTC(2026, 8, 12, 3)
    recordRequest(FREE_MODELS[0], NOON)
    expect(usage(lateUtc)[0]?.used).toBe(1)
  })

  it('starts again once that day has turned over', () => {
    recordExhausted(FREE_MODELS[0], NOON)
    const nextDay = Date.UTC(2026, 8, 12, 19)
    expect(usage(nextDay)[0]?.used).toBe(0)
    expect(nextModel(nextDay)).toBe(FREE_MODELS[0])
  })
})
