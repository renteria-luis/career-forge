'use client'

import dynamic from 'next/dynamic'

/**
 * Loads the editor in the browser only.
 *
 * The editor has nothing worth server-rendering: every pixel of it depends on
 * state that only exists once someone is typing. Rendering it on the server
 * bought an empty form nobody sees and cost a whole class of hydration
 * mismatches — including the one that let a saved draft disagree with the
 * markup it was hydrating into.
 */
const Editor = dynamic(() => import('./editor').then((module) => module.Editor), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center">
      <p className="text-muted text-micro font-mono">loading the editor…</p>
    </div>
  ),
})

export function EditorLoader() {
  return <Editor />
}
