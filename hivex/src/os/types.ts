import type { ComponentType } from 'react'

import type { OSProduct, Workspace } from '@/platform/types'

/**
 * The contract every OS module implements.
 *
 * A product supplies a map of section id → component. The platform router
 * looks the component up and hands it the resolved OS and workspace; the
 * component owns everything inside the content area and nothing outside it.
 */
export interface WorkspaceViewProps {
  os: OSProduct
  workspace: Workspace
}

export type WorkspaceView = ComponentType<WorkspaceViewProps>

export type OSViewMap = Record<string, WorkspaceView>
