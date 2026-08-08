import { describe, expect, it } from 'vitest'
import { toHandle, toUrl } from './profile-links'

describe('toHandle', () => {
  it.each([
    ['github', 'https://github.com/octocat', 'octocat'],
    ['github', 'https://www.github.com/octocat', 'octocat'],
    ['linkedin', 'https://linkedin.com/in/octocat', 'octocat'],
    ['linkedin', 'https://www.linkedin.com/in/octocat/', 'octocat'],
  ])('%s: %s reads as %s', (network, url, handle) => {
    expect(toHandle(network, url)).toBe(handle)
  })

  it('leaves an address it does not recognise alone', () => {
    expect(toHandle('github', 'https://gitlab.com/someone')).toBe('https://gitlab.com/someone')
  })

  it('is empty when there is no link', () => {
    expect(toHandle('github', undefined)).toBe('')
  })
})

describe('toUrl', () => {
  it.each([
    ['github', 'octocat', 'https://github.com/octocat'],
    ['linkedin', 'octocat', 'https://linkedin.com/in/octocat'],
    // People paste whole addresses just as often as they type a handle.
    ['github', 'https://github.com/octocat', 'https://github.com/octocat'],
    ['github', 'github.com/octocat', 'https://github.com/octocat'],
    ['linkedin', 'www.linkedin.com/in/x', 'https://www.linkedin.com/in/x'],
  ])('%s: %s becomes %s', (network, input, url) => {
    expect(toUrl(network, input)).toBe(url)
  })

  it('is empty for empty input, so clearing the field removes the link', () => {
    expect(toUrl('github', '   ')).toBe('')
  })

  it('round trips a handle', () => {
    expect(toHandle('github', toUrl('github', 'octocat'))).toBe('octocat')
  })
})
