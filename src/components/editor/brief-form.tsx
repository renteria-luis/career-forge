'use client'

import type { UseFormReturn } from 'react-hook-form'
import type { ModelChoice } from '@/lib/ai/fields'
import type { ResumeDocument } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import type { CareerNotes, JobTarget } from '@/lib/resume/brief'
import { MAX_NOTES, MAX_POSTING, MAX_VOICE } from '@/lib/resume/brief'
import { FormSection } from './entry-card'
import { Field, Switch, TextArea, Toggle } from './fields'
import { Tailor } from './tailor'

/**
 * The pane that never reaches the PDF.
 *
 * Everything here is material for drafting: the advert a resume is being aimed
 * at, and the things about a person that a resume has no line for. The page
 * says so at the top, because a form that looks like every other form and then
 * changes nothing in the preview is a form people assume is broken.
 */

/** How full a bounded field is, once it is worth knowing. */
function Fill({ value, max }: { value: string | undefined; max: number }) {
  const used = value?.length ?? 0
  // Silent until it matters. A counter under an empty box is noise.
  if (used < max * 0.6) return null
  return (
    <p className={`text-micro font-mono ${used >= max ? 'text-flag' : 'text-muted'}`}>
      {used.toLocaleString()} / {max.toLocaleString()}
    </p>
  )
}

export function BriefForm({
  form,
  document,
  notes,
  target,
  choice,
  onNotesChange,
  onTargetChange,
  onChoiceChange,
  onDocumentChange,
}: {
  form: UseFormReturn<Profile>
  document: ResumeDocument
  notes: CareerNotes
  target: JobTarget
  choice: ModelChoice
  onNotesChange: (notes: CareerNotes) => void
  onTargetChange: (target: JobTarget) => void
  onChoiceChange: (choice: ModelChoice) => void
  onDocumentChange: (document: ResumeDocument) => void
}) {
  const setTarget = (patch: Partial<JobTarget>) => onTargetChange({ ...target, ...patch })
  const setNotes = (patch: Partial<CareerNotes>) => onNotesChange({ ...notes, ...patch })

  const automatic = choice === 'auto'
  // Under Automatic the switch shows what Automatic is actually using, so
  // clearing the checkbox never moves it. What you were looking at is what you
  // get.
  const paid = choice === 'best'

  return (
    <div className="flex flex-col">
      <p className="text-muted text-small border-hairline border-b pb-4">
        None of this appears in your PDF. It is what the drafting reads: the job you are aiming at,
        and the things about you that a resume has no line for.
      </p>

      <FormSection title="The job">
        <div className="grid gap-3 @md:grid-cols-2">
          <Field
            label="Company"
            placeholder="Nomad Analytics"
            value={target.company ?? ''}
            onChange={(event) => setTarget({ company: event.target.value })}
          />
          <Field
            label="Role"
            placeholder="Senior ML Engineer"
            value={target.role ?? ''}
            onChange={(event) => setTarget({ role: event.target.value })}
          />
        </div>
        <Field
          label="Link to the posting"
          placeholder="company.com/careers/123"
          value={target.url ?? ''}
          onChange={(event) => setTarget({ url: event.target.value })}
        />
        <TextArea
          label="The posting"
          hint="Paste the whole advert. What it asks for is what a tailored resume answers."
          rows={12}
          value={target.posting ?? ''}
          onChange={(event) => setTarget({ posting: event.target.value.slice(0, MAX_POSTING) })}
        />
        <Fill value={target.posting} max={MAX_POSTING} />

        {/* Placed here rather than beside the resume, because this is the one
            control that needs the advert directly above it to make sense. */}
        <Tailor
          form={form}
          document={document}
          brief={{ notes, target }}
          choice={choice}
          onDocumentChange={onDocumentChange}
        />
      </FormSection>

      <FormSection title="Raw material">
        <TextArea
          label="Everything you have not put on the resume yet"
          hint="Numbers, what a project actually did, what went wrong and how it got fixed. Untidy is fine. Drafting can only phrase facts it has been given, so this is what decides whether a draft has anything to say."
          rows={12}
          value={notes.notes ?? ''}
          onChange={(event) => setNotes({ notes: event.target.value.slice(0, MAX_NOTES) })}
        />
        <Fill value={notes.notes} max={MAX_NOTES} />
      </FormSection>

      <FormSection title="Your voice">
        <TextArea
          label="How you write, and what you care about"
          hint="A cover letter that sounds like you needs somewhere to learn that from, and a work history is not it. Plain or formal, what drew you to the field, what you will not claim."
          rows={6}
          value={notes.voice ?? ''}
          onChange={(event) => setNotes({ voice: event.target.value.slice(0, MAX_VOICE) })}
        />
        <Fill value={notes.voice} max={MAX_VOICE} />
      </FormSection>

      <FormSection title="Drafting">
        <Toggle
          label="Choose the model for me"
          checked={choice === 'auto'}
          onChange={(automatic) => onChoiceChange(automatic ? 'auto' : 'free')}
        />

        {/* The two ends are both a real answer, so the words stay put and the
            switch moves between them. The one in use is the one in full
            contrast; under Automatic neither is, because neither was chosen. */}
        <div className="flex items-center gap-3">
          <span
            className={`text-small ${automatic ? 'text-muted' : paid ? 'text-muted' : 'text-strong font-medium'}`}
          >
            Free
          </span>
          <Switch
            label="Use the best model"
            checked={paid}
            disabled={automatic}
            onChange={(best) => onChoiceChange(best ? 'best' : 'free')}
          />
          <span
            className={`text-small ${automatic ? 'text-muted' : paid ? 'text-strong font-medium' : 'text-muted'}`}
          >
            Best
          </span>
        </div>

        <p className="text-muted text-small">
          {automatic
            ? 'Automatic sends both of these drafts to the free model, because rewriting your own bullets is vocabulary rather than writing anybody judges you by. The paid one takes over when there is a cover letter.'
            : paid
              ? 'Every draft goes to Claude. About a cent each, against the balance on your provider workspace.'
              : 'Every draft goes to Gemini Flash, which costs nothing.'}
        </p>

        <p className="text-muted text-small">
          The free model is free because what it is sent trains it. That is a decision about your
          own resume and nobody else&apos;s, which is why this switch exists at all.
        </p>
      </FormSection>
    </div>
  )
}
