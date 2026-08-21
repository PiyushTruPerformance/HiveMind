'use client'

import { notFound, useParams } from 'next/navigation'

import {
  MembersSettings,
  OrganizationSettings,
  PlanSettings,
  PreferencesSettings,
} from '@/components/settings/sections'
import { SETTINGS_SECTIONS, SettingsShell } from '@/components/settings/settings-shell'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/data'
import { useAccess } from '@/lib/access/useAccess'
import Link from 'next/link'

const VIEWS = {
  organization: OrganizationSettings,
  plan: PlanSettings,
  members: MembersSettings,
  preferences: PreferencesSettings,
} as const

/**
 * Settings sections are capability-gated through the same access layer the rest
 * of the platform uses — no bespoke role checks in these screens.
 */
export default function SettingsSectionPage() {
  const params = useParams<{ section: string }>()
  const access = useAccess()

  const section = SETTINGS_SECTIONS.find((s) => s.id === params.section)
  if (!section) notFound()

  const View = VIEWS[section.id as keyof typeof VIEWS]

  if (section.capability && !access.can(section.capability)) {
    return (
      <SettingsShell section={section}>
        <EmptyState
          title="You do not have access to this section"
          description={`${section.label} is limited to roles with the ${section.capability} capability.`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/app/settings/organization">Back to organization</Link>
            </Button>
          }
        />
      </SettingsShell>
    )
  }

  return (
    <SettingsShell section={section}>
      <View />
    </SettingsShell>
  )
}
