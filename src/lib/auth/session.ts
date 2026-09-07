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
 */

export interface SignedInUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
}

/**
 * The three answers, kept apart.
 *
 * A page that only wanted to draw a link is happy to read a database outage as
 * "not signed in" — see `currentUser`. An endpoint that spends money is not:
 * telling somebody who is signed in to sign in sends them to a form that will
 * work, which teaches them nothing about what actually went wrong.
 */
export type SessionLookup =
  { state: 'signed-in'; user: SignedInUser } | { state: 'anonymous' } | { state: 'unavailable' }

export async function lookupSession(): Promise<SessionLookup> {
  try {
    const result = await auth().api.getSession({ headers: await headers() })
    if (!result) return { state: 'anonymous' }
    const { id, name, email, emailVerified } = result.user
    return { state: 'signed-in', user: { id, name, email, emailVerified } }
  } catch {
    return { state: 'unavailable' }
  }
}

/**
 * Returns null rather than throwing when nobody is signed in. Most callers ask
 * in order to show a name or a link, and a page that throws for a visitor is
 * not the same thing as a page that greets one — so a database that cannot be
 * reached reads as a visitor here, which is the safe way for a link to fail.
 */
export async function currentUser(): Promise<SignedInUser | null> {
  const found = await lookupSession()
  return found.state === 'signed-in' ? found.user : null
}
