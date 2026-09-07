import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The suite that needs a database, kept apart from the one that does not.
 *
 * `vitest.config.ts` promises a unit suite that runs in under a second so that
 * nobody skips it. Starting a Postgres costs a second on its own, so these run
 * under their own command and their own timeouts rather than being folded in
 * and quietly breaking that promise.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.db.test.ts'],
    environment: 'node',
    // One database, and PGlite runs one query at a time. Files sharing it in
    // parallel would interleave their fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
