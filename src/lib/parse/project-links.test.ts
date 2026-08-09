import { describe, expect, it } from 'vitest'
import type { TextLine } from './extract'
import { parseResume } from './parse'

/**
 * Projects written the way a lot of resumes write them: the name, the stack and
 * the repository all on the title line, separated by pipes.
 */
function documentOf(...body: TextLine[]) {
  // A name, a heading and enough body for the parser to work out which size is
  // ordinary text — it opens an entry on a bold line at or above that size.
  const lines: TextLine[] = [
    { text: 'Ana Ruiz', x: 40, y: 740, size: 16, bold: true, page: 1 },
    { text: 'PROJECTS', x: 40, y: 700, size: 11, bold: true, page: 1 },
    ...body,
    { text: 'Written as an ordinary sentence.', x: 40, y: 400, size: 10, bold: false, page: 1 },
  ]
  return parseResume({ pages: 1, lines, imageOnly: false }).profile
}

const title = (text: string, index = 0): TextLine => ({
  text,
  x: 40,
  y: 680 - index * 20,
  size: 10,
  bold: true,
  page: 1,
})

function projectsFrom(...titleLines: string[]) {
  return documentOf(...titleLines.map((text, index) => title(text, index))).projects ?? []
}

describe('a repository written beside the stack', () => {
  it('is read as the link rather than as one more tool', () => {
    const [project] = projectsFrom('Ledger | Python, Pandas, SQL | github.com/ana/ledger')
    expect(project.name).toBe('Ledger')
    expect(project.keywords).toEqual(['Python', 'Pandas', 'SQL'])
    expect(project.url).toBe('https://github.com/ana/ledger')
  })

  it('is read when it carries a scheme', () => {
    const [project] = projectsFrom('Ledger | Python | https://gitlab.com/ana/ledger')
    expect(project.keywords).toEqual(['Python'])
    expect(project.url).toBe('https://gitlab.com/ana/ledger')
  })

  it('is read when it opens with www', () => {
    const [project] = projectsFrom('Portfolio | Figma | www.anaruiz.design')
    expect(project.keywords).toEqual(['Figma'])
    expect(project.url).toBe('https://www.anaruiz.design')
  })

  it('is read from a bare .com with nothing after it', () => {
    const [project] = projectsFrom('Shop | Next.js | anaruiz.com')
    expect(project.keywords).toEqual(['Next.js'])
    expect(project.url).toBe('https://anaruiz.com')
  })

  it('leaves a library whose name ends in a domain among the tools', () => {
    // socket.io and ASP.NET are real skills. Filed as links they are lost from
    // the stack, and the stack is what an ATS reads. A link left among the
    // tools is one the user can see and move; a lost skill is not.
    const [project] = projectsFrom('Chat | socket.io, ASP.NET, Node.js')
    expect(project.keywords).toEqual(['socket.io', 'ASP.NET', 'Node.js'])
    expect(project.url).toBeUndefined()
  })

  it('keeps the link that had a line of its own', () => {
    // An address on its own line was never ambiguous, so it wins.
    const projects =
      documentOf(title('Ledger | Python | github.com/ana/one'), {
        text: 'github.com/ana/two',
        x: 40,
        y: 664,
        size: 10,
        bold: false,
        page: 1,
      }).projects ?? []
    expect(projects[0].url).toBe('https://github.com/ana/two')
  })

  it('leaves a project with no link alone', () => {
    const [project] = projectsFrom('Ledger | Python, Pandas')
    expect(project.keywords).toEqual(['Python', 'Pandas'])
    expect(project.url).toBeUndefined()
  })
})
