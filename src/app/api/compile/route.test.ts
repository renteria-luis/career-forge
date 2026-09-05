import { describe, expect, it } from 'vitest'
import { resumeDocument } from '@/lib/resume/document'

/**
 * The template names a file to read, so an unconstrained value walked past the
 * boundary and threw inside the compiler. Every one of these answered a public
 * endpoint with a 500 and a stack trace; the route turns a schema failure into
 * a 422 naming the field, which is what should have happened.
 */
describe('the document schema constrains the template', () => {
  const document = {
    id: 'a',
    name: 'b',
    sections: [{ kind: 'standard', id: 'work' }],
  }

  it('accepts the template that exists, and defaults to it', () => {
    expect(resumeDocument.parse(document).template).toBe('classic')
    expect(resumeDocument.parse({ ...document, template: 'classic' }).template).toBe('classic')
  })

  it.each([['modern'], [''], ['../../../etc/passwd'], ['classic.typ']])(
    'refuses %o at the boundary rather than in the compiler',
    (template) => {
      const result = resumeDocument.safeParse({ ...document, template })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual(['template'])
    },
  )
})
