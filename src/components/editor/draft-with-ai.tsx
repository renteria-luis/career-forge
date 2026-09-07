'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { UseFormReturn } from 'react-hook-form'
import type { GeneratedFields } from '@/lib/ai/fields'
import type { GenerationTask } from '@/lib/ai/tasks'
import { authClient } from '@/lib/auth/client'
import { useGeneration } from '@/lib/editor/use-generation'
import type { Profile } from '@/lib/resume/profile'
import { ConfirmDialog } from './confirm-dialog'
import { Button } from './fields'

/**
 * Offers a draft for one field, and never writes one.
 *
 * The proposal is shown and the person decides. That is not politeness: the
 * pipeline only works because the profile is the truth, and a resume is signed
 * by the person it describes. A control that filled the field in would be
 * putting sentences nobody read into a document somebody sends to an employer.
 *
 * It also stays out of the way of everyone who cannot use it. Signed out, it is
 * a link to sign in; unconfirmed, a link to the page that resends the mail —
 * both of which are the actual next step, rather than a disabled button.
 */

/**
 * Whether this browser has been told what drafting sends, and where.
 *
 * Asked once and remembered, because the answer does not change between one
 * bullet list and the next. Kept out of the profile: it is a fact about this
 * browser, not about the person's career.
 */
const CONSENT_KEY = 'career-forge:ai-consent:v1'

function consented(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'yes'
  } catch {
    // Private browsing throws here. Asking every time is the safe failure.
    return false
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, 'yes')
  } catch {
    // Then it gets asked again next time, which is not worth interrupting over.
  }
}

/** The one place a draft becomes a value in the form, and only on a click. */
function apply(form: UseFormReturn<Profile>, fields: GeneratedFields): void {
  const options = { shouldDirty: true, shouldValidate: true } as const
  if (fields.kind === 'summary') {
    form.setValue('basics.summary', fields.summary, options)
    return
  }
  if (fields.section === 'work') {
    form.setValue(`work.${fields.index}.highlights`, fields.highlights, options)
    return
  }
  form.setValue(`projects.${fields.index}.highlights`, fields.highlights, options)
}

function Away({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="text-muted hover:text-accent text-small self-start underline">
      {children}
    </Link>
  )
}

export function DraftWithAi({
  form,
  task,
  label,
}: {
  form: UseFormReturn<Profile>
  task: GenerationTask
  /** What the button says, e.g. "Draft the bullets". */
  label: string
}) {
  const { data, isPending } = authClient.useSession()
  const { state, start, stop, dismiss } = useGeneration()
  const [asking, setAsking] = useState(false)

  // Read at the moment it is needed rather than watched: the form hands back a
  // new object every keystroke, and subscribing here would re-render every
  // entry in the resume on each one.
  const run = () => start({ profile: form.getValues(), task })

  const request = () => {
    if (consented()) {
      run()
      return
    }
    setAsking(true)
  }

  // Nothing is drawn until the session is known. A control that appears as
  // "sign in" and then turns into a button is worse than one that arrives late.
  if (isPending) return null
  if (!data) return <Away href="/sign-in">Sign in to draft this with AI</Away>
  if (!data.user.emailVerified) {
    return <Away href="/resend-verification">Confirm your address to draft with AI</Away>
  }

  const working = state.status === 'working'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button className="self-start" onClick={request} disabled={working}>
          {working ? 'Writing…' : label}
        </Button>
        {working && (
          <Button variant="quiet" onClick={stop}>
            Stop
          </Button>
        )}
      </div>

      {state.status === 'failed' && <p className="text-flag text-small">{state.message}</p>}

      {state.status === 'proposed' && (
        <div className="border-hairline bg-surface-sunk rounded-panel flex flex-col gap-3 border p-3">
          <p className="text-muted text-micro font-mono uppercase">A draft</p>
          {state.fields.kind === 'summary' ? (
            <p className="text-strong text-small leading-relaxed">{state.fields.summary}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {state.fields.highlights.map((line, index) => (
                <li key={index} className="text-strong text-small leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted text-small">
            Written from what you have already put in. Read it before you use it — only you can say
            whether it is true, and it goes out under your name.
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                apply(form, state.fields)
                dismiss()
              }}
            >
              Use this
            </Button>
            <Button onClick={dismiss}>Discard</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={asking}
        title="Send this resume to be drafted?"
        body="Drafting sends the facts in this resume to Anthropic, which writes the text. Their terms say they may not train on what is sent. Career Forge stores none of it, and nothing reaches your resume until you press Use this. You will not be asked again in this browser."
        confirmLabel="Send it"
        cancelLabel="Not now"
        onConfirm={() => {
          remember()
          setAsking(false)
          run()
        }}
        onCancel={() => setAsking(false)}
      />
    </div>
  )
}
