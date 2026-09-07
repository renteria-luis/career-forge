'use client'

import { Field } from '@/components/editor/fields'
import { PASSWORD_RULES } from '@/lib/auth/identity'
import { Requirement, Requirements } from './shell'

/**
 * Choosing a password, with the rules on screen from the start.
 *
 * One component because two pages do this — registering and resetting — and
 * they were drifting: the rules were spelled out under one field and hidden
 * behind a failed submit on the other. The rules themselves come from
 * `PASSWORD_RULES`, which is also what the server checks before hashing, so
 * this cannot promise something that is not enforced.
 *
 * The marks are visible before anything is typed rather than after a rejected
 * attempt. They are something to type towards; a list that only appears once
 * you have got it wrong is a telling-off.
 */
/** Whether what has been typed satisfies everything shown below the fields. */
export function passwordAccepted(password: string, confirm: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.met(password)) && password === confirm
}

export function PasswordFields({
  label,
  password,
  confirm,
  fields,
  confirmFields,
}: {
  /** "Password" when registering, "New password" when resetting. */
  label: string
  password: string
  confirm: string
  fields: Record<string, unknown>
  confirmFields: Record<string, unknown>
}) {
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <Field label={label} type="password" autoComplete="new-password" {...fields} />
        <Requirements>
          {PASSWORD_RULES.map((rule) => (
            <Requirement key={rule.id} met={rule.met(password)}>
              {rule.label}
            </Requirement>
          ))}
        </Requirements>
      </div>

      <div className="flex flex-col gap-2.5">
        <Field
          label={`Repeat ${label.toLowerCase()}`}
          type="password"
          autoComplete="new-password"
          {...confirmFields}
        />
        <Requirements>
          <Requirement met={password.length > 0 && password === confirm}>
            Both passwords match
          </Requirement>
        </Requirements>
      </div>
    </>
  )
}
