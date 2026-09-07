import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDraft, saveDraft, serializeDraft } from './draft'
import { emptyDocument } from './starter'

/**
 * What comes back out of storage.
 *
 * Storage is hand-editable, survives across versions of this app, and holds the
 * only copy of somebody's resume. The case that matters is not a clean round
 * trip; it is a draft written by an older version, which has to open rather
 * than be dropped and then saved over.
 */

function withStorage(seed?: string) {
  const store = new Map<string, string>()
  if (seed !== undefined) store.set('career-forge:draft:v1', seed)
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  })
  return store
}

afterEach(() => vi.unstubAllGlobals())

const profile = { basics: { name: 'Ana Ruiz' } }

describe('a draft survives the round trip', () => {
  it('comes back with the brief it was saved with', () => {
    withStorage()
    saveDraft(
      serializeDraft({
        profile,
        document: emptyDocument(),
        notes: { notes: 'Shipped the thing.', voice: 'Plain.' },
        target: { company: 'Nomad Analytics' },
      }),
    )

    const restored = loadDraft()
    expect(restored?.notes).toEqual({ notes: 'Shipped the thing.', voice: 'Plain.' })
    expect(restored?.target.company).toBe('Nomad Analytics')
  })
})

describe('a draft from before the brief existed still opens', () => {
  it('keeps the resume and starts the brief empty', () => {
    withStorage(JSON.stringify({ profile, document: emptyDocument() }))

    const restored = loadDraft()
    expect(restored?.profile.basics?.name).toBe('Ana Ruiz')
    expect(restored?.notes).toEqual({})
    expect(restored?.target).toEqual({})
  })

  it('keeps the resume even when the brief is nonsense', () => {
    withStorage(
      JSON.stringify({ profile, document: emptyDocument(), notes: 'a string', target: 42 }),
    )

    const restored = loadDraft()
    expect(restored?.profile.basics?.name).toBe('Ana Ruiz')
    expect(restored?.notes).toEqual({})
  })
})

describe('a draft that is not a resume is not opened', () => {
  it.each([['not json'], [JSON.stringify({ profile: { work: 'no' } })], [JSON.stringify(null)]])(
    'returns nothing for %o',
    (seed) => {
      withStorage(seed)
      expect(loadDraft()).toBeUndefined()
    },
  )
})
