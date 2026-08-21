'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/data'
import { PageBody, PageHeader, PageTransition } from '@/components/ui/page'
import { useAccess } from '@/lib/access/useAccess'
import { ORG_ROLE_META } from '@/platform/config/roles'

import { AdminConsole, AdminNav, type AdminSection } from './admin-console'

/** Shared frame for every administration section. */
export function AdminScreen({ section }: { section: AdminSection }) {
  const access = useAccess()

  if (!access.can('admin:console') && !access.can('superadmin:console')) {
    return (
      <PageTransition>
        <EmptyState
          icon={ShieldCheck}
          title="Administration is not available to your role"
          description={`${ORG_ROLE_META[access.role].label} does not include access to the administration console.`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/app">Back to products</Link>
            </Button>
          }
        />
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              Administration
              {access.can('superadmin:console') ? (
                <Badge tone="accent" dot>
                  Superadmin
                </Badge>
              ) : (
                <Badge tone="neutral" dot>
                  {ORG_ROLE_META[access.role].label}
                </Badge>
              )}
            </span>
          }
          title={section.label}
          description={section.description}
        />

        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <AdminNav current={section.id} />
          </div>
          <div className="min-w-0">
            <AdminConsole section={section} />
          </div>
        </div>
      </PageBody>
    </PageTransition>
  )
}
