/**
 * FILE: features/check-sets/hooks/useCheckSets.ts
 * LAYER: Data access (live read)
 *
 * PURPOSE
 *   A React hook that gives the list page a LIVE list of the signed-in user's
 *   active check sets, newest first. It uses onSnapshot, so when a set is
 *   created, edited or deleted, the list updates by itself — no refresh.
 *
 * RETURNS
 *   { sets, loading, error } — the three values drive the page's states:
 *   loading → spinner, error → red message, sets.length === 0 → empty state.
 *
 * USED BY
 *   components/CheckSetList.tsx
 */
'use client'

import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { getCheckSetsCollection } from '@/lib/firebase/firestore'
import type { CheckSet, WithId } from '@/types/firestore'

interface UseCheckSetsResult {
  sets: WithId<CheckSet>[]
  loading: boolean
  error: Error | null
}

export function useCheckSets(uid: string | undefined): UseCheckSetsResult {
  const [sets, setSets] = useState<WithId<CheckSet>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!uid) return // auth is still loading — keep showing the spinner

    // where('uid' == uid) is REQUIRED: Firestore rules are not filters, so a query
    // that could return another user's set is rejected as a whole.
    // where('deletedAt' == null) hides soft-deleted sets.
    const q = query(
      getCheckSetsCollection(),
      where('uid', '==', uid),
      where('deletedAt', '==', null)
    )

    // Subscribe. Firestore calls the first function on every change.
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({
          id: d.id,
          // 'estimate' fills in the local time while a serverTimestamp() is still uploading
          ...d.data({ serverTimestamps: 'estimate' }),
        }))
        // Sort here instead of orderBy() so no composite index is needed
        rows.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
        setSets(rows)
        setError(null)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    // Stop listening when the page is left (prevents memory leaks)
    return () => unsubscribe()
  }, [uid])

  return { sets, loading, error }
}
