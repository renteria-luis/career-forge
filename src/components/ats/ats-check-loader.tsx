'use client'

import dynamic from 'next/dynamic'

/**
 * Loads the check in the browser only.
 *
 * It reads the file locally, which means shipping a PDF engine — far too large
 * to sit in the initial bundle of a page most visitors will read before they
 * ever drop anything on it.
 */
const AtsCheck = dynamic(() => import('./ats-check').then((module) => module.AtsCheck), {
  ssr: false,
  loading: () => (
    <div className="border-hairline rounded-panel flex items-center justify-center border border-dashed px-6 py-14">
      <p className="text-muted text-micro font-mono">loading the reader…</p>
    </div>
  ),
})

export function AtsCheckLoader() {
  return <AtsCheck />
}
