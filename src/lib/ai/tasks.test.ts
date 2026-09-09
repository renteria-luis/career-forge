import { describe, expect, it } from 'vitest'
import { sampleProfile } from '@/lib/resume/fixtures'
import type { Profile } from '@/lib/resume/profile'
import { buildRequest, generationTask, type Brief } from './tasks'

const noBrief: Brief = { notes: {}, target: {} }

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
    const request = buildRequest(sampleProfile, noBrief, { kind: 'summary' })

    expect(request).not.toBeNull()
    expect(request?.user).toContain('Senior ML Engineer')
    expect(request?.user).toContain('Nomad Analytics')
    expect(request?.user).toContain('2023-02 to now (current)')
    expect(request?.system).toContain('Never invent an employer')
  })

  it('leaves out the contact details that steer nothing', () => {
    const request = buildRequest(sampleProfile, noBrief, { kind: 'summary' })

    expect(request?.user).not.toContain('+51 999 888 777')
    expect(request?.user).not.toContain('ana@example.com')
  })

  it('marks the entry whose bullets were asked for', () => {
    const request = buildRequest(sampleProfile, noBrief, {
      kind: 'highlights',
      section: 'work',
      index: 1,
    })

    expect(request?.user).toContain('FOCUS ENTRY:')
    expect(request?.user).toContain('Retail Grid')
  })

  it('is null for an entry that is not there', () => {
    expect(
      buildRequest(sampleProfile, noBrief, { kind: 'highlights', section: 'work', index: 9 }),
    ).toBeNull()
    expect(
      buildRequest({}, noBrief, { kind: 'highlights', section: 'projects', index: 0 }),
    ).toBeNull()
  })
})

describe('the job being aimed at reaches the prompt', () => {
  it('names the role and the company when the brief has them', () => {
    const request = buildRequest(
      sampleProfile,
      { notes: {}, target: { role: 'Staff ML Engineer', company: 'Nomad Analytics' } },
      { kind: 'summary' },
    )

    expect(request?.user).toContain('Staff ML Engineer')
    expect(request?.user).toContain('Nomad Analytics')
  })
})

describe('tailoring needs an advert to aim at', () => {
  it('is null without one, because there is nothing to tailor to', () => {
    expect(buildRequest(sampleProfile, noBrief, { kind: 'tailor' })).toBeNull()
  })

  it('carries the advert, the raw material and numbered entries', () => {
    const request = buildRequest(
      sampleProfile,
      {
        notes: { notes: 'Cut a 240ms query to 45ms with a new index.' },
        target: { posting: 'We are hiring a Staff ML Engineer to own ranking.' },
      },
      { kind: 'tailor' },
    )

    expect(request?.user).toContain('own ranking')
    expect(request?.user).toContain('RAW MATERIAL')
    expect(request?.user).toContain('Cut a 240ms query to 45ms')
    // The indices are the handle the reply comes back with, so they have to be
    // in what the model was shown.
    expect(request?.user).toContain('[work 0]')
    expect(request?.user).toContain('[skill 0]')
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

    const request = buildRequest(profile, noBrief, { kind: 'summary' })

    expect(request?.user).toContain('Employer 7')
    expect(request?.user).not.toContain('Employer 8')
    expect(request?.user).toContain('Bullet 0-7')
    expect(request?.user).not.toContain('Bullet 0-8')
  })
})

describe('the boundary bounds what may be asked', () => {
  it('refuses an entry index no resume could reach', () => {
    expect(
      generationTask.safeParse({ kind: 'highlights', section: 'work', index: 500 }).success,
    ).toBe(false)
  })

  it('refuses a section it does not generate for', () => {
    expect(
      generationTask.safeParse({ kind: 'highlights', section: 'education', index: 0 }).success,
    ).toBe(false)
  })
})
