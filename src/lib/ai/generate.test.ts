import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleProfile } from '@/lib/resume/fixtures'
import type { Profile } from '@/lib/resume/profile'
import { generateFields, mayUseFreeModel, resetGenerationState, routeTo } from './generate'
import { resetModelClients, type ModelClient, type ModelRequest, type ModelResult } from './model'
import type { GenerationTask } from './tasks'

/**
 * The seam, against a fake transport.
 *
 * Every rule the seam exists to enforce is asserted here, because the seam is
 * the only thing enforcing them: a rule that lives in a prompt is a suggestion,
 * and a rule that lives in a route is one somebody adds a second route past.
 */

const verified = { id: 'acct_1', email: 'ada@example.com', emailVerified: true }
const usage = { input: 900, output: 120, thinking: 40 }

/** A transport that answers with `text` and remembers what it was asked. */
function replying(text: string) {
  const requests: ModelRequest[] = []
  const client: ModelClient = {
    async send(request) {
      requests.push(request)
      return { ok: true, reply: { text, stopReason: 'end_turn', usage } }
    },
  }
  return { client, requests }
}

function failing(result: ModelResult) {
  let calls = 0
  const client: ModelClient = {
    async send() {
      calls += 1
      return result
    },
  }
  return { client, calls: () => calls }
}

/** A transport that never answers, so a call can be left in flight. */
function hanging() {
  const client: ModelClient = {
    send: () => new Promise<ModelResult>(() => {}),
  }
  return client
}

const summaryTask: GenerationTask = { kind: 'summary' }
const highlightsTask: GenerationTask = { kind: 'highlights', section: 'work', index: 0 }

let info: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetGenerationState()
  resetModelClients()
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('an account has to be confirmed before it can spend', () => {
  it('refuses an unverified account without asking the model', async () => {
    const { client, calls } = failing({ ok: false, failure: 'unavailable' })
    const result = await generateFields(
      { profile: sampleProfile, task: summaryTask },
      { id: 'acct_2', email: 'grace@example.com', emailVerified: false },
      { client },
    )

    expect(result).toEqual({ ok: false, failure: 'unverified' })
    expect(calls()).toBe(0)
  })

  it('says the feature is off when no key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', '')
    const result = await generateFields({ profile: sampleProfile, task: summaryTask }, verified, {
      client: null,
    })

    expect(result).toEqual({ ok: false, failure: 'not-configured' })
    vi.unstubAllEnvs()
  })
})

describe('the reply becomes fields, or it becomes nothing', () => {
  it('returns a summary the profile schema accepts, trimmed', async () => {
    const { client } = replying(JSON.stringify({ summary: '  Ranking engineer.  ' }))
    const result = await generateFields({ profile: sampleProfile, task: summaryTask }, verified, {
      client,
    })

    expect(result).toEqual({
      ok: true,
      fields: { kind: 'summary', summary: 'Ranking engineer.' },
      usage,
    })
  })

  it('returns highlights, trimmed, with the blanks dropped', async () => {
    const { client } = replying(
      JSON.stringify({ highlights: ['  Cut latency to 45ms. ', '   ', 'Owned the rotation.'] }),
    )
    const result = await generateFields(
      { profile: sampleProfile, task: highlightsTask },
      verified,
      { client },
    )

    expect(result).toEqual({
      ok: true,
      fields: {
        kind: 'highlights',
        section: 'work',
        index: 0,
        highlights: ['Cut latency to 45ms.', 'Owned the rotation.'],
      },
      usage,
    })
  })

  it.each([
    ['text that is not JSON', 'I would be happy to help with that!'],
    ['the wrong shape', JSON.stringify({ highlights: ['a'] })],
    ['a summary that is blank', JSON.stringify({ summary: '   ' })],
    ['a summary that is not a string', JSON.stringify({ summary: 42 })],
  ])('refuses %s rather than storing it', async (_name, text) => {
    const { client } = replying(text)
    const result = await generateFields({ profile: sampleProfile, task: summaryTask }, verified, {
      client,
    })

    expect(result).toMatchObject({ ok: false, failure: 'invalid-output' })
  })

  it('refuses highlights that are all blank', async () => {
    const { client } = replying(JSON.stringify({ highlights: ['', '  '] }))
    const result = await generateFields(
      { profile: sampleProfile, task: highlightsTask },
      verified,
      { client },
    )

    expect(result).toMatchObject({ ok: false, failure: 'invalid-output' })
  })
})

