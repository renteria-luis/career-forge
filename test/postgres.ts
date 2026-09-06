import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

/**
 * A real Postgres for the tests that need one.
 *
 * PGlite is the Postgres source compiled to WebAssembly, and `pglite-socket`
 * puts it behind a TCP socket speaking the real wire protocol — so the `pg`
 * driver, the migrations and `better-auth`'s adapter all run here exactly as
 * they run against the deployed database, unmodified.
 *
 * The alternative was a container, which this machine cannot run without
 * Docker, or a mock, which would test the mock. What is tested against a fake
 * database is whether the fake agrees with the code, and the two questions
 * worth asking — does this migration apply, does the adapter's SQL run — are
 * exactly the ones a fake cannot answer.
 */

export interface TestDatabase {
  url: string
  stop: () => Promise<void>
}

/**
 * A port the operating system says is free.
 *
 * Asked for rather than picked, so two suites running at once do not collide.
 * There is a gap between closing this listener and the server binding, which is
 * a race in principle and has not been one in practice.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close()
        reject(new Error('could not resolve a free port'))
        return
      }
      probe.close(() => resolve(address.port))
    })
  })
}

/**
 * Starts an empty database with the migrations applied.
 *
 * On disk rather than in memory: the point is to run the same migration files
 * the deployment runs, and a durable data directory is what makes a failure
 * reproducible while it is being looked at.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const dataDir = await mkdtemp(join(tmpdir(), 'career-forge-pg-'))
  const pglite = await PGlite.create({ dataDir })
  const port = await freePort()
  const server = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1' })
  await server.start()

  // `sslmode=disable` is what tells the pool this is a socket on this machine.
  // See `ssl()` in `src/lib/db/client.ts`: everything else gets TLS.
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`

  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  } finally {
    await pool.end()
  }

  return {
    url,
    stop: async () => {
      await server.stop()
      await pglite.close()
      await rm(dataDir, { recursive: true, force: true })
    },
  }
}
