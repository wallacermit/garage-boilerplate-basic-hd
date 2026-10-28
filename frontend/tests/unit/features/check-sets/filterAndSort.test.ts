/**
 * Tests the search (filter) and sort used on the Check Sets list page.
 * Source: src/features/check-sets/components/CheckSetList.tsx → filterAndSort()
 */
import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import { filterAndSort } from '@/features/check-sets/components/CheckSetList'
import type { CheckSet, WithId } from '@/types/firestore'

// Minimal fake Timestamp — filterAndSort only calls toMillis()
const at = (ms: number) => ({ toMillis: () => ms }) as unknown as Timestamp

function makeSet(
  id: string,
  name: string,
  description: string,
  checkCount: number,
  updated: number
) {
  return {
    id,
    uid: 'user-1',
    name,
    description,
    checkCount,
    createdAt: at(0),
    updatedAt: at(updated),
    deletedAt: null,
    _schemaVersion: 1,
  } satisfies WithId<CheckSet>
}

const sets = [
  makeSet('a', 'Doors', 'Clear width checks', 2, 100),
  makeSet('b', 'Fire compliance', 'Level 2 corridor', 5, 300),
  makeSet('c', 'Accessible sanitary', 'Door widths and grab rails', 1, 200),
]

describe('filterAndSort', () => {
  it('sorts by most recently updated by default', () => {
    expect(filterAndSort(sets, '', 'updated').map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by name A–Z', () => {
    expect(filterAndSort(sets, '', 'name').map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts by most checks', () => {
    expect(filterAndSort(sets, '', 'checks').map((s) => s.id)).toEqual(['b', 'a', 'c'])
  })

  it('searches name and description, ignoring case and spaces', () => {
    expect(filterAndSort(sets, '  DOOR ', 'name').map((s) => s.id)).toEqual(['c', 'a'])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterAndSort(sets, 'plumbing', 'updated')).toEqual([])
  })

  it('does not change the original list', () => {
    filterAndSort(sets, '', 'name')
    expect(sets.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})
