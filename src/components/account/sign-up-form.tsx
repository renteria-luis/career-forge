'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { MIN_PASSWORD_LENGTH, emailSchema, nameSchema, passwordSchema } from '@/lib/auth/identity'
import { CheckYourInbox, FormError } from './shell'

/**
 * Registering.
 *
 * The same Zod pieces the server parses with, so the rules a person meets in
 * the browser are the rules that actually apply rather than a second, drifting
 * copy of them.
 */
const schema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

type Values = z.input<typeof schema>

export function SignUpForm() {
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur' })

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <CheckYourInbox>
          If that address is not already registered, a confirmation link is on its way. It is good
          for an hour.
        </CheckYourInbox>
        {/* The first thing somebody wants when it does not arrive, offered
            before they have to go looking for it. */}
        <p className="text-muted text-small">
          Nothing there?{' '}
          <Link href="/resend-verification" className="text-accent border-b border-current pb-0.5">
            Send it again
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={handleSubmit(async (values) => {
        setFailure(null)
        const { error } = await authClient.signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
        })

        /**
         * A taken address is not an error here and must not look like one. The
         * library answers a registration for an existing address exactly as it
         * answers a new one, and this branch has to preserve that: saying
         * "already registered" would turn the form into a way to ask whether
         * somebody has an account.
         *
         * A real failure — a refused password, an email that could not be sent
         * — is shown, because those are things the person can act on.
         */
        if (error) {
          setFailure(error.message ?? 'That did not work. Try again.')
          return
        }
        setSent(true)
      })}
    >
      <Field label="Name" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters, and not one that has been in a public breach.`}
        error={errors.password?.message}
        {...register('password')}
      />

      <FormError message={failure} />

      <Button type="submit" variant="primary" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  )
}
