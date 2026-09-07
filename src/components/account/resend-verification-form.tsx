'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { emailSchema } from '@/lib/auth/identity'
import { CheckYourInbox } from './shell'

const schema = z.object({ email: emailSchema })

type Values = z.input<typeof schema>

export function ResendVerificationForm() {
  const [asked, setAsked] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur' })

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
        await authClient.sendVerificationEmail({ email: values.email })
        setAsked(true)
      })}
    >
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Button type="submit" variant="primary" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Sending…' : 'Send a new link'}
      </Button>
    </form>
  )
}
