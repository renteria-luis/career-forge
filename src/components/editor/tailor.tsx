'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { UseFormReturn } from 'react-hook-form'
import type { GeneratedFields, ModelChoice } from '@/lib/ai/fields'
import { authClient } from '@/lib/auth/client'
import { hasConsented, rememberConsent } from '@/lib/editor/drafting'
import { useGeneration } from '@/lib/editor/use-generation'
import type { Brief } from '@/lib/ai/tasks'
import type { ResumeDocument } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import { ConfirmDialog } from './confirm-dialog'
import { Button, Progress } from './fields'

/**
 * Aims the whole resume at one advert.
 *
 * The single-field buttons rephrase what is already there. This is the one that
 * earns the brief: it reads the advert and the raw material, decides which of a
 * career answers this job, and rewrites the bullets to lead with it.
 *
 * What comes back changes two things and neither is destructive. Profile fields
 * — the summary, the bullets — are written into the form, where they can be
 * edited or undone. Which entries appear is a **document** decision, so it goes
 * to `entryIds` and nothing is removed from the profile. That split is the whole
 * reason one career can answer a dozen adverts without losing anything.
 */

type Tailored = Extract<GeneratedFields, { kind: 'tailored' }>

/** A section the document does not contain cannot be told which entries to show. */
function selectEntries(
  document: ResumeDocument,
  id: 'work' | 'projects' | 'skills',
  indices: number[],
): ResumeDocument['sections'] {
  return document.sections.map((section) =>
    section.kind === 'standard' && section.id === id
      ? { ...section, entryIds: indices.map(String) }
      : section,
  )
}

function apply(
  form: UseFormReturn<Profile>,
  document: ResumeDocument,
  onDocumentChange: (document: ResumeDocument) => void,
  fields: Tailored,
): void {
  const options = { shouldDirty: true, shouldValidate: true } as const
  form.setValue('basics.summary', fields.summary, options)
  for (const entry of fields.work) {
    form.setValue(`work.${entry.index}.highlights`, entry.highlights, options)
  }
  for (const entry of fields.projects) {
    form.setValue(`projects.${entry.index}.highlights`, entry.highlights, options)
  }

  let sections = selectEntries(
    document,
    'work',
    fields.work.map((entry) => entry.index),
  )
  sections = selectEntries(
    { ...document, sections },
    'projects',
    fields.projects.map((e) => e.index),
  )
  sections = selectEntries({ ...document, sections }, 'skills', fields.skills)
  onDocumentChange({ ...document, sections })
}

/** "2 of 5", said the way somebody checking the result would say it. */
function kept(chosen: number, available: number, noun: string): string {
  return `${chosen} of ${available} ${available === 1 ? noun : `${noun}s`}`
}

export function Tailor({
  form,
  document,
  brief,
  choice,
  onDocumentChange,
}: {
  form: UseFormReturn<Profile>
  document: ResumeDocument
  brief: Brief
  choice: ModelChoice
  onDocumentChange: (document: ResumeDocument) => void
}) {
  const { data, isPending } = authClient.useSession()
  const { state, start, stop, dismiss } = useGeneration()
  const [asking, setAsking] = useState(false)

  const working = state.status === 'working'
  const ready = Boolean(brief.target.posting)

  const run = () => start({ profile: form.getValues(), brief, task: { kind: 'tailor' }, choice })
  const request = () => {
    if (hasConsented()) {
      run()
      return
    }
    setAsking(true)
  }

  if (isPending) return null
  if (!data) {
    return (
      <Link
        href="/sign-in"
        className="text-muted hover:text-accent text-small self-start underline"
      >
        Sign in to aim your resume at this job
      </Link>
    )
  }
  if (!data.user.emailVerified) {
    return (
      <Link
        href="/resend-verification"
        className="text-muted hover:text-accent text-small self-start underline"
      >
        Confirm your address to aim your resume at this job
      </Link>
    )
  }

  const proposal =
    state.status === 'proposed' && state.fields.kind === 'tailored' ? state.fields : null
  const profile = form.getValues()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          className="shrink-0"
          onClick={request}
          disabled={working || !ready}
        >
          {working ? 'Aiming…' : 'Aim my resume at this job'}
        </Button>
        {working && (
          <>
            <Progress label="Aiming the resume at this job" />
            <Button variant="quiet" className="shrink-0" onClick={stop}>
              Stop
            </Button>
          </>
        )}
      </div>

      {!ready && (
        <p className="text-muted text-small">
          Paste the advert above and this has something to aim at.
        </p>
      )}

      {state.status === 'failed' && <p className="text-flag text-small">{state.message}</p>}

      {proposal && (
        <div className="border-hairline bg-surface-sunk rounded-panel flex flex-col gap-4 border p-4">
          <div>
            <p className="text-muted text-micro font-mono uppercase">A draft aimed at this job</p>
            <p className="text-muted text-small mt-2">
              {[
                kept(proposal.work.length, profile.work?.length ?? 0, 'job'),
                kept(proposal.projects.length, profile.projects?.length ?? 0, 'project'),
                kept(proposal.skills.length, profile.skills?.length ?? 0, 'skill group'),
              ].join(' · ')}
              . Nothing is deleted: what is left out is hidden from this document and stays in your
              profile.
            </p>
          </div>

          <div>
            <p className="text-muted text-micro font-mono uppercase">Summary</p>
            <p className="text-strong text-small mt-1 leading-relaxed">{proposal.summary}</p>
          </div>

          {proposal.work.map((entry) => (
            <div key={`work-${entry.index}`}>
              <p className="text-muted text-micro font-mono uppercase">
                {profile.work?.[entry.index]?.position ?? `Job ${entry.index + 1}`}
              </p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {entry.highlights.map((line, index) => (
                  <li key={index} className="text-strong text-small leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {proposal.projects.map((entry) => (
            <div key={`project-${entry.index}`}>
              <p className="text-muted text-micro font-mono uppercase">
                {profile.projects?.[entry.index]?.name ?? `Project ${entry.index + 1}`}
              </p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {entry.highlights.map((line, index) => (
                  <li key={index} className="text-strong text-small leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="text-muted text-small">
            Read it before you use it. It chose which of your career to show and rewrote the words;
            only you can say whether it got you right, and it goes out under your name.
          </p>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                apply(form, document, onDocumentChange, proposal)
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
        body="Drafting sends the facts in this resume, the advert and your raw material to a model, which writes the text. Career Forge stores none of it, and nothing reaches your resume until you press Use this. You will not be asked again in this browser."
        confirmLabel="Send it"
        cancelLabel="Not now"
        onConfirm={() => {
          rememberConsent()
          setAsking(false)
          run()
        }}
        onCancel={() => setAsking(false)}
      />
    </div>
  )
}
