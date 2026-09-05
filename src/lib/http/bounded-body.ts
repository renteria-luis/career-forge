/**
 * Body size ceilings, counted on the bytes that arrive.
 *
 * A `content-length` is a claim the sender makes, and a chunked request omits
 * it entirely. Both public endpoints here once trusted a size they were told.
 * `/api/compile` read the header, and 60 MB arrived and compiled in 48 s.
 * `/api/import` called `formData()` and then asked the parsed file how big it
 * was — which is only answerable once the whole body is in memory. Measured
 * against the deployment's 512 MiB ceiling, a single 300 MB upload took RSS to
 * 1,085 MB and the process was killed before it could reply. On a machine with
 * room it returns a tidy 413, which is a message printed after the damage
 * rather than a limit.
 *
 * So the count happens as the stream is consumed, and the stream is cancelled
 * or errored at the ceiling instead of drained.
 */

/** Thrown into a request stream once more bytes have arrived than are allowed. */
export class BodyTooLarge extends Error {
  constructor() {
    super('Request body exceeded its ceiling')
    this.name = 'BodyTooLarge'
  }
}

/** True if `error`, or anything it was caused by, is a `BodyTooLarge`. */
export function isBodyTooLarge(error: unknown): boolean {
  for (let cause = error, hops = 0; cause != null && hops < 8; hops += 1) {
    if (cause instanceof BodyTooLarge) return true
    cause = (cause as { cause?: unknown }).cause
  }
  return false
}

/**
 * True when the sender declared a length past the ceiling.
 *
 * Worth checking even though the header is not trusted: an honest client is
 * refused before it uploads anything. A sender that lies, or omits it, is
 * caught by the counting below instead.
 */
function declaresTooLarge(request: Request, limit: number): boolean {
  const declared = request.headers.get('content-length')
  return declared !== null && Number(declared) > limit
}

/**
 * Reads the body as text, or returns null the moment it passes the ceiling.
 *
 * The stream is cancelled rather than drained, so an oversized body stops
 * costing memory at the limit instead of at its own size.
 */
export async function readBoundedText(request: Request, limit: number): Promise<string | null> {
  if (declaresTooLarge(request, limit)) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let seen = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      seen += value.byteLength
      if (seen > limit) return null
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    // Cancel releases the connection when we bailed out; after a clean read it
    // is a no-op. Either way the reader must not be left holding the lock.
    await reader.cancel().catch(() => {})
  }
  return text + decoder.decode()
}

/**
 * The same request, with a body that fails once it passes the ceiling.
 *
 * For bodies somebody else parses — `formData()` decodes multipart itself, and
 * there is no reading it in pieces first. Metering the stream underneath means
 * the parser is fed by something that stops, so it allocates up to the ceiling
 * and no further.
 *
 * `content-length` is dropped from the copy because the body is now a stream of
 * unknown length, and a declared length that no longer matches is rejected
 * before the parser ever runs.
 */
export function withBoundedBody(request: Request, limit: number): Request {
  if (declaresTooLarge(request, limit)) {
    throw new BodyTooLarge()
  }
  if (!request.body) return request

  let seen = 0
  const meter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength
      if (seen > limit) {
        controller.error(new BodyTooLarge())
        return
      }
      controller.enqueue(chunk)
    },
  })

  const headers = new Headers(request.headers)
  headers.delete('content-length')

  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body.pipeThrough(meter),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}
