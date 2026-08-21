'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  CreditCard,
  Eye,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  UserCog,
} from 'lucide-react'

import { Avatar } from '@/components/ui/misc'
import { Badge } from '@/components/ui/badge'
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import { useAccess } from '@/lib/access/useAccess'
import { useIdentity } from '@/lib/state/identity-provider'
import { usePlatform } from '@/lib/state/platform-provider'
import { useTheme } from '@/lib/state/theme-provider'
import { ORG_ROLE_META } from '@/platform/config/roles'
import type { OrgRole } from '@/platform/types'

/** Roles offered in the preview switcher — enough to show every gate firing. */
const PREVIEW_ROLES: OrgRole[] = ['superadmin', 'admin', 'team_lead', 'team_member', 'client']

export function UserMenu() {
  const identity = useIdentity()
  const router = useRouter()
  const toast = useToast()
  const { theme, setTheme } = useTheme()
  const { organization, viewAsRole, setViewAsRole, resetDemo, subscriptions } = usePlatform()
  const access = useAccess()

  const activeCount = Object.values(subscriptions).filter((s) => s?.status === 'active').length

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-muted"
          aria-label="Account menu"
        >
          <Avatar name={identity.user.name} src={identity.user.avatarUrl} size="sm" />
        </button>
      </MenuTrigger>

      <MenuContent align="end" className="w-72">
        <div className="flex items-center gap-3 p-2.5">
          <Avatar name={identity.user.name} src={identity.user.avatarUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{identity.user.name}</p>
            <p className="truncate text-2xs text-muted-foreground">{identity.user.email}</p>
          </div>
        </div>

        <div className="px-2.5 pb-2">
          <div className="flex items-center gap-1.5">
            <Badge tone={viewAsRole ? 'accent' : 'neutral'} dot>
              {ORG_ROLE_META[access.role].label}
            </Badge>
            <Badge tone="neutral">
              {activeCount} {activeCount === 1 ? 'product' : 'products'}
            </Badge>
          </div>
        </div>

        <MenuSeparator />

        {organization ? (
          <>
            <MenuLabel>{organization.name}</MenuLabel>
            <MenuItem asChild>
              <Link href="/app/settings/organization">
                <Building2 className="text-muted-foreground" />
                Organization settings
              </Link>
            </MenuItem>
            <MenuItem asChild>
              <Link href="/app/settings/plan">
                <CreditCard className="text-muted-foreground" />
                Subscriptions and billing
              </Link>
            </MenuItem>
            <MenuItem asChild>
              <Link href="/app/settings/members">
                <UserCog className="text-muted-foreground" />
                Members and access
              </Link>
            </MenuItem>
            <MenuSeparator />
          </>
        ) : null}

        <MenuLabel>Appearance</MenuLabel>
        <MenuCheckboxItem checked={theme === 'light'} onCheckedChange={() => setTheme('light')}>
          <Sun className="size-4 text-muted-foreground" /> Light
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={theme === 'dark'} onCheckedChange={() => setTheme('dark')}>
          <Moon className="size-4 text-muted-foreground" /> Dark
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={theme === 'system'} onCheckedChange={() => setTheme('system')}>
          <Monitor className="size-4 text-muted-foreground" /> System
        </MenuCheckboxItem>

        <MenuSeparator />

        {/*
          Preview-as is a demo affordance, but it is also the proof that access
          is centralised: changing this one value re-gates every product, every
          workspace and every nav item without a single component knowing.
        */}
        <MenuLabel>
          <span className="flex items-center gap-1.5">
            <Eye className="size-3" /> Preview as role
          </span>
        </MenuLabel>
        <MenuCheckboxItem checked={!viewAsRole} onCheckedChange={() => setViewAsRole(null)}>
          My role ({ORG_ROLE_META.admin.label})
        </MenuCheckboxItem>
        {PREVIEW_ROLES.map((role) => (
          <MenuCheckboxItem
            key={role}
            checked={viewAsRole === role}
            onCheckedChange={() => setViewAsRole(role)}
          >
            {ORG_ROLE_META[role].label}
          </MenuCheckboxItem>
        ))}

        <MenuSeparator />

        <MenuItem asChild>
          <Link href="/app/settings">
            <Settings className="text-muted-foreground" />
            All settings
          </Link>
        </MenuItem>
        <MenuItem
          onSelect={() => {
            resetDemo()
            toast.info('Demo reset', 'Organization, plan and connections were cleared.')
            router.push('/')
          }}
        >
          <RotateCcw className="text-muted-foreground" />
          Reset demo data
        </MenuItem>
        <MenuItem tone="destructive" onSelect={() => identity.signOut()}>
          <LogOut />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
