'use client'

import {
  STANDARD_SECTIONS,
  type DocumentSection,
  type ResumeDocument,
  type StandardSectionId,
} from '@/lib/resume/document'
import {
  FONTS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  MARGIN_MAX,
  MARGIN_MIN,
  MARGIN_STEP,
  type FontId,
} from '@/lib/resume/typography'
import { FormSection } from './entry-card'
import { Button, Select, Slider, Toggle } from './fields'

/**
 * Controls the arrangement rather than the content.
 *
 * Nothing here changes a word of the resume — it changes which of the user's
 * facts appear, in what order, and how they are set. That separation is what
 * lets the same profile produce a different document for a different job.
 */

const SECTION_LABELS: Record<StandardSectionId, string> = {
  summary: 'Summary',
  work: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certificates: 'Certifications',
  awards: 'Awards',
  publications: 'Publications',
  languages: 'Languages',
  volunteer: 'Volunteering',
  interests: 'Interests',
  references: 'References',
}

export function DocumentControls({
  document,
  onChange,
}: {
  document: ResumeDocument
  onChange: (next: ResumeDocument) => void
}) {
  const setSections = (sections: DocumentSection[]) => onChange({ ...document, sections })

  const move = (index: number, direction: -1 | 1) => {
    const next = [...document.sections]
    const target = index + direction
    ;[next[index], next[target]] = [next[target], next[index]]
    setSections(next)
  }

  const present = new Set(document.sections.map((s) => s.id))
  const available = STANDARD_SECTIONS.filter((id) => !present.has(id))

  return (
    <div className="flex flex-col">
      <FormSection title="Sections" count={document.sections.filter((s) => s.visible).length}>
        <ul className="flex flex-col">
          {document.sections.map((section, index) => (
            <li
              key={section.id}
              className="border-hairline flex items-center gap-2 border-b py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <Toggle
                  label={
                    section.title ?? SECTION_LABELS[section.id as StandardSectionId] ?? section.id
                  }
                  checked={section.visible}
                  onChange={(visible) => {
                    const next = [...document.sections]
                    next[index] = { ...section, visible }
                    setSections(next)
                  }}
                />
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="quiet"
                  aria-label={`Move ${SECTION_LABELS[section.id as StandardSectionId] ?? section.id} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="px-2"
                >
                  ↑
                </Button>
                <Button
                  variant="quiet"
                  aria-label={`Move ${SECTION_LABELS[section.id as StandardSectionId] ?? section.id} down`}
                  disabled={index === document.sections.length - 1}
                  onClick={() => move(index, 1)}
                  className="px-2"
                >
                  ↓
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {available.length > 0 && (
          <Select
            label="Add a section"
            hint="It only appears once there is something in it."
            value=""
            onChange={(event) => {
              const id = event.target.value as StandardSectionId
              if (!id) return
              setSections([...document.sections, { kind: 'standard', id, visible: true }])
            }}
          >
            <option value="">Choose one…</option>
            {available.map((id) => (
              <option key={id} value={id}>
                {SECTION_LABELS[id]}
              </option>
            ))}
          </Select>
        )}
      </FormSection>

      <FormSection title="Typesetting">
        <Select
          label="Typeface"
          hint={FONTS[document.typography.font].note}
          value={document.typography.font}
          onChange={(event) =>
            onChange({
              ...document,
              typography: { ...document.typography, font: event.target.value as FontId },
            })
          }
        >
          {(Object.keys(FONTS) as FontId[]).map((id) => (
            <option key={id} value={id}>
              {FONTS[id].label}
            </option>
          ))}
        </Select>

        <Slider
          label="Body size"
          value={`${document.typography.size} pt`}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={0.5}
          defaultValue={document.typography.size}
          onChange={(event) =>
            onChange({
              ...document,
              typography: { ...document.typography, size: Number(event.target.value) },
            })
          }
        />

        <Slider
          label="Margin"
          value={`${document.typography.margin} px`}
          min={MARGIN_MIN}
          max={MARGIN_MAX}
          step={MARGIN_STEP}
          defaultValue={document.typography.margin}
          onChange={(event) =>
            onChange({
              ...document,
              typography: { ...document.typography, margin: Number(event.target.value) },
            })
          }
        />

        <Slider
          label="Spacing"
          value={`${document.typography.density.toFixed(2)}×`}
          min={0.85}
          max={1.25}
          step={0.05}
          defaultValue={document.typography.density}
          onChange={(event) =>
            onChange({
              ...document,
              typography: { ...document.typography, density: Number(event.target.value) },
            })
          }
        />

        <Slider
          label="Page limit"
          value={`${document.options.maxPages} ${document.options.maxPages === 1 ? 'page' : 'pages'}`}
          min={1}
          max={4}
          step={1}
          defaultValue={document.options.maxPages}
          onChange={(event) =>
            onChange({
              ...document,
              options: { ...document.options, maxPages: Number(event.target.value) },
            })
          }
        />
      </FormSection>

      <FormSection title="Contact details">
        <p className="text-muted text-small">
          Not every application should get every detail. These change the document, not your
          profile.
        </p>
        <div className="flex flex-col gap-2.5">
          {(
            [
              ['showEmail', 'Email'],
              ['showPhone', 'Phone'],
              ['showLocation', 'Location'],
              ['showUrl', 'Website and links'],
            ] as const
          ).map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              checked={document.options[key]}
              onChange={(checked) =>
                onChange({ ...document, options: { ...document.options, [key]: checked } })
              }
            />
          ))}
        </div>
      </FormSection>
    </div>
  )
}
