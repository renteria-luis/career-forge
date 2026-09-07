'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/editor/fields'
import { authClient } from '@/lib/auth/client'

export function SignOutButton() {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  return (
    <Button
      disabled={leaving}
      onClick={async () => {
        setLeaving(true)
        await authClient.signOut()
        // `refresh` and not just `push`: the session is read on the server, so
        // without it the pages already rendered would keep showing a name.
        router.push('/')
        router.refresh()
      }}
    >
      {leaving ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
