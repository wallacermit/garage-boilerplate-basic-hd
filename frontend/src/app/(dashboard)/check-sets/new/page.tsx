/**
 * ROUTE: /check-sets/new  (Server Component)
 * PURPOSE: The "New check set" page. requireAuth() protects it on the server,
 *          then it renders the form in create mode (no `existing` prop).
 * MAIN COMPONENT: features/check-sets/components/CheckSetForm.tsx
 */
import type { Metadata } from 'next'
import { requireAuth } from '@/actions/auth.actions'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckSetForm } from '@/features/check-sets/components/CheckSetForm'

export const metadata: Metadata = { title: 'New Check Set' }

export default async function NewCheckSetPage() {
  await requireAuth()
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="New check set"
        description="Name the set, then add one row per property you want to check."
      />
      <CheckSetForm />
    </div>
  )
}
