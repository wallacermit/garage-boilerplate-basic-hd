/**
 * FILE: features/check-sets/components/EditCheckSet.tsx
 * SCREEN: "Edit check set" page  →  /check-sets/[setId]
 *
 * PURPOSE
 *   Loads one set and its checks, then shows CheckSetForm pre-filled, plus a
 *   "Delete set" section. This screen has all four UI states:
 *     1. LOADING    — spinner while the set loads
 *     2. ERROR      — red message if loading fails (e.g. offline)
 *     3. NOT FOUND  — the "empty" state: set missing, deleted, or another user's
 *     4. SUCCESS    — the pre-filled form + delete section
 *
 * DELETE
 *   Two-step button ("Delete set" → "Yes, delete it") to avoid accidents.
 *   It is a soft delete — see deleteCheckSet() in services/checkSets.service.ts.
 *
 * USED BY
 *   app/(dashboard)/check-sets/[setId]/page.tsx
 */
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { FileQuestion } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  deleteCheckSet,
  friendlyError,
  loadCheckSet,
  type LoadedCheckSet,
} from '@/features/check-sets/services/checkSets.service'
import { CheckSetForm } from '@/features/check-sets/components/CheckSetForm'
import { errorBoxClass } from '@/features/check-sets/components/styles'

// The page is always in exactly one of these states
type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'ready'; data: LoadedCheckSet }

export function EditCheckSet({ setId }: { setId: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [confirmDelete, setConfirmDelete] = useState(false) // step 2 of the delete button
  const [deleting, setDeleting] = useState(false)

  // ── Load the set once the user is known ──
  useEffect(() => {
    if (!user) return
    let cancelled = false // ignore the result if the user leaves the page first
    loadCheckSet(user.uid, setId)
      .then((data) => {
        if (!cancelled) setState(data ? { status: 'ready', data } : { status: 'not-found' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [user, setId])

  // ── Delete (soft) ──
  const onDelete = async () => {
    setDeleting(true)
    try {
      await deleteCheckSet(setId)
      toast.success('Check set deleted')
      router.push('/check-sets')
    } catch (err) {
      toast.error(friendlyError(err))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // ── State 1: LOADING ──
  if (state.status === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  }

  // ── State 2: ERROR ──
  if (state.status === 'error') {
    return (
      <div role="alert" className={errorBoxClass}>
        Could not load this check set. Refresh the page to try again.
      </div>
    )
  }

  // ── State 3: NOT FOUND ──
  if (state.status === 'not-found') {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Check set not found"
        description="It may have been deleted, or it belongs to another account."
        action={
          <Link href="/check-sets" className="text-sm font-medium underline">
            Back to my check sets
          </Link>
        }
      />
    )
  }

  // ── State 4: SUCCESS ──
  const { set, checks } = state.data

  return (
    <div className="space-y-6">
      {/* Convert the Firestore documents into the shape the form expects */}
      <CheckSetForm
        existing={{
          setId,
          savedCheckIds: checks.map((c) => c.id),
          values: {
            name: set.name,
            description: set.description,
            checks: checks.map((c) => ({
              checkId: c.id,
              property: c.property,
              operator: c.operator,
              expectedValue: c.expectedValue,
              severity: c.severity,
            })),
          },
        }}
      />

      {/* Danger zone */}
      <section className="rounded-lg border border-red-200 p-4 dark:border-red-900">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete this set</h2>
        <p className="mt-1 text-sm text-zinc-500">
          The set disappears from your list. Its checks are kept but no longer shown.
        </p>
        <div className="mt-3 flex gap-2">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete set
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
