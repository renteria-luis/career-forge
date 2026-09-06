import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * What the suite and the server it starts have to agree on.
 *
 * Both halves are configured before either runs — Playwright builds the web
 * server's environment as it reads the config — so these cannot be discovered
 * at runtime and are written down instead.
 */

/** High and unlikely to be taken; the deployed database is nowhere near here. */
export const E2E_DATABASE_PORT = 55432

export const E2E_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${E2E_DATABASE_PORT}/postgres?sslmode=disable`

/** Where `sendEmail` drops messages when no provider is configured. */
export const E2E_MAIL_DIR = join(tmpdir(), 'career-forge-e2e-mail')
