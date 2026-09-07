'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useForm, useWatch } from 'react-hook-form'
import { Button, Field } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { EMAIL_IN_USE, INVALID_EMAIL } from '@/lib/auth/codes'
import { CheckYourInbox, FormError } from './shell'
import { PasswordFields, passwordAccepted } from './password-fields'

/**
 * Registering.
 *
 * Nothing is said about a field until there is something to say. The email box
 * has no live checking of any kind — an address is either taken or it is not,
 * and that is a question only the server can answer, once, when the button is
 * pressed. The password rules are the exception, and they run the other way
 * round: on screen from the start as something to type towards.
 */

interface Values {
  name: string
  email: string
  password: string
  confirm: string
}

export function SignUpForm() {
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<ReactNode>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { name: '', email: '', password: '', confirm: '' } })

  // `useWatch` rather than the form's own `watch`, which cannot be memoized and
  // so re-renders this component on every field in the form, not just these two.
  const [password, confirm] = useWatch({ control, name: ['password', 'confirm'] })

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <CheckYourInbox>A confirmation link is on its way. It is good for an hour.</CheckYourInbox>
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
        if (!error) {
          setSent(true)
          return
        }

        // A taken address gets its own answer, with the way out attached. What
        // that gives up is written down in `identifyTheFailure`.
        if (error.code === EMAIL_IN_USE) {
          setFailure(
            <>
              There is already an account with that address.{' '}
              <Link href="/sign-in" className="border-b border-current pb-0.5">
                Sign in
              </Link>
              .
            </>,
          )
          return
        }
        if (error.code === INVALID_EMAIL) {
          setFailure('That does not look like an email address.')
          return
        }
        setFailure(error.message ?? 'That did not work. Try again.')
      })}
    >
      <Field
        label="Name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name', { required: 'Enter your name.' })}
      />

      {/* No rule, no message, no check button. See the note above. */}
      <Field label="Email" type="email" autoComplete="email" {...register('email')} />

      <PasswordFields
        label="Password"
        password={password}
        confirm={confirm}
        fields={register('password')}
        confirmFields={register('confirm')}
      />

      <FormError message={failure} />

      {/* Held shut until the marks above are filled in. They are the
          explanation, which is why they are on screen before it is pressed. */}
      <Button
        type="submit"
        variant="primary"
        disabled={isSubmitting || !passwordAccepted(password, confirm)}
        className="self-start"
      >
        {isSubmitting ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  )
}
