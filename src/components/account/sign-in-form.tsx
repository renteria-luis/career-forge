'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import {
  ACCOUNT_NOT_FOUND,
  EMAIL_NOT_VERIFIED,
  INVALID_EMAIL,
  INVALID_EMAIL_OR_PASSWORD,
} from '@/lib/auth/codes'
import { FormError } from './shell'

/**
 * Signing in.
 *
 * Three ways this fails and three different answers, each carrying the thing to
 * do next. What that gives up, and why it was given up, is in
 * `identifyTheFailure` in `src/lib/auth/server.ts`.
 *
 * No rules are applied to what is typed here. Holding a sign-in form to the
 * registration rules tells somebody with an older password that theirs no
 * longer qualifies, before they have proved it is theirs.
 */

interface Values {
  email: string
  password: string
}

/**
 * What to say, decided by what the server actually said.
 *
 * Every unknown outcome used to fall through to "that password is not right",
 * which meant a malformed address, a refused burst of attempts and a server
 * error all told somebody their password was wrong. Typing anything at all in
 * the email box produced it. Only `INVALID_EMAIL_OR_PASSWORD` means that now,
 * and anything unrecognised says so rather than inventing a cause.
 */
function refusal(code: string | undefined, status: number | undefined): ReactNode {
  if (code === INVALID_EMAIL) return 'That does not look like an email address.'

  if (code === ACCOUNT_NOT_FOUND) {
    return (
      <>
        No account has that address.{' '}
        <Link href="/sign-up" className="border-b border-current pb-0.5">
          Create one
        </Link>
        .
      </>
    )
  }

  if (code === EMAIL_NOT_VERIFIED) {
    return (
      <>
        Confirm your address before signing in. The link was emailed when you registered.{' '}
        <Link href="/resend-verification" className="border-b border-current pb-0.5">
          Send it again
        </Link>
        .
      </>
    )
  }

  if (code === INVALID_EMAIL_OR_PASSWORD) {
    return (
      <>
        That password is not right.{' '}
        <Link href="/forgot-password" className="border-b border-current pb-0.5">
          Reset it
        </Link>
        .
      </>
    )
  }

  if (status === 429) return 'Too many attempts. Wait a minute and try again.'

  return 'Something went wrong at our end. Try again in a moment.'
}

export function SignInForm() {
  const router = useRouter()
  const [failure, setFailure] = useState<ReactNode>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { email: '', password: '' } })

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={handleSubmit(async (values) => {
        setFailure(null)
        const { error } = await authClient.signIn.email({
          email: values.email,
          password: values.password,
        })
        if (error) {
          setFailure(refusal(error.code, error.status))
          return
        }
        router.push('/editor')
        router.refresh()
      })}
    >
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email', { required: 'Enter your email.' })}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password', { required: 'Enter your password.' })}
      />

      <FormError message={failure} />

      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <Link href="/forgot-password" className="text-muted hover:text-accent text-small">
          Forgot your password?
        </Link>
      </div>
    </form>
  )
}
