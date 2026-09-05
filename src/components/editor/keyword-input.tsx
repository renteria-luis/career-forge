'use client'

import { useId, useState, type Ref } from 'react'
import { hasSeparator, splitKeywords } from '@/lib/resume/keywords'
import { Button } from './fields'

/**
 * A list of keywords, edited one at a time.
 *
 * It replaces a single text input holding "Python, Pandas, SQL". That input was
 * controlled by the array, so every keystroke split the text on commas, trimmed
 * each piece and joined it back — which deleted the space the moment it was
 * typed, deleted a trailing comma the moment it was typed, and put the caret at
 * the end of the field whenever the rebuilt string differed from what was
 * there. Editing a keyword in the middle was impossible.
 *
 * Nothing here reformats what is already committed, so there is no rebuilt
 * string and no caret to move. The draft line is ordinary uncontrolled-feeling
 * text until the user says it is a keyword.
 */
export function KeywordInput({
  label,
  hint,
  placeholder,
  name,
  values,
  onChange,
  inputRef,
}: {
  label: string
  hint?: string
  placeholder?: string
  /** The form path, so clicking the line in the preview can focus this. */
  name?: string
  values: string[]
  onChange: (next: string[]) => void
  inputRef?: Ref<HTMLInputElement>
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const [draft, setDraft] = useState('')
  const [held, setHeld] = useState<number | null>(null)

  /** Moves one keyword to another's place, keeping the rest in order. */
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= values.length || to >= values.length) return
    const next = [...values]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  /**
   * Pasting "Python, Pandas" adds two, which is what the comma is for — but
   * "Python (Pandas, Regex)" adds one, because the commas inside the brackets
   * are part of the keyword rather than the ends of two.
   */
  function commit(text: string) {
    const added = splitKeywords(text)
    if (added.length === 0) return

    const next = [...values]
    for (const keyword of added) {
      // The same skill twice is always a mistake, and the page would print it
      // twice. Case-insensitive, because "SQL" and "sql" are one skill.
      const has = next.some((existing) => existing.toLowerCase() === keyword.toLowerCase())
      if (!has) next.push(keyword)
    }
    if (next.length !== values.length) onChange(next)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-muted text-small font-medium">
        {label}
      </label>

      {values.length > 0 && (
        <ul
          aria-label={`${label}, in the order they will print`}
          className="flex flex-wrap gap-1.5"
        >
          {values.map((keyword, index) => (
            <li
              key={`${keyword}-${index}`}
              onDragStart={(event) => {
                setHeld(index)
                event.dataTransfer.effectAllowed = 'move'
                // Firefox will not start a drag without something on the
                // transfer, and this is never read back.
                event.dataTransfer.setData('text/plain', keyword)
              }}
              onDragOver={(event) => {
                if (held === null) return
                // Reorder as the pointer crosses rather than on release, so the
                // row shows the order that dropping would give.
                event.preventDefault()
                if (held !== index) {
                  move(held, index)
                  setHeld(index)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                setHeld(null)
              }}
              onDragEnd={() => setHeld(null)}
              className={`border-hairline bg-surface-sunk text-strong rounded-edge text-small flex cursor-grab items-center gap-1 border py-1 pr-1 pl-2 ${
                held === index ? 'border-accent opacity-50' : ''
              }`}
            >
              {/* Dragging is the quick way and needs a pointer. Arrow keys are
                  the other way, so the order is reachable from a keyboard as
                  well — the same reason entries are reordered with buttons. */}
              {/* The handle is the label, not the whole chip. With the chip
                  draggable, pressing its × and drifting a pixel started a drag
                  instead of clicking the button, so the × felt dead. */}
              <span
                draggable
                tabIndex={0}
                role="button"
                aria-label={`${keyword}. Use the arrow keys to move it.`}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                  event.preventDefault()
                  move(index, index + (event.key === 'ArrowLeft' ? -1 : 1))
                }}
                className="focus:text-accent cursor-grab focus:outline-none"
              >
                {keyword}
              </span>
              <button
                type="button"
                aria-label={`Remove ${keyword}`}
                onClick={() => onChange(values.filter((_, at) => at !== index))}
                className="text-muted hover:text-flag rounded-edge px-1 leading-none transition-colors"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          id={id}
          ref={inputRef}
          name={name}
          value={draft}
          placeholder={placeholder}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => {
            // A comma is how people say "that was one of them" — unless it is
            // inside brackets, where it is still the same one being written.
            if (hasSeparator(event.target.value)) commit(event.target.value)
            else setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // Enter in a form submits it; here it means "add this one".
              event.preventDefault()
              commit(draft)
            }
            // Backspace deletes text and nothing else. It used to take back
            // the last keyword once the line was empty, which meant clearing
            // one word and holding the key a moment too long silently ate the
            // keywords already added. Each has an × for that.
          }}
          // Typing a keyword and clicking away should not throw it away.
          onBlur={() => commit(draft)}
          className="rounded-edge border-hairline bg-field text-body text-strong placeholder:text-muted/70 focus:border-accent w-full border px-3 py-2 focus:outline-none"
        />
        <Button className="shrink-0" onClick={() => commit(draft)} disabled={draft.trim() === ''}>
          Add
        </Button>
      </div>

      {hint && (
        <p id={hintId} className="text-muted text-small">
          {hint}
        </p>
      )}
    </div>
  )
}
