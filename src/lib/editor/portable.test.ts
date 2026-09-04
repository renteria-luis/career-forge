import { describe, expect, it } from 'vitest'
import { fromPortableJson, toPortableJson } from './portable'
import { emptyDocument } from './starter'
import { sampleProfile } from '@/lib/resume/fixtures'

describe('portable resume files', () => {
  it('restores the profile and the layout it was saved with', () => {
    const document = { ...emptyDocument(), name: 'Tailored' }
    const restored = fromPortableJson(toPortableJson({ profile: sampleProfile, document }))

    expect(restored?.profile).toEqual(sampleProfile)
    expect(restored?.document).toEqual(document)
  })

  it('writes a file other JSON Resume tools can read', () => {
    const written = JSON.parse(
      toPortableJson({ profile: sampleProfile, document: emptyDocument() }),
    ) as Record<string, unknown>

    // The standard's fields at the top level, not nested under ours.
    expect(written.basics).toEqual(sampleProfile.basics)
    expect(written.work).toEqual(sampleProfile.work)
  })

  it('accepts a resume.json that carries no layout', () => {
    const restored = fromPortableJson(JSON.stringify({ basics: { name: 'Ana Ruiz' } }))

    expect(restored?.profile.basics?.name).toBe('Ana Ruiz')
    expect(restored?.document).toBeUndefined()
  })

  it('drops a layout that does not parse rather than failing the import', () => {
    const restored = fromPortableJson(
      JSON.stringify({ basics: { name: 'Ana Ruiz' }, careerForge: { document: { id: 7 } } }),
    )

    expect(restored?.profile.basics?.name).toBe('Ana Ruiz')
    expect(restored?.document).toBeUndefined()
  })

  it('refuses what is not a resume', () => {
    expect(fromPortableJson('not json')).toBeNull()
    expect(fromPortableJson('[]')).toBeNull()
    expect(fromPortableJson('null')).toBeNull()
    expect(fromPortableJson(JSON.stringify({ basics: { email: 'not-an-email' } }))).toBeNull()
  })
})
