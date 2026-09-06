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

export function ForgotPasswordForm() {
  const [asked, setAsked] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur' })

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
        // The answer is the same either way, including when the request itself
        // failed. An address that produced a different screen from the others
        // would be an address somebody could check for.
        await authClient.requestPasswordReset({
          email: values.email,
          redirectTo: '/reset-password',
        })
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
        {isSubmitting ? 'Sending…' : 'Send the link'}
      </Button>
    </form>
  )
}
