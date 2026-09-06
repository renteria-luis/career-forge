import { randomUUID } from 'node:crypto'

/**
 * Sending the two transactional emails this app has.
 *
 * A plain HTTPS call rather than a provider SDK. There are two messages, each
 * one POST, and the whole surface is the four fields below — a dependency
 * would be more code than it saves, and swapping provider stays a change to
 * this file.
 */

const ENDPOINT = 'https://api.resend.com/emails'

/** Long enough for a slow provider, short enough that a route does not hang. */
const TIMEOUT_MS = 8000

export class EmailNotSent extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'EmailNotSent'
  }
}

interface Message {
  to: string
  subject: string
  text: string
}

/**
 * Delivers a message, or throws.
 *
 * Throwing matters: a registration whose verification email silently failed
 * leaves an account nobody can reach, and the caller has to be able to tell the
 * person to try again. `docs/engineering-guidelines.md` §6 is why the recipient
 * never appears in the error or in a log line — the outcome does, the address
 * does not.
 */
export async function sendEmail({ to, subject, text }: Message): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!key || !from) {
    /**
     * A local mailbox, when one is asked for by name.
     *
     * Running a production build against a real database without an email
     * provider is an ordinary thing to want — it is how the verification flow
     * is exercised end to end — and the alternative is either sending real mail
     * from a test or pretending the message went out. Off unless the directory
     * is named, so a deployment that simply forgot its key still fails loudly.
     *
     * The recipient is written into the message, and that is not the exception
     * to §6 it looks like. That rule is about logs and stored records — things
     * kept and read for other reasons, where an address is a leak. This is the
     * mail itself, in a directory somebody named on purpose so they could read
     * what was sent and to whom. A mailbox that will not say who a message was
     * for cannot answer the only question it exists to answer.
     */
    const sink = process.env.EMAIL_SINK_DIR
    if (sink) {
      const { writeFile, mkdir } = await import('node:fs/promises')
      await mkdir(sink, { recursive: true })
      await writeFile(
        `${sink}/${Date.now()}-${randomUUID()}.txt`,
        `To: ${to}\nSubject: ${subject}\n\n${text}\n`,
      )
      return
    }

    // Without a provider there is no delivery, and pretending otherwise would
    // leave the flow looking like it worked. In development the link goes to
    // the terminal instead; the address still never appears.
    if (process.env.NODE_ENV === 'development') {
      console.info(`[dev email] ${subject}\n${text}`)
      return
    }
    throw new EmailNotSent('email provider is not configured')
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new EmailNotSent('email provider did not answer')
  }

  if (!response.ok) throw new EmailNotSent(`email provider returned ${response.status}`)
}
