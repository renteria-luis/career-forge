import { defineConfig, devices } from '@playwright/test'

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
  },
})
