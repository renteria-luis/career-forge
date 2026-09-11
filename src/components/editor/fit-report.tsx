'use client'

import { useEffect, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { GeneratedFields, ModelChoice, RequirementFinding } from '@/lib/ai/fields'
import type { Brief } from '@/lib/ai/tasks'
import { useGeneration } from '@/lib/editor/use-generation'
import type { CareerNotes } from '@/lib/resume/brief'
import type { Profile } from '@/lib/resume/profile'
import { Button, Field, Progress, Select } from './fields'
import { FreeQuotaLine } from './free-quota-line'

/**
 * How this resume answers one advert, read rather than written.
 *
 * Two numbers on this screen are arithmetic and one sentence per requirement is
 * a model's reading. The score is counted from the verdicts and the durations
 * are a union of date ranges, so both can be checked by hand — which is the
 * whole reason they are not in what the model returns.
 */

type Fit = Extract<GeneratedFields, { kind: 'fit' }>

/**
 * Which gaps a person can close from here.
 *
 * A skill, a length of experience or a language can be something the resume
 * failed to mention. A degree cannot, and neither can a city — those are
 * answered by studying or by moving, not by a button, and offering one would be
 * offering to lie.
 */
const CLOSEABLE = new Set(['skill', 'experience', 'language', 'other'])

const VERDICT: Record<RequirementFinding['verdict'], { label: string; className: string }> = {
  met: { label: 'Met', className: 'border-accent/50 text-accent bg-accent-sunk' },
  partly: { label: 'Partly', className: 'border-extract/40 text-extract bg-extract-sunk' },
  unmet: { label: 'Missing', className: 'border-flag/40 text-flag bg-flag-sunk' },
  unknown: {
    label: 'Not said',
    className: 'border-hairline text-muted bg-surface-sunk',
  },
}

/** "3 yrs 7 mos", which is how long a thing sounds when somebody says it. */
function duration(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${rest} mo`
  if (rest === 0) return `${years} yr`
  return `${years} yr ${rest} mo`
}

function Meter({ score, totalMonths }: { score: number; totalMonths: number | null }) {
  return (
    <div className="flex items-center gap-4">
      <p className="text-strong font-display text-display-m tabular-nums">
        {score}
        <span className="text-muted text-title">/100</span>
      </p>
      <div className="min-w-0 flex-1">
        <div
          role="meter"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="How this resume answers the advert"
          className="bg-surface-sunk border-hairline h-2 w-full overflow-hidden rounded-full border"
        >
          <div className="bg-accent h-full" style={{ width: `${score}%` }} />
        </div>
        <p className="text-muted text-micro mt-2 font-mono">
          counted from the verdicts below
          {totalMonths !== null && ` · your paid history: ${duration(totalMonths)}`}
        </p>
      </div>
    </div>
  )
}

/** The two honest answers to a requirement the resume does not show. */
function Close({
  finding,
  profile,
  learning,
  onHave,
  onLearn,
}: {
  finding: RequirementFinding
  profile: Profile
  learning: string[]
  onHave: (term: string, group: number, kind: RequirementFinding['kind']) => void
  onLearn: (term: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState(finding.requirement)
  const [group, setGroup] = useState(0)
  const groups = profile.skills ?? []
  const listed = learning.some((item) => item === finding.requirement)
  const isLanguage = finding.kind === 'language'

  if (listed) {
    return <p className="text-muted text-small mt-2">On your list to learn.</p>
  }

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => setOpen(true)}>I do have this</Button>
        <Button variant="quiet" onClick={() => onLearn(finding.requirement)}>
          I will learn it
        </Button>
      </div>
    )
  }

  return (
    <div className="border-hairline mt-3 flex flex-col gap-3 border-l-2 pl-3">
      <Field
        label="What is it called on your resume?"
        hint="The advert's words are rarely the ones you would use. Write yours."
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      {!isLanguage && groups.length > 0 && (
        <Select
          label="Which group does it belong in?"
          value={String(group)}
          onChange={(event) => setGroup(Number(event.target.value))}
        >
          {groups.map((skill, index) => (
            <option key={index} value={index}>
              {skill.name ?? `Group ${index + 1}`}
            </option>
          ))}
        </Select>
      )}
      <p className="text-muted text-small">
        {isLanguage
          ? 'It goes into your languages. Set how well you speak it under Content — an advert that asks for a language usually asks for a level.'
          : 'Then add a bullet that shows it. A skill with nothing behind it is the next thing this report will mark as unproven, and the first thing an interview asks about.'}
      </p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={term.trim() === '' || (!isLanguage && groups.length === 0)}
          onClick={() => {
            onHave(term.trim(), group, finding.kind)
            setOpen(false)
          }}
        >
          Add it
        </Button>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {!isLanguage && groups.length === 0 && (
        <p className="text-flag text-small">
          Add a skills section under Content first, and this has somewhere to put it.
        </p>
      )}
    </div>
  )
}

function Finding({
  finding,
  profile,
  learning,
  onHave,
  onLearn,
}: {
  finding: RequirementFinding
  profile: Profile
  learning: string[]
  onHave: (term: string, group: number, kind: RequirementFinding['kind']) => void
  onLearn: (term: string) => void
}) {
  const verdict = VERDICT[finding.verdict]
  const where = finding.evidence
    .map((ref) =>
      ref.section === 'work'
        ? (profile.work?.[ref.index]?.name ?? profile.work?.[ref.index]?.position)
        : ref.section === 'projects'
          ? profile.projects?.[ref.index]?.name
          : ref.section === 'education'
            ? profile.education?.[ref.index]?.institution
            : profile.skills?.[ref.index]?.name,
    )
    .filter(Boolean)

  return (
    <li className="border-hairline border-t py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-edge text-micro border px-1.5 py-0.5 font-mono ${verdict.className}`}
        >
          {verdict.label}
        </span>
        {finding.months !== null && (
          <span className="text-muted text-micro font-mono">
            {duration(finding.months)} of it in your history
          </span>
        )}
      </div>
      <p className="text-strong text-small mt-2 font-medium">{finding.requirement}</p>
      <p className="text-muted text-small mt-1">{finding.note}</p>
      {where.length > 0 && (
        <p className="text-muted text-micro mt-1 font-mono">from {where.join(', ')}</p>
      )}
      {(finding.verdict === 'unmet' || finding.verdict === 'unknown') &&
        CLOSEABLE.has(finding.kind) && (
          <Close
            finding={finding}
            profile={profile}
            learning={learning}
            onHave={onHave}
            onLearn={onLearn}
          />
        )}
    </li>
  )
}

