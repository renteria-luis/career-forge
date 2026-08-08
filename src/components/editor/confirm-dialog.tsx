'use client'

import { useEffect, useRef } from 'react'
import { Button } from './fields'

/**
 * Asks before doing something that cannot be undone.
 *
 * Uses a native dialog so focus, Escape and the backdrop behave the way the
 * browser already makes them behave, rather than being rebuilt approximately.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      className="border-hairline bg-surface rounded-panel text-strong m-auto max-w-md border p-6 backdrop:bg-black/30"
    >
      <h2 className="font-display text-title">{title}</h2>
      <p className="text-muted text-small mt-2">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onCancel}>Keep it</Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
