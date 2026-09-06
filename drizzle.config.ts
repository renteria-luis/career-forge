import { defineConfig } from 'drizzle-kit'

/**
 * Migrations are files in the repository, not something generated at deploy.
 *
 * `drizzle-kit push` is deliberately never used here: it diffs the live
 * database against the schema and applies whatever it thinks the difference is,
 * which on a database holding accounts is a destructive operation nobody
 * reviewed. `generate` writes SQL that goes through a pull request; `migrate`
 * applies exactly those files, in order, once each.
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
})
