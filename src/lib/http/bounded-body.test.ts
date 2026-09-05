import { describe, expect, it } from 'vitest'
import { BodyTooLarge, isBodyTooLarge, readBoundedText, withBoundedBody } from './bounded-body'

/** A chunked request: a body with no length for anyone to read off a header. */
function streamed(chunks: Uint8Array[], headers: HeadersInit = {}): Request {
  let index = 0
  return new Request('http://localhost/api', {
    method: 'POST',
    headers,
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close()
          return
        }
        controller.enqueue(chunks[index]!)
        index += 1
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

const megabyte = () => new Uint8Array(1024 * 1024)

describe('readBoundedText', () => {
  it('returns a body inside the ceiling', async () => {
    const request = streamed([new TextEncoder().encode('{"a":1}')])
    expect(await readBoundedText(request, 1024)).toBe('{"a":1}')
  })

  it('refuses a body past the ceiling that declared no length', async () => {
    // The bug this replaced: no content-length, so nothing was checked, and
    // 60 MB arrived and compiled.
    const request = streamed([megabyte(), megabyte()])
    expect(await readBoundedText(request, 1024)).toBeNull()
  })

  it('refuses an honest sender before it uploads', async () => {
    const request = streamed([new TextEncoder().encode('x')], { 'content-length': '999999' })
    expect(await readBoundedText(request, 1024)).toBeNull()
  })

  it('does not cut a multi-byte character in half at a chunk edge', async () => {
    const bytes = new TextEncoder().encode('café')
    const request = streamed([bytes.slice(0, 4), bytes.slice(4)])
    expect(await readBoundedText(request, 1024)).toBe('café')
  })
})

describe('withBoundedBody', () => {
  it('passes a body inside the ceiling to the parser', async () => {
    const body = new FormData()
    body.set('file', new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' }))
    const request = new Request('http://localhost/api', { method: 'POST', body })

    const form = await withBoundedBody(request, 1024 * 1024).formData()
    expect(form.get('file')).toBeInstanceOf(File)
  })

  /**
   * The measured failure. `formData()` has to hold the whole body to report a
   * file size, so checking the size afterwards spends the memory first: one
   * 300 MB upload took RSS to 1,085 MB and the 512 MiB instance was killed
   * before it answered. The parser has to be fed by something that stops.
   */
  it('fails the stream at the ceiling instead of parsing what came after', async () => {
    const chunks = [megabyte(), megabyte(), megabyte(), megabyte()]
    const request = streamed(chunks, { 'content-type': 'multipart/form-data; boundary=x' })

    await expect(withBoundedBody(request, 1024).formData()).rejects.toSatisfy(isBodyTooLarge)
  })

  it('refuses a declared length past the ceiling without reading a byte', () => {
    const request = streamed([megabyte()], { 'content-length': String(50 * 1024 * 1024) })
    expect(() => withBoundedBody(request, 1024)).toThrow(BodyTooLarge)
  })

  it('drops the declared length, which no longer describes the metered stream', () => {
    const body = new TextEncoder().encode('hello')
    const request = streamed([body], { 'content-length': '5' })
    expect(withBoundedBody(request, 1024).headers.get('content-length')).toBeNull()
  })
})

describe('isBodyTooLarge', () => {
  it('sees through the wrapping a parser puts around it', () => {
    expect(isBodyTooLarge(new Error('failed to parse', { cause: new BodyTooLarge() }))).toBe(true)
  })

  it('says no to anything else', () => {
    expect(isBodyTooLarge(new Error('unrelated'))).toBe(false)
    expect(isBodyTooLarge(undefined)).toBe(false)
  })

  it('gives up on a cause chain that points at itself', () => {
    const looping = new Error('round') as Error & { cause?: unknown }
    looping.cause = looping
    expect(isBodyTooLarge(looping)).toBe(false)
  })
})
