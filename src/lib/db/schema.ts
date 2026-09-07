import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * The account tables.
 *
 * These four models are `better-auth`'s, and their shape is not a choice — it
 * was read out of the installed version rather than remembered, because a field
 * it expects and cannot find is a runtime failure on a login page. The keys on
 * the left are what the library looks up; the strings on the right are what
 * Postgres is asked for, in the snake case the rest of a database uses.
 *
 * Written by hand rather than generated so the comments below survive. What is
 * ours and not the library's is marked.
 */

/** Timestamps are stored with a zone. A resume is dated; a session expires. */
function moment(column: string) {
  return timestamp(column, { withTimezone: true, mode: 'date' })
}

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: moment('created_at').notNull().defaultNow(),
    updatedAt: moment('updated_at').notNull().defaultNow(),

    /**
     * Ours, and deliberately unused at this stage.
     *
     * `docs/accounts-and-billing.md` defers phone verification to stage 3: it
     * costs real money on every signup and it defends against multiple accounts
     * being worth creating, which only becomes true once accounts carry credits.
     * The columns exist now so switching it on later is a backfill rather than
     * a migration that adds a unique constraint to a table with rows in it.
     */
    phone: text('phone'),
    phoneVerifiedAt: moment('phone_verified_at'),
  },
  (table) => [
    // Uniqueness is on the normalised address — see `normaliseEmail`. The
    // database is the last line here: two requests can pass an application-level
    // "is this taken" check at the same time and only one can win this.
    uniqueIndex('user_email_uidx').on(table.email),
    uniqueIndex('user_phone_uidx').on(table.phone),
  ],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    expiresAt: moment('expires_at').notNull(),
    createdAt: moment('created_at').notNull().defaultNow(),
    updatedAt: moment('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // The lookup on every authenticated request, so it is the one index that
    // has to exist. Unique because the token is the session.
    uniqueIndex('session_token_uidx').on(table.token),
    // "Sign out everywhere", and the cascade when an account is deleted.
    index('session_user_id_idx').on(table.userId),
  ],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: moment('access_token_expires_at'),
    refreshTokenExpiresAt: moment('refresh_token_expires_at'),
    scope: text('scope'),
    /** The Argon2id PHC string. Never read anywhere but `verifyPassword`. */
    password: text('password'),
    createdAt: moment('created_at').notNull().defaultNow(),
    updatedAt: moment('updated_at').notNull(),
  },
  (table) => [
    // The library asks for this one by name; it is what stops one identity at
    // one provider being attached to two accounts.
    uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
    index('account_user_id_idx').on(table.userId),
  ],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    /** The address being confirmed, or the account a reset was asked for. */
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: moment('expires_at').notNull(),
    createdAt: moment('created_at').notNull().defaultNow(),
    updatedAt: moment('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // Every verification and every reset looks a row up by this.
    index('verification_identifier_idx').on(table.identifier),
    // Expired rows are swept by identifier and date; without this the sweep
    // reads the whole table once it has one.
    index('verification_expires_at_idx').on(table.expiresAt),
  ],
)
