'use client'

import type { FreeQuota } from '@/lib/ai/fields'

/**
 * How much of the free provider's day is gone.
 *
 * Its allowance is twenty requests a day per model and four models are in
 * rotation, so eighty is the day. The count is this server's own tally rather
 * than the provider's: it starts at zero after a deploy and knows nothing about
 * requests made elsewhere with the same key, which is why it says "about".
 *
 * Shown at all because the alternative was a button that stopped working with
 * no warning and no number — the difference between a bug and a budget.
 */
export function FreeQuotaLine({ quota }: { quota: FreeQuota | null }) {
  if (!quota) return null
  const left = Math.max(0, quota.limit - quota.used)
  return (
    <p className="text-muted text-micro font-mono">
      about {left} of {quota.limit} free requests left today
    </p>
  )
}
