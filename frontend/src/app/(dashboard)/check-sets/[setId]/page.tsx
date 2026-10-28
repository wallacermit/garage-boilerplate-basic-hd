/**
 * ROUTE: /check-sets/[setId]  (Server Component)
 * PURPOSE: The "Edit check set" page. [setId] is the Firestore document id from
 *          the URL. requireAuth() protects it; EditCheckSet loads the set in the
 *          browser so the Firestore rules decide whether this user may see it.
 * MAIN COMPONENT: features/check-sets/components/EditCheckSet.tsx
 */
import type { Metadata } from 'next'
import { requireAuth } from '@/actions/auth.actions'
import { PageHeader } from '@/components/layout/PageHeader'
import { EditCheckSet } from '@/features/check-sets/components/EditCheckSet'

export const metadata: Metadata = { title: 'Edit Check Set' }

export default async function EditCheckSetPage({ params }: { params: Promise<{ setId: string }> }) {
  await requireAuth()
  const { setId } = await params
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Edit check set" description="Change the set, then save." />
      <EditCheckSet setId={setId} />
    </div>
  )
}
