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

/**
 * TLS is on unless the connection string says otherwise.
 *
 * Managed Postgres requires it and the local test database, which is a socket
 * on this machine, cannot offer it. `sslmode=disable` in the URL is how the
 * test harness says so, rather than a separate flag that could be left on in
 * production by accident.
 */
function ssl(url: string): { rejectUnauthorized: boolean } | false {
  return /[?&]sslmode=disable\b/.test(url) ? false : { rejectUnauthorized: true }
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
    const url = connectionString()
    const created = new Pool({
      connectionString: url,
      ssl: ssl(url),
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
