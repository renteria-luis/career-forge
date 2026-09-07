/**
 * The two codes the browser keys its wording on.
 *
 * In a file of their own so a client component can import them without pulling
 * the whole account system — `server.ts` reaches the database, `better-auth`
 * and the Argon2id binding — into the browser bundle.
 */
export const ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND'
export const EMAIL_IN_USE = 'EMAIL_IN_USE'
