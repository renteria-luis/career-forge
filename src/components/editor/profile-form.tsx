'use client'

import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form'
import type { Profile } from '@/lib/resume/profile'
import { EntryCard, FormSection } from './entry-card'
import { Button, Field, TextArea } from './fields'

/**
 * The form the user actually edits. Bound to the profile schema, which is also
 * what the compiler and the importer use — one definition of what a resume is.
 */

type Form = UseFormReturn<Profile>

/**
 * Bullets are edited as one per line in a textarea rather than as nested field
 * arrays. Typing, reordering and deleting bullets is what people spend their
 * time doing here, and a plain textarea does all three faster than any set of
 * controls we could build around individual inputs.
 */
function Highlights({
  form,
  name,
  label,
  hint,
}: {
  form: Form
  name: `work.${number}.highlights` | `projects.${number}.highlights`
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

export function ProfileForm({ form }: { form: Form }) {
  const { register, control, formState } = form
  const work = useFieldArray({ control, name: 'work' })
  const education = useFieldArray({ control, name: 'education' })
  const projects = useFieldArray({ control, name: 'projects' })
  const skills = useFieldArray({ control, name: 'skills' })
  const errors = formState.errors

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
          placeholder="https://example.com"
          error={errors.basics?.url?.message}
          {...register('basics.url')}
        />
        <TextArea
          label="Summary"
          hint="Two or three sentences. What you do, and the evidence for it."
          {...register('basics.summary')}
        />
      </FormSection>

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
              <Highlights
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
              <Field label="What it is" {...register(`projects.${index}.description`)} />
              <Controller
                control={control}
                name={`projects.${index}.keywords`}
                render={({ field }) => (
                  <Field
                    label="Built with"
                    hint="Separated by commas."
                    placeholder="PyTorch, ONNX"
                    value={(field.value ?? []).join(', ')}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value
                          .split(',')
                          .map((k) => k.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                )}
              />
              <Highlights
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
            </EntryCard>
          ))}
        </ul>
        <Button onClick={() => education.append({ institution: '' })}>Add a qualification</Button>
      </FormSection>

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
              <Controller
                control={control}
                name={`skills.${index}.keywords`}
                render={({ field }) => (
                  <Field
                    label="Skills"
                    hint="Separated by commas. Only list what you could be asked about."
                    placeholder="PyTorch, scikit-learn"
                    value={(field.value ?? []).join(', ')}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value
                          .split(',')
                          .map((k) => k.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                )}
              />
            </EntryCard>
          ))}
        </ul>
        <Button onClick={() => skills.append({ name: '', keywords: [] })}>Add a group</Button>
      </FormSection>
    </form>
  )
}
