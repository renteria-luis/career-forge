'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { CheckYourInbox, FormError } from './shell'

interface Values {
  email: string
}

export function ForgotPasswordForm() {
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
        If that address has an account, a link to choose a new password is on its way. It is good
        for an hour.
      </CheckYourInbox>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={handleSubmit(async (values) => {
        setFailure(null)
        const { error } = await authClient.requestPasswordReset({
          email: values.email,
          redirectTo: '/reset-password',
        })

        /**
         * Only a malformed address is reported, and only after the button was
         * pressed. Whether an address has an account is not: unlike signing in,
         * nothing here helps the person by saying so, and the same screen for
         * every address is what stops this being a way to ask who is
         * registered.
         */
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
      {/* No rule and no message until it is sent. */}
      <Field label="Email" type="email" autoComplete="email" {...register('email')} />

      <FormError message={failure} />

      <Button type="submit" variant="primary" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Sending…' : 'Send the link'}
      </Button>
    </form>
  )
}
