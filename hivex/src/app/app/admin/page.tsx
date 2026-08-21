'use client'

import { AdminScreen } from '@/components/admin/admin-screen'
import { ADMIN_SECTIONS } from '@/components/admin/admin-console'

export default function AdminIndexPage() {
  return <AdminScreen section={ADMIN_SECTIONS[0]} />
}
