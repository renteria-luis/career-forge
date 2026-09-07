import { rm } from 'node:fs/promises'
import { startTestDatabase, type TestDatabase } from '../test/postgres'
import { E2E_DATABASE_PORT, E2E_MAIL_DIR } from './environment'

/**
 * The database and the mailbox the end-to-end run needs.
 *
 * Started here rather than left to whoever runs the suite, because the account
 * pages are now part of the app and a run without them would quietly skip the
 * one flow that has to work: register, confirm, sign in.
 *
 * The port is fixed rather than asked for. Playwright builds the web server's
 * environment when it reads the config, before this runs, so the address has to
 * be something both sides already know.
 */
let database: TestDatabase | undefined

export default async function globalSetup(): Promise<void> {
  await rm(E2E_MAIL_DIR, { recursive: true, force: true })
  database = await startTestDatabase({ port: E2E_DATABASE_PORT })
}

export async function teardown(): Promise<void> {
  await database?.stop()
  await rm(E2E_MAIL_DIR, { recursive: true, force: true })
}