describe('a task has to point at something', () => {
  it('refuses an entry the profile does not have, without asking the model', async () => {
    const { client, calls } = failing({ ok: false, failure: 'unavailable' })
    const result = await generateFields(
      { profile: sampleProfile, task: { kind: 'highlights', section: 'work', index: 40 } },
      verified,
      { client },
    )

    expect(result).toEqual({ ok: false, failure: 'no-entry' })
    expect(calls()).toBe(0)
  })
})

describe('what the transport says is passed on, not interpreted', () => {
  it('reports a refusal as a refusal', async () => {
    const { client } = failing({ ok: false, failure: 'refused' })
    const result = await generateFields({ profile: sampleProfile, task: summaryTask }, verified, {
      client,
    })

    expect(result).toEqual({ ok: false, failure: 'refused' })
  })

  it('carries a retry-after through', async () => {
    const { client } = failing({ ok: false, failure: 'unavailable', retryAfterSeconds: 30 })
    const result = await generateFields({ profile: sampleProfile, task: summaryTask }, verified, {
      client,
    })

    expect(result).toEqual({ ok: false, failure: 'unavailable', retryAfterSeconds: 30 })
  })
})

describe('one account cannot spend the balance in an afternoon', () => {
  it('refuses past its allowance and says how long to wait', async () => {
    const { client } = replying(JSON.stringify({ summary: 'A summary.' }))
    const ask = () =>
      generateFields({ profile: sampleProfile, task: summaryTask }, verified, { client })

    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect((await ask()).ok).toBe(true)
    }

    const refused = await ask()
    expect(refused.ok).toBe(false)
    expect(refused).toMatchObject({ failure: 'rate-limited' })
    expect(refused.ok === false && refused.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('leaves a second account untouched', async () => {
    const { client } = replying(JSON.stringify({ summary: 'A summary.' }))
    for (let attempt = 0; attempt < 7; attempt += 1) {
      await generateFields({ profile: sampleProfile, task: summaryTask }, verified, { client })
    }

    const other = await generateFields(
      { profile: sampleProfile, task: summaryTask },
      {
        id: 'acct_other',
        email: 'other@example.com',
        emailVerified: true,
      },
      { client },
    )
    expect(other.ok).toBe(true)
  })
})

describe('streams cannot take every slot the preview needs', () => {
  it('refuses the fifth concurrent generation', async () => {
    const client = hanging()
    const accounts = ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
    }))
    const inFlight = accounts.map((account) =>
      generateFields({ profile: sampleProfile, task: summaryTask }, account, { client }),
    )

    const fifth = await generateFields(
      { profile: sampleProfile, task: summaryTask },
      { id: 'e', email: 'e@example.com', emailVerified: true },
      { client },
    )

    expect(fifth).toEqual({ ok: false, failure: 'busy' })
    expect(inFlight).toHaveLength(4)
  })
})

describe('the log says what happened and nothing about who it happened to', () => {
  it('records ids, counts and the outcome only', async () => {
    const secret: Profile = {
      basics: { name: 'Ana Ruiz Peña', summary: 'A sentence nobody else should read.' },
    }
    const { client } = replying(JSON.stringify({ summary: 'A generated summary.' }))
    await generateFields({ profile: secret, task: summaryTask }, verified, { client })

    const line = info.mock.calls.at(-1)?.[0] as string
    expect(line).toContain('account=acct_1')
    expect(line).toContain('task=summary')
    expect(line).toContain('outcome=ok')
    expect(line).toContain(`in=${usage.input}`)
    expect(line).not.toContain('Ana')
    expect(line).not.toContain('nobody else should read')
    expect(line).not.toContain('A generated summary')
  })
})

