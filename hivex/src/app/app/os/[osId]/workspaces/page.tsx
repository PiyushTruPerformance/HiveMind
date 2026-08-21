'use client'

import { useParams } from 'next/navigation'
import { FolderPlus } from 'lucide-react'
import { useState } from 'react'

import { WorkspaceGrid } from '@/components/os/workspace-grid'
import { WorkspaceSourceStatus } from '@/components/os/workspace-source-status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { PageBody, PageHeader, PageTransition } from '@/components/ui/page'
import { useAccess } from '@/lib/access/useAccess'
import { usePlatform } from '@/lib/state/platform-provider'
import { OS_REGISTRY } from '@/platform/config/os-registry'
import { formatLimit } from '@/platform/config/plans'
import { OS_WORKSPACE_SOURCES } from '@/os/workspace-sources'
import type { OSId } from '@/platform/types'

/** Workspace management for a product. */
export default function WorkspacesPage() {
  const params = useParams<{ osId: OSId }>()
  const os = OS_REGISTRY[params.osId]
  const access = useAccess()
  const toast = useToast()
  const { reloadWorkspaces } = usePlatform()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  /* Products backed by their own service create workspaces for real; the rest
     still stub it, and say so in the dialog. */
  const source = OS_WORKSPACE_SOURCES[os.id]

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!source?.create) {
      toast.info(
        `${trimmed} would be created`,
        'Workspace creation posts to /api/v1/company-workspaces in production.',
      )
      setName('')
      setOpen(false)
      return
    }
    setSaving(true)
    try {
      await source.create(trimmed)
      await reloadWorkspaces(os.id)
      toast.success(`${trimmed} created`)
      setName('')
      setOpen(false)
    } catch (error) {
      toast.error(
        `Could not create the ${os.workspaceNoun.singular.toLowerCase()}`,
        error instanceof Error ? error.message : undefined,
      )
    } finally {
      setSaving(false)
    }
  }

  const existing = access.workspacesIn(os.id)
  const limit = access.limitFor(os.id, 'workspacesPerOS', existing.length)
  const canCreate = access.can('workspace:create') && limit.allowed

  return (
    <PageTransition>
      <PageBody>
        <PageHeader
          eyebrow={os.name}
          title={os.workspaceNoun.plural}
          description={`Each ${os.workspaceNoun.singular.toLowerCase()} is an isolated context inside ${os.name} — its own data, members and settings.`}
          actions={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setOpen(true)}
              disabled={!canCreate}
              title={
                !limit.allowed
                  ? `Your plan allows ${formatLimit(limit.limit)} per product.`
                  : undefined
              }
            >
              <FolderPlus className="size-4" />
              New {os.workspaceNoun.singular.toLowerCase()}
            </Button>
          }
        />

        <WorkspaceSourceStatus osId={os.id} />

        <WorkspaceGrid os={os} searchable onCreate={() => setOpen(true)} />
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent width="sm">
          <DialogHeader>
            <DialogTitle>New {os.workspaceNoun.singular.toLowerCase()}</DialogTitle>
            <DialogDescription>
              {source?.create
                ? `Creates a client in the ${os.name} service.`
                : `Creating a ${os.workspaceNoun.singular.toLowerCase()} is stubbed in this build — the form shows the shape the real endpoint will take.`}
            </DialogDescription>
          </DialogHeader>

          <Field label={`${os.workspaceNoun.singular} name`} required>
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={os.id === 'hr' ? 'Design & Brand' : 'Acme Corporation'}
                autoFocus
              />
            )}
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              loading={saving}
              onClick={() => void handleCreate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}
