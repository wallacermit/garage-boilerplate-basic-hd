/**
 * FILE: features/check-sets/components/CheckSetList.tsx
 * SCREEN: "Check Sets" list page  →  /check-sets
 *
 * PURPOSE
 *   Shows the signed-in user's saved check sets with search (filter) and sort.
 *   Each card links to the edit page. This screen has all four UI states:
 *     1. LOADING  — spinner while the first snapshot arrives
 *     2. ERROR    — red message if Firestore refuses or fails
 *     3. EMPTY    — "No check sets yet" + a button to create one
 *     4. SUCCESS  — search box, sort menu and the cards
 *   (plus "no search results" when a search matches nothing)
 *
 * DATA
 *   Live list from hooks/useCheckSets.ts (Firestore compound query, onSnapshot).
 *   Search and sort run in the browser on the already-loaded list.
 *
 * USED BY
 *   app/(dashboard)/check-sets/page.tsx
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ListChecks, Plus, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDatetime } from '@/lib/utils'
import type { CheckSet, WithId } from '@/types/firestore'
import { useCheckSets } from '@/features/check-sets/hooks/useCheckSets'
import { errorBoxClass, inputClass } from '@/features/check-sets/components/styles'

// ── Sort options ─────────────────────────────────────────────────────────────
type SortKey = 'updated' | 'name' | 'checks'

const SORTERS: Record<SortKey, (a: WithId<CheckSet>, b: WithId<CheckSet>) => number> = {
  updated: (a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis(), // newest first
  name: (a, b) => a.name.localeCompare(b.name), // A → Z
  checks: (a, b) => b.checkCount - a.checkCount, // most checks first
}

/** Pure function (easy to test): apply the search term, then the sort. */
export function filterAndSort(sets: WithId<CheckSet>[], search: string, sort: SortKey) {
  const term = search.trim().toLowerCase()
  const matches = term
    ? sets.filter(
        (s) => s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term)
      )
    : sets
  return [...matches].sort(SORTERS[sort])
}

const newSetButton = (
  <Link
    href="/check-sets/new"
    className="inline-flex items-center gap-1.5 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
  >
    <Plus className="h-4 w-4" />
    New check set
  </Link>
)

export function CheckSetList() {
  const { user } = useAuth()
  const { sets, loading, error } = useCheckSets(user?.uid)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('updated')

  // ── State 1: LOADING ──
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  }

  // ── State 2: ERROR ──
  if (error) {
    return (
      <div role="alert" className={errorBoxClass}>
        Could not load your check sets. Refresh the page to try again.
      </div>
    )
  }

  // ── State 3: EMPTY (the user has no sets at all) ──
  if (sets.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No check sets yet"
        description="Save a group of checks once and reuse it on every validation run."
        action={newSetButton}
      />
    )
  }

  // ── State 4: SUCCESS ──
  const visible = filterAndSort(sets, search, sort)

  return (
    <div className="space-y-4">
      {/* Toolbar: search + sort on the left, create button on the right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:max-w-lg sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-400" />
            <label htmlFor="search" className="sr-only">
              Search check sets
            </label>
            <input
              id="search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or description"
              className={`${inputClass} pl-9`}
            />
          </div>
          <label htmlFor="sort" className="sr-only">
            Sort check sets
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className={`${inputClass} sm:w-48`}
          >
            <option value="updated">Recently updated</option>
            <option value="name">Name (A–Z)</option>
            <option value="checks">Most checks</option>
          </select>
        </div>
        {newSetButton}
      </div>

      {/* Search found nothing */}
      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No sets match your search"
          description={`Nothing found for "${search.trim()}".`}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((set) => (
            <li key={set.id}>
              {/* The whole card is a link to the edit page */}
              <Link
                href={`/check-sets/${set.id}`}
                className="block h-full rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium">{set.name}</h3>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {set.checkCount} {set.checkCount === 1 ? 'check' : 'checks'}
                  </span>
                </div>
                {set.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{set.description}</p>
                )}
                <p className="mt-3 text-xs text-zinc-400">
                  Updated {formatDatetime(set.updatedAt.toDate())}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
