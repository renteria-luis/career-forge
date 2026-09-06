import { defineConfig, devices } from '@playwright/test'
import { E2E_DATABASE_URL, E2E_MAIL_DIR } from './e2e/environment'

const PORT = 3100
// localhost, not 127.0.0.1: the dev server rejects requests whose origin does
// not match what it announces, and reusing a running `pnpm dev` is the normal
// local case.
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Any wait long enough to need a retry is a bug worth seeing fail.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  /**
   * Starts the database and empties the mailbox before the server does.
   *
   * The account pages are part of the app now, so a run without a database
   * would skip the one flow that has to work end to end.
   */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The product has to work on a phone, so the phone is not an afterthought.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Tests run against a production build: dev mode hides bundling problems
    // and the compiled output is what users actually get.
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // Fixed, so a session cookie signed on one run is not accepted on the
      // next by accident. It is a value the suite owns and nothing else sees.
      BETTER_AUTH_SECRET: 'career-forge-end-to-end-secret',
      BETTER_AUTH_URL: baseURL,
      // No provider configured, so messages land here as files and the suite
      // can follow the link in one.
      EMAIL_SINK_DIR: E2E_MAIL_DIR,
    },
  },
})