describe('which model runs the work', () => {
  const everywhere = () => true
  const nowhere = () => false

  it("sends both of today's tasks to the free one when nobody has said otherwise", () => {
    expect(routeTo(summaryTask, 'auto', everywhere)).toBe('free')
    expect(routeTo(highlightsTask, 'auto', everywhere)).toBe('free')
  })

  it('honours an explicit choice', () => {
    expect(routeTo(summaryTask, 'best', everywhere)).toBe('best')
    expect(routeTo(summaryTask, 'free', everywhere)).toBe('free')
  })

  it('refuses rather than substituting a paid model for a free one', () => {
    expect(routeTo(summaryTask, 'free', (provider) => provider === 'best')).toBeNull()
    expect(routeTo(summaryTask, 'best', (provider) => provider === 'free')).toBeNull()
  })

  it('falls back either way when the choice was automatic', () => {
    expect(routeTo(summaryTask, 'auto', (provider) => provider === 'best')).toBe('best')
    expect(routeTo(summaryTask, 'auto', (provider) => provider === 'free')).toBe('free')
  })

  it('has nothing to offer when neither is configured', () => {
    expect(routeTo(summaryTask, 'auto', nowhere)).toBeNull()
  })
})

describe('who may send a resume to a model that trains on it', () => {
  it('is nobody in production when the list is empty', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FREE_MODEL_ACCOUNTS', '')
    expect(mayUseFreeModel('ada@example.com')).toBe(false)
    vi.unstubAllEnvs()
  })

  it('is everybody in development, where the key is already on the machine', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('FREE_MODEL_ACCOUNTS', '')
    expect(mayUseFreeModel('ada@example.com')).toBe(true)
    vi.unstubAllEnvs()
  })

  it('matches a named address whatever case it arrives in', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FREE_MODEL_ACCOUNTS', ' Ada@Example.com , grace@example.com ')
    expect(mayUseFreeModel('ada@example.com')).toBe(true)
    expect(mayUseFreeModel('GRACE@example.com')).toBe(true)
    expect(mayUseFreeModel('stranger@example.com')).toBe(false)
    vi.unstubAllEnvs()
  })

  it('tells an account that cannot use it apart from a feature that is off', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FREE_MODEL_ACCOUNTS', 'ada@example.com')
    vi.stubEnv('ANTHROPIC_API_KEY', 'a-key')
    vi.stubEnv('GEMINI_API_KEY', 'a-key')
    resetModelClients()

    const refused = await generateFields(
      { profile: sampleProfile, task: summaryTask, choice: 'free' },
      { id: 'acct_3', email: 'stranger@example.com', emailVerified: true },
    )

    expect(refused).toEqual({ ok: false, failure: 'free-not-allowed' })
    vi.unstubAllEnvs()
    resetModelClients()
  })
})

