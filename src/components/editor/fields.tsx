'use client'

import { useId } from 'react'
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'

/**
 * Form primitives.
 *
 * Every field is labelled and every error is tied to its input with
 * aria-describedby, because this form is the only way into the product and a
 * screen reader user has to be able to fill it in.
 */

const control =
  'w-full rounded-edge border border-hairline bg-surface px-3 py-2 text-body text-strong ' +
  'placeholder:text-muted/70 focus:border-accent focus:outline-none ' +
  'aria-[invalid=true]:border-flag'

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-muted text-small font-medium">
      {children}
    </label>
  )
}

function Error({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-flag text-small">
      {message}
    </p>
  )
}

interface FieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
  label: string
  hint?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

export function Field({ label, hint, error, className, ref, ...props }: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={control}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-muted text-small">
          {hint}
        </p>
      )}
      <Error id={errorId} message={error} />
    </div>
  )
}

interface TextAreaProps extends Omit<ComponentPropsWithoutRef<'textarea'>, 'id'> {
  label: string
  hint?: string
  error?: string
  ref?: Ref<HTMLTextAreaElement>
}

export function TextArea({ label, hint, error, className, ref, ...props }: TextAreaProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        ref={ref}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`${control} resize-y leading-relaxed`}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-muted text-small">
          {hint}
        </p>
      )}
      <Error id={errorId} message={error} />
    </div>
  )
}

interface SelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'id'> {
  label: string
  hint?: string
}

export function Select({ label, hint, className, children, ...props }: SelectProps) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={control} {...props}>
        {children}
      </select>
      {hint && <p className="text-muted text-small">{hint}</p>}
    </div>
  )
}

interface SliderProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id' | 'type'> {
  label: string
  /** Rendered next to the label, e.g. "10.5 pt". */
  value: string
}

export function Slider({ label, value, className, ...props }: SliderProps) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-muted text-micro font-mono">{value}</span>
      </div>
      <input id={id} type="range" className="accent-accent w-full" {...props} />
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent size-4 shrink-0"
      />
      <label htmlFor={id} className="text-strong text-small select-none">
        {label}
      </label>
    </div>
  )
}

/** A small run of mutually exclusive choices, for settings with two or three. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div
      className="border-hairline rounded-edge flex items-center border p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const current = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={current}
            onClick={() => onChange(option.value)}
            className={`rounded-edge text-micro px-2.5 py-1 font-mono transition-colors ${
              current ? 'bg-accent text-paper' : 'text-muted hover:text-strong'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ComponentPropsWithoutRef<'button'> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  const styles = {
    primary: 'bg-accent text-paper hover:opacity-90',
    secondary: 'border border-hairline text-strong hover:border-accent hover:text-accent',
    quiet: 'text-muted hover:text-accent',
  }[variant]
  return (
    <button
      type="button"
      className={`rounded-edge text-small px-3 py-1.5 font-medium transition-colors transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className ?? ''}`}
      {...props}
    />
  )
}
