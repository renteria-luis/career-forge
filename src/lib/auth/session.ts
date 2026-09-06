import { headers } from 'next/headers'
import { auth } from './server'

/**
 * Who is asking, on the server.
 *
 * The session id is an opaque cookie and the record behind it is a row, so this
 * is a lookup and not a token being decoded. That is what makes a session
 * revocable, and it is why `docs/accounts-and-billing.md` rules out a JWT in
 * local storage: a token JavaScript can read is a token an XSS bug hands over,
 * and a stateless one cannot be withdrawn.
 *
 * Returns null rather than throwing when nobody is signed in. Most callers ask
 * in order to show a name or a link, and a page that throws for a visitor is
 * not the same thing as a page that greets one.
 */
export async function currentUser(): Promise<{
  id: string
  name: string
  email: string
  emailVerified: boolean
} | null> {
  try {
    const result = await auth().api.getSession({ headers: await headers() })
    if (!result) return null
    const { id, name, email, emailVerified } = result.user
    return { id, name, email, emailVerified }
  } catch {
    // The database being unreachable must read as "not signed in" on a page
    // that only wanted to draw a link, not as a 500 on the whole app.
    return null
  }
}