export function FitReport({
  form,
  brief,
  choice,
  report,
  stale,
  onReport,
  onNotesChange,
}: {
  form: UseFormReturn<Profile>
  brief: Brief
  choice: ModelChoice
  report: Fit | null
  /** True when the resume or the advert has changed since this was written. */
  stale: boolean
  onReport: (report: Fit | null) => void
  onNotesChange: (notes: CareerNotes) => void
}) {
  const { state, freeQuota, start, stop, dismiss } = useGeneration()
  const working = state.status === 'working'
  const ready = Boolean(brief.target.posting)

  /**
   * The hook hands back a proposal, and this screen has nothing to propose.
   *
   * A report is read, not accepted, so it is taken as soon as it arrives and
   * handed up to the editor — which is what lets it survive switching panes and
   * lets the editor notice when the resume has moved underneath it.
   */
  useEffect(() => {
    if (state.status !== 'proposed' || state.fields.kind !== 'fit') return
    onReport(state.fields)
    dismiss()
  }, [state, onReport, dismiss])

  const profile = form.getValues()

  const options = { shouldDirty: true, shouldValidate: true } as const

  const addTerm = (term: string, group: number, kind: RequirementFinding['kind']) => {
    // A language is not a skill keyword. Putting it in the skills line is how a
    // resume ends up saying "French" next to "PyTorch".
    if (kind === 'language') {
      const languages = profile.languages ?? []
      if (languages.some((item) => item.language?.toLowerCase() === term.toLowerCase())) return
      form.setValue('languages', [...languages, { language: term }], options)
      return
    }

    const existing = profile.skills?.[group]?.keywords ?? []
    if (existing.some((keyword) => keyword.toLowerCase() === term.toLowerCase())) return
    form.setValue(`skills.${group}.keywords`, [...existing, term], options)
  }

  const addLearning = (term: string) => {
    if (learning.some((item) => item.toLowerCase() === term.toLowerCase())) return
    // Bounded here as well as at the boundary. A requirement as an advert words
    // it runs long, and one character over used to fail the next request with
    // nothing but "that does not match the expected shape".
    onNotesChange({ ...brief.notes, learning: [...learning, term.slice(0, 160)].slice(0, 30) })
  }

  const learning = brief.notes.learning ?? []
  const required = report?.requirements.filter((r) => r.importance === 'required') ?? []
  const preferred = report?.requirements.filter((r) => r.importance === 'preferred') ?? []

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 pt-2 pb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            className="shrink-0"
            onClick={() =>
              start({ profile: form.getValues(), brief, task: { kind: 'fit' }, choice })
            }
            disabled={working || !ready}
          >
            {working ? 'Reading…' : report ? 'Check it again' : 'Check against this job'}
          </Button>
          {working && (
            <>
              <Progress label="Reading the resume against the advert" />
              <Button variant="quiet" className="shrink-0" onClick={stop}>
                Stop
              </Button>
            </>
          )}
        </div>

        {!ready && (
          <p className="text-muted text-small">
            Paste the advert under Brief and this has something to compare against.
          </p>
        )}
        {state.status === 'failed' && <p className="text-flag text-small">{state.message}</p>}
        <FreeQuotaLine quota={freeQuota} />
        {report && stale && !working && (
          <p className="text-muted text-small">
            Your resume or the advert has changed since this was written. Check it again to see what
            moved.
          </p>
        )}
      </div>

      {report && (
        <div className="flex flex-col gap-8 pb-6">
          <Meter score={report.score} totalMonths={report.totalMonths} />

          <section>
            <h3 className="text-strong font-display text-title">What they asked for</h3>
            <ul className="mt-2 flex flex-col">
              {required.map((finding, index) => (
                <Finding
                  key={`req-${index}`}
                  finding={finding}
                  profile={profile}
                  learning={learning}
                  onHave={addTerm}
                  onLearn={addLearning}
                />
              ))}
            </ul>
          </section>

          {preferred.length > 0 && (
            <section>
              <h3 className="text-strong font-display text-title">What they would like</h3>
              <ul className="mt-2 flex flex-col">
                {preferred.map((finding, index) => (
                  <Finding
                    key={`pref-${index}`}
                    finding={finding}
                    profile={profile}
                    learning={learning}
                    onHave={addTerm}
                    onLearn={addLearning}
                  />
                ))}
              </ul>
            </section>
          )}

          {report.surplus.length > 0 && (
            <section>
              <h3 className="text-strong font-display text-title">What this job has no use for</h3>
              <ul className="mt-2 flex flex-col">
                {report.surplus.map((item, index) => (
                  <li key={index} className="border-hairline border-t py-3 first:border-t-0">
                    <p className="text-strong text-small font-medium">
                      {item.item}
                      <span className="text-muted ml-2 font-mono text-[0.7rem] uppercase">
                        {item.verdict === 'keep' ? 'worth the room' : 'space to reclaim'}
                      </span>
                    </p>
                    <p className="text-muted text-small mt-1">{item.why}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.recommendations.length > 0 && (
            <section>
              <h3 className="text-strong font-display text-title">If you want this kind of job</h3>
              <ul className="mt-2 flex flex-col gap-3">
                {report.recommendations.map((item, index) => (
                  <li key={index}>
                    <p className="text-strong text-small font-medium">{item.action}</p>
                    <p className="text-muted text-small mt-1">{item.because}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(brief.notes.learning ?? []).length > 0 && (
            <section>
              <h3 className="text-strong font-display text-title">Your list, not your resume</h3>
              <p className="text-muted text-small mt-1">
                Things you said you would learn. They are kept with your notes and never appear in
                the PDF.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {(brief.notes.learning ?? []).map((item) => (
                  <li
                    key={item}
                    className="border-hairline rounded-edge text-small text-muted border px-2 py-1"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
