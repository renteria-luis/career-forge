'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { emailSchema } from '@/lib/auth/identity'
import { FormError } from './shell'

/**
 * Signing in.
 *
 * The password is only length-checked on the way in, deliberately: applying the
 * registration rules here would tell somebody with an older password that
 * theirs no longer qualifies, before they have proved it is theirs.
 */
const schema = z.object({ email: emailSchema, password: z.string().min(1) })

type Values = z.input<typeof schema>

/**
 * One message for every way this fails.
 *
 * Wrong password, no such address, unverified address: all the same sentence.
 * Any wording that separates them turns the form into a membership oracle, and
 * the second half is what a person needs whichever it was.
 */
const REFUSED =
  'That email and password do not match an account with a confirmed address. If you have just registered, follow the link in your email first.'

export function SignInForm() {
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), mode: 'onBlur' })

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
          setFailure(REFUSED)
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
        {...register('email')}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
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
