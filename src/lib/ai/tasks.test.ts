import { describe, expect, it } from 'vitest'
import { sampleProfile } from '@/lib/resume/fixtures'
import type { Profile } from '@/lib/resume/profile'
import { buildRequest, generationTask } from './tasks'

/**
 * What the model is told.
 *
 * The prompt is the only thing standing between a generated bullet and an
 * invented one, so the facts it is grounded in are worth asserting: a request
 * that quietly stopped carrying the work history would still return plausible
 * sentences, and nothing else in the system would notice.
 */

describe('the request carries the facts and nothing else', () => {
  it('grounds a summary in the work history', () => {
    const request = buildRequest(sampleProfile, { kind: 'summary' })

    expect(request).not.toBeNull()
    expect(request?.user).toContain('Senior ML Engineer')
    expect(request?.user).toContain('Nomad Analytics')
    expect(request?.user).toContain('2023-02 to now (current)')
    expect(request?.system).toContain('Never invent an employer')
  })

  it('leaves out the contact details that steer nothing', () => {
    const request = buildRequest(sampleProfile, { kind: 'summary' })

    expect(request?.user).not.toContain('+51 999 888 777')
    expect(request?.user).not.toContain('ana@example.com')
  })

  it('marks the entry whose bullets were asked for', () => {
    const request = buildRequest(sampleProfile, {
      kind: 'highlights',
      section: 'work',
      index: 1,
    })

    expect(request?.user).toContain('FOCUS ENTRY:')
    expect(request?.user).toContain('Retail Grid')
  })

  it('is null for an entry that is not there', () => {
    expect(
      buildRequest(sampleProfile, { kind: 'highlights', section: 'work', index: 9 }),
    ).toBeNull()
    expect(buildRequest({}, { kind: 'highlights', section: 'projects', index: 0 })).toBeNull()
  })
})

describe('a target steers wording and cannot add content', () => {
  it('says plainly that an unsupported term must not appear', () => {
    const request = buildRequest(sampleProfile, {
      kind: 'summary',
      target: { role: 'Staff ML Engineer', keywords: ['Kubernetes', 'Ray'] },
    })

    expect(request?.user).toContain('Staff ML Engineer')
    expect(request?.user).toContain('Kubernetes, Ray')
    expect(request?.user).toContain('must not appear')
  })
})

describe('a long profile is trimmed rather than refused', () => {
  it('sends at most eight jobs and eight bullets from each', () => {
    const profile: Profile = {
      work: Array.from({ length: 20 }, (_, index) => ({
        name: `Employer ${index}`,
        position: 'Engineer',
        startDate: '2020',
        highlights: Array.from({ length: 20 }, (_, bullet) => `Bullet ${index}-${bullet}`),
      })),
    }

    const request = buildRequest(profile, { kind: 'summary' })

    expect(request?.user).toContain('Employer 7')
    expect(request?.user).not.toContain('Employer 8')
    expect(request?.user).toContain('Bullet 0-7')
    expect(request?.user).not.toContain('Bullet 0-8')
  })
})

describe('the boundary bounds what may be asked', () => {
  it('refuses a pasted job advert in place of a role', () => {
    const result = generationTask.safeParse({
      kind: 'summary',
      target: { role: 'x'.repeat(500) },
    })

    expect(result.success).toBe(false)
  })

  it('refuses an unbounded keyword list', () => {
    const result = generationTask.safeParse({
      kind: 'summary',
      target: { keywords: Array.from({ length: 50 }, () => 'python') },
    })

    expect(result.success).toBe(false)
  })

  it('refuses a section it does not generate for', () => {
    expect(
      generationTask.safeParse({ kind: 'highlights', section: 'education', index: 0 }).success,
    ).toBe(false)
  })
})
