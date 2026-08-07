'use client'

import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form'
import type { DocumentSection } from '@/lib/resume/document'
import type { Profile } from '@/lib/resume/profile'
import { EntryCard, FormSection } from './entry-card'
import { Button, Field, TextArea } from './fields'
import { OptionalField } from './optional-field'

/**
 * The form the user actually edits. Bound to the profile schema, which is also
 * what the compiler and the importer use — one definition of what a resume is.
 *
 * Only the sections the document contains are shown. Adding Languages under
 * Layout is what makes a Languages form appear here, so the form never asks for
 * something the document has no room for, and adding a section is never a dead
 * end with nowhere to type.
 */

type Form = UseFormReturn<Profile>

/**
 * Bullets are edited as one per line in a textarea rather than as nested field
 * arrays. Typing, reordering and deleting bullets is what people spend their
 * time doing here, and a plain textarea does all three faster than any set of
 * controls we could build around individual inputs.
 */
function LineList({
  form,
  name,
  label,
  hint,
}: {
  form: Form
  name:
    `work.${number}.highlights` | `projects.${number}.highlights` | `education.${number}.courses`
  label: string
  hint: string
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <TextArea
          label={label}
          hint={hint}
          rows={4}
          name={field.name}
          ref={field.ref}
          value={(field.value ?? []).join('\n')}
          onChange={(event) =>
            field.onChange(
              event.target.value
                .split('\n')
                .map((line) => line.replace(/^[-•*]\s*/, ''))
                .filter((line) => line.trim() !== ''),
            )
          }
        />
      )}
    />
  )
}

/** Comma-separated values in one input, which is how people type a list. */
function KeywordField({
  form,
  name,
  label,
  hint,
  placeholder,
}: {
  form: Form
  name: `projects.${number}.keywords` | `skills.${number}.keywords`
  label: string
  hint: string
  placeholder?: string
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Field
          label={label}
          hint={hint}
          placeholder={placeholder}
          name={field.name}
          ref={field.ref}
          value={(field.value ?? []).join(', ')}
          onChange={(event) =>
            field.onChange(
              event.target.value
                .split(',')
                .map((keyword) => keyword.trim())
                .filter(Boolean),
            )
          }
        />
      )}
    />
  )
}

/**
 * GitHub and LinkedIn live in the same list as any other profile, so both
 * inputs are driven by one controller — two controllers on the same array would
 * each overwrite the other's edit.
 */
function ProfileLinks({ form }: { form: Form }) {
  return (
    <Controller
      control={form.control}
      name="basics.profiles"
      render={({ field }) => {
        const list = field.value ?? []
        const update = (network: string, url: string) => {
          const index = list.findIndex(
            (profile) => profile.network?.toLowerCase() === network.toLowerCase(),
          )
          const next = [...list]
          if (index >= 0) {
            if (url.trim()) next[index] = { ...next[index], url }
            else next.splice(index, 1)
          } else if (url.trim()) {
            next.push({ network, url })
          }
          field.onChange(next)
        }
        const valueFor = (network: string) =>
          list.find((profile) => profile.network?.toLowerCase() === network.toLowerCase())?.url ??
          ''

        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="GitHub"
              placeholder="github.com/you"
              name="basics.profiles.github"
              value={valueFor('GitHub')}
              onChange={(event) => update('GitHub', event.target.value)}
            />
            <Field
              label="LinkedIn"
              placeholder="linkedin.com/in/you"
              name="basics.profiles.linkedin"
              value={valueFor('LinkedIn')}
              onChange={(event) => update('LinkedIn', event.target.value)}
            />
          </div>
        )
      }}
    />
  )
}

