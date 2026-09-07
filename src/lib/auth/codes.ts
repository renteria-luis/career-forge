/**
 * The codes the browser keys its wording on.
 *
 * In a file of their own so a client component can import them without pulling
 * the whole account system — `server.ts` reaches the database, `better-auth`
 * and the Argon2id binding — into the browser bundle.
 *
 * The first two are ours. The rest are the library's, written out here so the
 * places that switch on them are reading one list rather than loose strings.
 */
export const ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND'
export const EMAIL_IN_USE = 'EMAIL_IN_USE'
export const PASSWORD_TOO_WEAK = 'PASSWORD_TOO_WEAK'
export const PASSWORD_BREACHED = 'PASSWORD_BREACHED'

export const INVALID_EMAIL = 'INVALID_EMAIL'
export const INVALID_EMAIL_OR_PASSWORD = 'INVALID_EMAIL_OR_PASSWORD'
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED'
