'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { CheckYourInbox, FormError } from './shell'

interface Values {
  email: string
}

export function ResendVerificationForm() {
  const [asked, setAsked] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Values>({ defaultValues: { email: '' } })

  if (asked) {
    return (
      <CheckYourInbox>
        If that address has an account waiting to be confirmed, a new link is on its way. It is good
        for an hour, and it replaces any earlier one.
      </CheckYourInbox>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={handleSubmit(async (values) => {
        /**
         * The same screen whatever happened, including a failure.
         *
         * Three outcomes are deliberately made to look alike: no such account,
         * an account already confirmed, and a link actually sent. The endpoint
         * holds them to the same response time for the same reason.
         *
         * A delivery failure is folded in with them, and that is a real trade
         * rather than an oversight. Reporting it would be more useful to the
         * one person in front of the form, and it would also be a signal: the
         * failure can only happen for an address that exists and is
         * unconfirmed. Showing it would turn an outage at the mail provider
         * into a way to test addresses. The failure is not lost — it is logged
         * on the server, where the person who can actually fix it will see it.
         */
        setFailure(null)
        const { error } = await authClient.sendVerificationEmail({ email: values.email })
        // A malformed address is the one thing worth saying, and only once the
        // button has been pressed.
        // Only a rejected body, which is a malformed address. Anything else —
        // including a delivery failure, which can only happen for an address
        // that exists — falls through to the same screen every address gets,
        // so this stays a form that cannot be asked who is registered.
        if (error?.status === 400) {
          setFailure('That does not look like an email address.')
          return
        }
        setAsked(true)
      })}
    >
      <Field label="Email" type="email" autoComplete="email" {...register('email')} />

      <FormError message={failure} />

      <Button type="submit" variant="primary" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Sending…' : 'Send a new link'}
      </Button>
    </form>
  )
}
