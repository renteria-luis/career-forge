import { describe, expect, it } from 'vitest'
import { splitEmployer } from './employment'

describe('splitEmployer', () => {
  it('splits an employer from a place on a pipe', () => {
    expect(splitEmployer('Nomad Analytics | Toronto, ON')).toEqual({
      name: 'Nomad Analytics',
      location: 'Toronto, ON',
      arrangement: undefined,
    })
  })

  it('reads an arrangement set in its own column', () => {
    // The extractor marks a gap wide enough to be a column with a tab, and the
    // template right-aligns how a job was worked against the employer. Set
    // against it by space alone, nothing in the words would tell "Remote"
    // apart from part of the company's name.
    expect(splitEmployer('Nomad Analytics, Toronto, ON\tRemote')).toEqual({
      name: 'Nomad Analytics',
      location: 'Toronto, ON',
      arrangement: 'remote',
    })
  })

  it('reads a place set in its own column', () => {
    // Plenty of resumes right-align where the job was instead.
    expect(splitEmployer('Acme Corp\tToronto, ON')).toEqual({
      name: 'Acme Corp',
      location: 'Toronto, ON',
      arrangement: undefined,
    })
  })

  it('reads an arrangement written as its own segment', () => {
    expect(splitEmployer('Nomad Analytics • Toronto, ON • Remote')).toEqual({
      name: 'Nomad Analytics',
      location: 'Toronto, ON',
      arrangement: 'remote',
    })
  })

  it('reads an arrangement written as the last part of the place', () => {
    expect(splitEmployer('Nomad Analytics — Toronto, ON, Hybrid')).toEqual({
      name: 'Nomad Analytics',
      location: 'Toronto, ON',
      arrangement: 'hybrid',
    })
  })

  it('accepts the spellings people actually use for on-site', () => {
    for (const written of ['On-site', 'on site', 'Onsite', 'In-office']) {
      expect(splitEmployer(`Acme | Lima | ${written}`).arrangement).toBe('on-site')
    }
  })

  it('does not read an arrangement out of the middle of a name', () => {
    // The reason this matches whole segments only. Both of these are the
    // employer, and filing either as "remote" or "hybrid" invents a fact.
    expect(splitEmployer('Remote Sensing Group')).toEqual({
      name: 'Remote Sensing Group',
      location: undefined,
      arrangement: undefined,
    })
    expect(splitEmployer('Hybrid Systems Lab | Lima, Peru').arrangement).toBeUndefined()
  })

  it('cuts a place off a comma line when the end of it is a place we know', () => {
    // No separator here, so the only thing that can cut the line is knowing
    // that ON is a province — and that "Inc." ends a company name, so the reach
    // back for the city stops before it.
    expect(splitEmployer('Acme, Inc., Toronto, ON')).toEqual({
      name: 'Acme, Inc.',
      location: 'Toronto, ON',
      arrangement: undefined,
    })
  })

  it('recovers what the template itself writes', () => {
    // The page sets an institution and its place with one comma, so an import
    // of our own output has to come back apart.
    expect(splitEmployer('Fanshawe College, London, ON, Canada')).toEqual({
      name: 'Fanshawe College',
      location: 'London, ON, Canada',
      arrangement: undefined,
    })
  })

  it('leaves a line whole when nothing at the end of it is a place', () => {
    // Guessing here would put half a company name in the location field.
    expect(splitEmployer('Booz, Allen & Hamilton')).toEqual({
      name: 'Booz, Allen & Hamilton',
      location: undefined,
      arrangement: undefined,
    })
  })

  it('keeps every place segment when there are several', () => {
    expect(splitEmployer('Acme | London | ON | Canada').location).toBe('London, ON, Canada')
  })

  it('returns nothing for a line that is not there', () => {
    expect(splitEmployer(undefined)).toEqual({})
    expect(splitEmployer('   ')).toEqual({})
  })

  it('survives a line that is only an arrangement', () => {
    expect(splitEmployer('Remote')).toEqual({
      name: undefined,
      location: undefined,
      arrangement: 'remote',
    })
  })
})