export function ProfileForm({ form, sections }: { form: Form; sections: DocumentSection[] }) {
  const { register, control, formState } = form
  // Hooks cannot be called conditionally, so every list is prepared and only
  // the blocks the document asks for are rendered.
  const work = useFieldArray({ control, name: 'work' })
  const education = useFieldArray({ control, name: 'education' })
  const projects = useFieldArray({ control, name: 'projects' })
  const skills = useFieldArray({ control, name: 'skills' })
  const languages = useFieldArray({ control, name: 'languages' })
  const certificates = useFieldArray({ control, name: 'certificates' })
  const errors = formState.errors

  const shown = new Set(sections.filter((section) => section.visible).map((section) => section.id))
  const has = (id: string) => shown.has(id)

  return (
    <form className="flex flex-col" onSubmit={(event) => event.preventDefault()}>
      <FormSection title="You">
        <Field label="Full name" {...register('basics.name')} placeholder="Ana Ruiz Peña" />
        <Field
          label="Headline"
          hint="Sits under your name. Leave it empty if you would rather not have one."
          placeholder="ML Engineer | Data Scientist"
          {...register('basics.label')}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Email"
            type="email"
            placeholder="ana@example.com"
            error={errors.basics?.email?.message}
            {...register('basics.email')}
          />
          <Field label="Phone" placeholder="+51 999 888 777" {...register('basics.phone')} />
          <Field label="City" placeholder="Lima" {...register('basics.location.city')} />
          <Field label="Country" placeholder="PE" {...register('basics.location.countryCode')} />
        </div>
        <Field
          label="Website"
          hint="No need to type https://."
          placeholder="anaruiz.me"
          error={errors.basics?.url?.message}
          {...register('basics.url')}
        />
        <ProfileLinks form={form} />
        {has('summary') && (
          <TextArea
            label="Summary"
            hint="Two or three sentences. What you do, and the evidence for it."
            {...register('basics.summary')}
          />
        )}
      </FormSection>

      {has('work') && (
        <FormSection title="Experience" count={work.fields.length}>
          <ul className="flex flex-col gap-3">
            {work.fields.map((item, index) => (
              <EntryCard
                key={item.id}
                index={index}
                total={work.fields.length}
                title={form.watch(`work.${index}.position`) ?? ''}
                onRemove={() => work.remove(index)}
                onMove={(direction) => work.move(index, index + direction)}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role" {...register(`work.${index}.position`)} />
                  <Field label="Employer" {...register(`work.${index}.name`)} />
                  <Field
                    label="Started"
                    placeholder="2023-02"
                    error={errors.work?.[index]?.startDate?.message}
                    {...register(`work.${index}.startDate`)}
                  />
                  <Field
                    label="Ended"
                    hint="Leave empty if this is your current role."
                    placeholder="2024-06"
                    error={errors.work?.[index]?.endDate?.message}
                    {...register(`work.${index}.endDate`)}
                  />
                </div>
                <LineList
                  form={form}
                  name={`work.${index}.highlights`}
                  label="What you did"
                  hint="One per line. Lead with the outcome and put a number on it."
                />
              </EntryCard>
            ))}
          </ul>
          <Button onClick={() => work.append({ position: '', name: '' })}>Add a role</Button>
        </FormSection>
      )}

      {has('projects') && (
        <FormSection title="Projects" count={projects.fields.length}>
          <ul className="flex flex-col gap-3">
            {projects.fields.map((item, index) => (
              <EntryCard
                key={item.id}
                index={index}
                total={projects.fields.length}
                title={form.watch(`projects.${index}.name`) ?? ''}
                onRemove={() => projects.remove(index)}
                onMove={(direction) => projects.move(index, index + direction)}
              >
                <Field label="Name" {...register(`projects.${index}.name`)} />
                <OptionalField
                  label="Add stack"
                  hasValue={(form.watch(`projects.${index}.keywords`) ?? []).length > 0}
                >
                  <KeywordField
                    form={form}
                    name={`projects.${index}.keywords`}
                    label="Built with"
                    hint="Separated by commas."
                    placeholder="Python, Pandas, SQL"
                  />
                </OptionalField>
                <OptionalField
                  label="Add link"
                  hasValue={Boolean(form.watch(`projects.${index}.url`))}
                >
                  <Field
                    label="Link"
                    placeholder="github.com/you/project"
                    error={errors.projects?.[index]?.url?.message}
                    {...register(`projects.${index}.url`)}
                  />
                </OptionalField>
                <LineList
                  form={form}
                  name={`projects.${index}.highlights`}
                  label="Worth pointing out"
                  hint="One per line."
                />
              </EntryCard>
            ))}
          </ul>
          <Button onClick={() => projects.append({ name: '' })}>Add a project</Button>
        </FormSection>
      )}

      {has('education') && (
        <FormSection title="Education" count={education.fields.length}>
          <ul className="flex flex-col gap-3">
            {education.fields.map((item, index) => (
              <EntryCard
                key={item.id}
                index={index}
                total={education.fields.length}
                title={form.watch(`education.${index}.institution`) ?? ''}
                onRemove={() => education.remove(index)}
                onMove={(direction) => education.move(index, index + direction)}
              >
                <Field label="Institution" {...register(`education.${index}.institution`)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Qualification"
                    placeholder="BSc"
                    {...register(`education.${index}.studyType`)}
                  />
                  <Field
                    label="Field"
                    placeholder="Computer Science"
                    {...register(`education.${index}.area`)}
                  />
                  <Field
                    label="Started"
                    placeholder="2016"
                    error={errors.education?.[index]?.startDate?.message}
                    {...register(`education.${index}.startDate`)}
                  />
                  <Field
                    label="Ended"
                    placeholder="2020"
                    error={errors.education?.[index]?.endDate?.message}
                    {...register(`education.${index}.endDate`)}
                  />
                </div>
                <OptionalField
                  label="Add details"
                  hasValue={(form.watch(`education.${index}.courses`) ?? []).length > 0}
                >
                  <LineList
                    form={form}
                    name={`education.${index}.courses`}
                    label="Details"
                    hint="One per line. GPA, honours, coursework worth naming."
                  />
                </OptionalField>
              </EntryCard>
            ))}
          </ul>
          <Button onClick={() => education.append({ institution: '' })}>Add a school</Button>
        </FormSection>
      )}

      {has('skills') && (
        <FormSection title="Skills" count={skills.fields.length}>
          <ul className="flex flex-col gap-3">
            {skills.fields.map((item, index) => (
              <EntryCard
                key={item.id}
                index={index}
                total={skills.fields.length}
                title={form.watch(`skills.${index}.name`) ?? ''}
                onRemove={() => skills.remove(index)}
                onMove={(direction) => skills.move(index, index + direction)}
              >
                <Field
                  label="Group"
                  placeholder="Machine learning"
                  {...register(`skills.${index}.name`)}
                />
                <KeywordField
                  form={form}
                  name={`skills.${index}.keywords`}
                  label="Skills"
                  hint="Separated by commas. Only list what you could be asked about."
                  placeholder="PyTorch, scikit-learn"
                />
              </EntryCard>
            ))}
          </ul>
          <Button onClick={() => skills.append({ name: '', keywords: [] })}>Add a group</Button>
        </FormSection>
      )}

      {has('languages') && (
        <FormSection title="Languages" count={languages.fields.length}>
          <ul className="flex flex-col gap-3">
            {languages.fields.map((item, index) => (
              <EntryCard
                key={item.id}
                index={index}
                total={languages.fields.length}
                title={form.watch(`languages.${index}.language`) ?? ''}
                onRemove={() => languages.remove(index)}
                onMove={(direction) => languages.move(index, index + direction)}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Language"
                    placeholder="Spanish"
                    {...register(`languages.${index}.language`)}
                  />
                  <Field
                    label="Level"
                    placeholder="Native"
                    {...register(`languages.${index}.fluency`)}
                  />
                </div>
              </EntryCard>
            ))}
          </ul>
          <Button onClick={() => languages.append({ language: '' })}>Add a language</Button>
        </FormSection>
      )}

      {has('certificates') && (
        <FormSection title="Certifications" count={certificates.fields.length}>
          <ul className="flex flex-col gap-3">
            {certificates.fields.map((item, index) => (
              <EntryCard
                key={item.id}
                index={index}
                total={certificates.fields.length}
                title={form.watch(`certificates.${index}.name`) ?? ''}
                onRemove={() => certificates.remove(index)}
                onMove={(direction) => certificates.move(index, index + direction)}
              >
                <Field label="Name" {...register(`certificates.${index}.name`)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Issued by" {...register(`certificates.${index}.issuer`)} />
                  <Field
                    label="Date"
                    placeholder="2025-04"
                    error={errors.certificates?.[index]?.date?.message}
                    {...register(`certificates.${index}.date`)}
                  />
                </div>
              </EntryCard>
            ))}
          </ul>
          <Button onClick={() => certificates.append({ name: '' })}>Add a certification</Button>
        </FormSection>
      )}
    </form>
  )
}
