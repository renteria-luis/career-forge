'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm, useWatch } from 'react-hook-form'
import { Button } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'
import { FormError } from './shell'
import { PasswordFields, passwordAccepted } from './password-fields'

interface Values {
  password: string
  confirm: string
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [done, setDone] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Values>({ defaultValues: { password: '', confirm: '' } })

  const [password, confirm] = useWatch({ control, name: ['password', 'confirm'] })

  if (!token) {
    // No token in the address at all: an old link, one a mail client cut in
    // half, or the page opened on its own. Saying which is no help to the
    // person reading it, and every one of those is fixed the same way.
    return (
      <div className="flex flex-col items-start gap-4">
        <FormError message="This link has expired. Ask for a new one and we will email it to you." />
        <Link
          href="/forgot-password"
          className="bg-accent text-on-accent rounded-edge text-small px-4 py-2 font-medium"
        >
          Send me a new link
        </Link>
      </div>
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
      <PasswordFields
        label="New password"
        password={password}
        confirm={confirm}
        fields={register('password')}
        confirmFields={register('confirm')}
      />

      <FormError message={failure} />

      <Button
        type="submit"
        variant="primary"
        disabled={isSubmitting || !passwordAccepted(password, confirm)}
        className="self-start"
      >
        {isSubmitting ? 'Saving…' : 'Change my password'}
      </Button>
    </form>
  )
}
