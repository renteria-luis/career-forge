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
/**
 * Writes the message to a directory instead of sending it.
 *
 * Named by `EMAIL_SINK_DIR`, and when it is named it **wins over a configured
 * provider**. That precedence is the point rather than a detail: this once
 * checked the provider first, and the end-to-end suite ran on a machine where
 * a developer had put real credentials in `.env.local`. The suite happily
 * posted its `@example.com` addresses to the live provider. Naming a sink is
 * somebody saying "do not send this anywhere", and nothing an environment
 * happens to also contain should be able to override that.
 *
 * The recipient is written into the file, which is not the exception to §6 it
 * looks like. That rule is about logs and stored records, where an address is a
 * leak. This is the mail itself, in a directory somebody named on purpose so
 * they could read what was sent and to whom. A mailbox that will not say who a
 * message was for cannot answer the only question it exists to answer.
 */
async function writeToSink(sink: string, { to, subject, text }: Message): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises')
  await mkdir(sink, { recursive: true })
  await writeFile(
    `${sink}/${Date.now()}-${randomUUID()}.txt`,
    `To: ${to}\nSubject: ${subject}\n\n${text}\n`,
  )
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
export async function sendEmail(message: Message): Promise<void> {
  // First, and before anything is read about a provider. See `writeToSink`.
  const sink = process.env.EMAIL_SINK_DIR
  if (sink) return writeToSink(sink, message)

  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!key || !from) {
    // Without a provider there is no delivery, and pretending otherwise would
    // leave the flow looking like it worked. In development the link goes to
    // the terminal instead; the address still never appears.
    if (process.env.NODE_ENV === 'development') {
      console.info(`[dev email] ${message.subject}\n${message.text}`)
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
      body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new EmailNotSent('email provider did not answer')
  }

  if (!response.ok) throw new EmailNotSent(`email provider returned ${response.status}`)
}
