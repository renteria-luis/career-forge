'use client'

import type { Profile } from '@/lib/resume/profile'

/**
 * The fields a parser filled in, exactly as it filled them.
 *
 * This is the whole point of the tool. A person can look at their own resume
 * and see, field by field, what a machine took from it — including the fields
 * it left empty, which is where the problem always is.
 *
 * Read only on purpose. Editing belongs in the editor; this is a mirror.
 */

/**
 * One filed value.
 *
 * Magenta on the key, because that is what the whole system reserves it for:
 * if it is magenta, a machine read it. An empty value is the correction red
 * instead — that is not a field the parser kept, it is one it lost.
 */
function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5">
      <dt className={`text-micro font-mono ${value ? 'text-extract' : 'text-muted'}`}>{label}</dt>
      <dd className={value ? 'text-strong text-small' : 'text-flag text-small'}>
        {value || 'not found'}
      </dd>
    </div>
  )
}

export function ExtractedFields({ profile }: { profile: Profile }) {
  const basics = profile.basics
  const place = [basics?.location?.city, basics?.location?.countryCode].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-8">
      <dl className="bg-surface-sunk rounded-panel border-hairline border px-4 py-2">
        <Row label="Name" value={basics?.name} />
        <Row label="Headline" value={basics?.label} />
        <Row label="Email" value={basics?.email} />
        <Row label="Phone" value={basics?.phone} />
        <Row label="Location" value={place} />
        <Row label="Website" value={basics?.url} />
        {(basics?.profiles ?? []).map((entry, index) => (
          <Row key={index} label={entry.network ?? 'Link'} value={entry.url} />
        ))}
        <Row label="Summary" value={basics?.summary} />
      </dl>

      {(profile.work ?? []).length > 0 && (
        <section>
          <h3 className="text-muted text-micro font-mono uppercase">
            Experience · {profile.work?.length}
          </h3>
          <dl className="bg-surface-sunk rounded-panel border-hairline mt-2 border px-4 py-2">
            {(profile.work ?? []).map((role, index) => (
              <Row
                key={index}
                label={
                  [role.startDate, role.endDate ?? 'present'].filter(Boolean).join(' – ') ||
                  'no dates'
                }
                value={[role.position, role.name].filter(Boolean).join(' — ')}
              />
            ))}
          </dl>
        </section>
      )}

      {(profile.education ?? []).length > 0 && (
        <section>
          <h3 className="text-muted text-micro font-mono uppercase">
            Education · {profile.education?.length}
          </h3>
          <dl className="bg-surface-sunk rounded-panel border-hairline mt-2 border px-4 py-2">
            {(profile.education ?? []).map((entry, index) => (
              <Row
                key={index}
                label={[entry.startDate, entry.endDate].filter(Boolean).join(' – ') || 'no dates'}
                value={[entry.studyType, entry.area, entry.institution].filter(Boolean).join(' — ')}
              />
            ))}
          </dl>
        </section>
      )}

      {(profile.skills ?? []).length > 0 && (
        <section>
          <h3 className="text-muted text-micro font-mono uppercase">
            Skills · {profile.skills?.length}
          </h3>
          <dl className="bg-surface-sunk rounded-panel border-hairline mt-2 border px-4 py-2">
            {(profile.skills ?? []).map((group, index) => (
              <Row
                key={index}
                label={group.name ?? 'ungrouped'}
                value={group.keywords?.join(', ')}
              />
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
