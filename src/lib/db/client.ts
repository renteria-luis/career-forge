import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

/**
 * The one connection to Postgres.
 *
 * Deliberately the plain `pg` driver over TCP rather than the host's own
 * serverless client. `docs/accounts-and-billing.md` puts the database behind a
 * rule — plain Postgres and nothing else — because the moment a provider's own
 * driver or its edge features are used, moving the database stops being a
 * `pg_dump` and starts being a rewrite. This file is where that rule is either
 * kept or quietly broken.
 */

/**
 * How many connections one instance opens.
 *
 * Small on purpose. `--max-instances 1` means this pool is the whole service,
 * and a request that touches the database does one or two short queries around
 * a session lookup, not a long transaction. Neon's free tier is also metered on
 * compute time rather than connections, and an idle open connection keeps the
 * database awake, which is the thing that costs.
 */
const MAX_CONNECTIONS = 5

/**
 * Closed after this long idle, so a burst of traffic does not leave five
 * connections holding the database awake for the rest of the hour.
 */
const IDLE_TIMEOUT_MS = 10_000

/**
 * How long a query may wait for a free connection.
 *
 * Above the measured cold start of a scaled-to-zero database, which is close to
 * two seconds and can reach three. Below it, the first request after a quiet
 * night fails rather than waits, which reads as the app being broken.
 */
const CONNECTION_TIMEOUT_MS = 10_000

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}

export interface Connection {
  connectionString: string
  ssl: { rejectUnauthorized: true } | false
}

/**
 * TLS, decided here and not by the connection string.
 *
 * `sslmode` is deliberately stripped out, and that is the whole point of this
 * function. Measured against the real database: with `sslmode` present in the
 * URL, the driver builds its own TLS settings from it and the `ssl` option
 * passed alongside is ignored completely — an option that reads like it
 * controls the connection and does not. Handed a connection string with no
 * `sslmode`, the same driver honours it: a certificate signed by the wrong
 * authority is refused rather than accepted.
 *
 * Today that inversion happens to be safe, because this driver treats
 * `sslmode=require` as full verification. It says in a warning on every
 * connection that it will stop: the next major version adopts the standard
 * meaning, under which `require` encrypts and verifies nothing. That would be a
 * silent downgrade arriving with a dependency bump, on the one connection that
 * carries password hashes and session tokens.
 *
 * So the mode is read once, for the single question worth asking, and then
 * removed. `sslmode=disable` is the local test database saying it is a socket
 * on this machine and cannot offer TLS. Everything else gets a verified
 * certificate, whatever the URL claims to want.
 */
export function connection(url: string): Connection {
  const parsed = new URL(url)
  const mode = parsed.searchParams.get('sslmode')
  parsed.searchParams.delete('sslmode')
  return {
    connectionString: parsed.toString(),
    ssl: mode === 'disable' ? false : { rejectUnauthorized: true },
  }
}

/**
 * Held on globalThis for the reason the compiler and the rate limiters are:
 * HMR replacing this module in development would otherwise open a new pool on
 * every save and leave the old one holding its connections open.
 */
const globalForDb = globalThis as {
  __pgPool?: Pool
  __db?: NodePgDatabase<typeof schema>
}

export function pool(): Pool {
  if (!globalForDb.__pgPool) {
    const created = new Pool({
      ...connection(connectionString()),
      max: MAX_CONNECTIONS,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    })
    // An idle client that errors — the database restarting, a connection cut by
    // the provider — emits on the pool, and an unhandled 'error' event on an
    // EventEmitter takes the process down. Logged as an outcome, never with the
    // connection string, which carries the password.
    created.on('error', (error) => {
      console.error('database pool error', error.message)
    })
    globalForDb.__pgPool = created
  }
  return globalForDb.__pgPool
}

/** The query builder. Every query goes through this; no string-built SQL. */
export function db(): NodePgDatabase<typeof schema> {
  globalForDb.__db ??= drizzle(pool(), { schema })
  return globalForDb.__db
}
