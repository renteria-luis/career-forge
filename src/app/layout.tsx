import type { Metadata } from 'next'
import { fontVariables } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Career Forge',
    template: '%s · Career Forge',
  },
  description:
    'Structured resume data compiled into typeset PDFs that applicant tracking systems can read.',
}

/**
 * Every page is rendered per request, and this is what makes the nonce work.
 *
 * A nonce has to be fresh for each request, and a statically generated page was
 * built before any request existed — its script tags would carry a nonce from
 * build time, or none, and the browser would refuse to run them. Set on the
 * root layout so it applies to everything below it rather than being remembered
 * on each new page.
 *
 * The cost is one the deployment can pay: no CDN sits in front of this, the
 * pages are small, and the work per request was already dominated by a 6 ms
 * compile.
 */
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`}>
      <body className="bg-surface text-strong flex min-h-full flex-col">{children}</body>
    </html>
  )
}
