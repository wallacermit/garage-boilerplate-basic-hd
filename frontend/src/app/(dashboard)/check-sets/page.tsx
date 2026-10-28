/**
 * ROUTE: /check-sets  (Server Component)
 * PURPOSE: The "Check Sets" list page. Checks the session on the server with
 *          requireAuth() (signed-out users are redirected), then renders the
 *          client-side list component that talks to Firestore.
 * MAIN COMPONENT: features/check-sets/components/CheckSetList.tsx
 */
import type { Metadata } from 'next'
import { requireAuth } from '@/actions/auth.actions'
import { PageHeader } from '@/components/layout/PageHeader'
import { CheckSetList } from '@/features/check-sets/components/CheckSetList'

export const metadata: Metadata = { title: 'Check Sets' }

export default async function CheckSetsPage() {
  await requireAuth()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Check Sets"
        description="Reusable groups of BIM property checks for validation runs."
      />
      <CheckSetList />
    </div>
  )
}
