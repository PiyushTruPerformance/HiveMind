'use client'

import { notFound, useParams } from 'next/navigation'

import { ADMIN_SECTIONS } from '@/components/admin/admin-console'
import { AdminScreen } from '@/components/admin/admin-screen'

export default function AdminSectionPage() {
  const params = useParams<{ section: string }>()
  const section = ADMIN_SECTIONS.find((s) => s.id === params.section)
  if (!section) notFound()
  return <AdminScreen section={section} />
}
