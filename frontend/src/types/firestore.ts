import type { Timestamp } from 'firebase/firestore'

/**
 * Firestore collection type definitions.
 *
 * Keep in sync with:
 *   - src/lib/firebase/firestore.ts  (typed collection exports)
 *   - firebase/firestore.rules       (security rules)
 *   - docs/FIRESTORE-SCHEMA.md       (schema documentation)
 *
 * When adding a new collection, use the /firebase-collection skill.
 */

export interface UserProfile {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
  role: 'user'
  createdAt: Timestamp
  updatedAt: Timestamp
  _schemaVersion: 1
}

export type CreateUserProfileInput = Omit<UserProfile, 'createdAt' | 'updatedAt'>

// ── Saved Check Sets ─────────────────────────────────────────────────────────
// The six operators and two severities match the ValidationAgent contract v2.0.0.
// The same lists are enforced again in firebase/firestore.rules.

export const CHECK_OPERATORS = [
  'equals',
  'in_set',
  'greater_than_or_equal',
  'less_than_or_equal',
  'within_tolerance',
  'exists',
] as const

export type CheckOperator = (typeof CHECK_OPERATORS)[number]

export const CHECK_SEVERITIES = ['fail', 'warning'] as const

export type CheckSeverity = (typeof CHECK_SEVERITIES)[number]

/** checkSets/{setId} — a named, reusable group of checks owned by one user. */
export interface CheckSet {
  uid: string
  name: string
  description: string
  checkCount: number
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt: Timestamp | null // null = active; a timestamp = soft-deleted
  _schemaVersion: 1
}

/** checks/{checkId} — one property check that belongs to a check set. */
export interface Check {
  uid: string
  setId: string
  property: string
  operator: CheckOperator
  expectedValue: string
  severity: CheckSeverity
  order: number
  _schemaVersion: 1
}

/** A Firestore document with its id attached. */
export type WithId<T> = T & { id: string }
