'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { MIN_PASSWORD_LENGTH, passwordSchema } from '@/lib/auth/identity'
import { FormError } from './shell'

const schema = z.object({ password: passwordSchema })

type Values = z.input<typeof schema>

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [done, setDone] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur' })

  if (!token) {
    return (
      <FormError message="This link is missing its token. Ask for a new one and use the most recent email." />
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-strong text-body">
          Your password is changed, and every session opened with the old one has been ended.
        </p>
        <Link
          href="/sign-in"
          className="bg-accent text-on-accent rounded-edge text-small px-4 py-2 font-medium"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={handleSubmit(async (values) => {
        setFailure(null)
        const { error } = await authClient.resetPassword({ newPassword: values.password, token })
        if (error) {
          // Two things land here and the person can act on both: a link that
          // has expired, and a password the breach corpus knows. The server
          // says which.
          setFailure(error.message ?? 'That link is no longer good. Ask for a new one.')
          return
        }
        setDone(true)
      })}
    >
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters, and not one that has been in a public breach.`}
        error={errors.password?.message}
        {...register('password')}
      />

      <FormError message={failure} />

      <Button type="submit" variant="primary" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Saving…' : 'Change my password'}
      </Button>
    </form>
  )
}
