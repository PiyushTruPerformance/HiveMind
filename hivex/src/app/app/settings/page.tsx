'use client'

import { OrganizationSettings } from '@/components/settings/sections'
import { SETTINGS_SECTIONS, SettingsShell } from '@/components/settings/settings-shell'

/** /app/settings lands on the organization tab. */
export default function SettingsIndexPage() {
  return (
    <SettingsShell section={SETTINGS_SECTIONS[0]}>
      <OrganizationSettings />
    </SettingsShell>
  )
}
