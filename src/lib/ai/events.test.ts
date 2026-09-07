import { describe, expect, it } from 'vitest'
import { frame, readFrame } from './events'

/**
 * The wire between the route and the editor.
 *
 * Worth its own tests for one reason: a frame that fails to parse is silently
 * skipped, which is the right behaviour and also the kind that hides a bug
 * until somebody notices the button never finishes.
 */

describe('a frame survives the round trip', () => {
  it('reads back a result', () => {
    const written = frame('result', {
      fields: { kind: 'summary', summary: 'Ranking engineer.' },
    })

    expect(readFrame(written.trim())).toEqual({
      name: 'result',
      fields: { kind: 'summary', summary: 'Ranking engineer.' },
    })
  })

  it('reads back a failure and its retry', () => {
    const written = frame('error', { failure: 'rate-limited', retryAfterSeconds: 12 })

    expect(readFrame(written.trim())).toEqual({
      name: 'error',
      failure: 'rate-limited',
      retryAfterSeconds: 12,
    })
  })

  it('reads an event that carries nothing', () => {
    expect(readFrame(frame('ping', {}).trim())).toEqual({ name: 'ping' })
  })
})

describe('anything else is dropped rather than believed', () => {
  it.each([
    ['no event name', 'data: {}'],
    ['a name this version does not know', 'event: reticulate\ndata: {}'],
    ['data that is not JSON', 'event: ping\ndata: not json'],
    ['data that is not an object', 'event: ping\ndata: 12'],
    ['a failure that is not one of ours', 'event: error\ndata: {"failure":"gremlins"}'],
    ['fields that do not validate', 'event: result\ndata: {"fields":{"kind":"summary"}}'],
    [
      'a section we do not generate for',
      'event: result\ndata: {"fields":{"kind":"highlights","section":"education","index":0,"highlights":[]}}',
    ],
  ])('drops %s', (_name, chunk) => {
    expect(readFrame(chunk)).toBeNull()
  })
})