describe('a tailored reply becomes a document, or nothing', () => {
  const advert = {
    notes: { notes: 'Cut a 240ms query to 45ms.' },
    target: { posting: 'Hiring a Staff ML Engineer to own ranking.' },
  }
  const tailor = { kind: 'tailor' } as const

  it('keeps the entries the profile actually has and drops the rest', async () => {
    const { client } = replying(
      JSON.stringify({
        summary: 'Ranking engineer.',
        work: [
          { index: 0, highlights: ['Cut latency to 45ms.'] },
          // sampleProfile has fewer jobs than this. An index nobody has is the
          // one way a reply can name something that is not there.
          { index: 40, highlights: ['Invented a job.'] },
        ],
        projects: [],
        skills: [0, 99],
      }),
    )

    const result = await generateFields(
      { profile: sampleProfile, brief: advert, task: tailor },
      verified,
      { client },
    )

    expect(result.ok).toBe(true)
    expect(result.ok === true && result.fields).toEqual({
      kind: 'tailored',
      summary: 'Ranking engineer.',
      work: [{ index: 0, highlights: ['Cut latency to 45ms.'] }],
      projects: [],
      skills: [0],
    })
  })

  it('drops an entry whose bullets are all blank rather than showing it empty', async () => {
    const { client } = replying(
      JSON.stringify({
        summary: 'Ranking engineer.',
        work: [{ index: 0, highlights: ['  ', ''] }],
        projects: [],
        skills: [],
      }),
    )

    const result = await generateFields(
      { profile: sampleProfile, brief: advert, task: tailor },
      verified,
      { client },
    )

    expect(result.ok === true && result.fields.kind === 'tailored' && result.fields.work).toEqual(
      [],
    )
  })

  it('refuses to tailor without an advert to aim at', async () => {
    const { client, calls } = failing({ ok: false, failure: 'unavailable' })

    const result = await generateFields({ profile: sampleProfile, task: tailor }, verified, {
      client,
    })

    expect(result).toEqual({ ok: false, failure: 'no-entry' })
    expect(calls()).toBe(0)
  })

  it('refuses a summary that comes back blank', async () => {
    const { client } = replying(
      JSON.stringify({ summary: '   ', work: [], projects: [], skills: [] }),
    )

    const result = await generateFields(
      { profile: sampleProfile, brief: advert, task: tailor },
      verified,
      { client },
    )

    expect(result).toMatchObject({ ok: false, failure: 'invalid-output' })
  })
})

describe('a claim the dates do not support is not stored', () => {
  // sampleProfile's earliest job starts in March 2020, so on this date the
  // history is about six and a half years. A year of slack on top of that is
  // deliberate: rounding six and a half up to seven is how people speak, and a
  // check that argues with rounding is a check nobody keeps.
  const now = Date.UTC(2026, 8, 9)

  it('refuses a summary that borrows the years the advert asked for', async () => {
    const { client } = replying(
      JSON.stringify({
        summary: 'Software Architect with over twelve years of professional experience.',
      }),
    )

    const result = await generateFields({ profile: sampleProfile, task: summaryTask }, verified, {
      client,
      now,
    })

    expect(result).toMatchObject({ ok: false, failure: 'invalid-output' })
  })

  it('accepts a number the history actually supports, rounding included', async () => {
    const { client } = replying(
      JSON.stringify({ summary: 'Engineer with seven years building ranking systems.' }),
    )

    const result = await generateFields({ profile: sampleProfile, task: summaryTask }, verified, {
      client,
      now,
    })

    expect(result.ok).toBe(true)
  })

  it('says nothing about a profile with no dates in it', async () => {
    const { client } = replying(
      JSON.stringify({ summary: 'Engineer with twenty years of practice.' }),
    )

    const result = await generateFields(
      { profile: { basics: { name: 'Ada' } }, task: summaryTask },
      verified,
      { client, now },
    )

    expect(result.ok).toBe(true)
  })

  it('catches it in a tailored reply too, where it matters most', async () => {
    const { client } = replying(
      JSON.stringify({
        summary: 'Architect with 15+ years of distributed systems experience.',
        work: [{ index: 0, highlights: ['Cut latency to 45ms.'] }],
        projects: [],
        skills: [],
      }),
    )

    const result = await generateFields(
      {
        profile: sampleProfile,
        brief: { notes: {}, target: { posting: 'Hiring an architect with 8+ years.' } },
        task: { kind: 'tailor' },
      },
      verified,
      { client, now },
    )

    expect(result).toMatchObject({ ok: false, failure: 'invalid-output' })
  })
})
