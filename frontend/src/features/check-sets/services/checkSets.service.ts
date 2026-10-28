/**
 * FILE: features/check-sets/services/checkSets.service.ts
 * LAYER: Data access (browser → Firestore)
 *
 * PURPOSE
 *   Every read and write for the Saved Check Sets feature lives here:
 *     createCheckSet()  — new set + its checks          (Create)
 *     loadCheckSet()    — one set + its checks           (Read, for the edit page)
 *     updateCheckSet()  — save edits, delete removed rows (Update)
 *     deleteCheckSet()  — soft-delete a set               (Delete)
 *     friendlyError()   — turns Firebase errors into plain English
 *   The live list on the main page is in hooks/useCheckSets.ts.
 *
 * USED BY
 *   components/CheckSetForm.tsx, components/EditCheckSet.tsx
 *
 * KEY DESIGN DECISIONS (useful for the demo)
 *   1. The browser writes to Firestore directly with the client SDK. That means
 *      firebase/firestore.rules checks EVERY write on Google's servers. (A Server
 *      Action using the Admin SDK would skip the rules completely.)
 *   2. A set and its checks are saved in ONE writeBatch — all or nothing.
 *      If the rules reject any single check, nothing is saved.
 *   3. Timestamps use serverTimestamp(), so the user cannot fake the time.
 *      The rules check that createdAt / updatedAt equal request.time.
 *   4. Sets are soft-deleted (deletedAt is set) rather than erased.
 */
import {
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { getClientDb } from '@/lib/firebase/client'
import {
  checkDoc,
  checkSetDoc,
  getCheckSetsCollection,
  getChecksCollection,
} from '@/lib/firebase/firestore'
import type { Check, CheckSet, WithId } from '@/types/firestore'
import type { CheckRowInput, CheckSetFormInput } from '@/features/check-sets/checkSet.schema'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build the Firestore document for one check row. */
function toCheckDocument(uid: string, setId: string, row: CheckRowInput, order: number): Check {
  return {
    uid, // owner — the rules require this to equal the signed-in user
    setId, // which set this check belongs to
    property: row.property,
    operator: row.operator,
    // "exists" never needs a value, so store an empty string for it
    expectedValue: row.operator === 'exists' ? '' : row.expectedValue,
    severity: row.severity,
    order, // keeps rows in the order the user entered them
    _schemaVersion: 1,
  }
}

/** Add one write per check row to the batch. */
function addChecksToBatch(batch: WriteBatch, uid: string, setId: string, rows: CheckRowInput[]) {
  rows.forEach((row, order) => {
    // A saved row keeps its id (→ rules "update"); a new row gets a fresh id (→ rules "create")
    const ref = row.checkId ? checkDoc(row.checkId) : doc(getChecksCollection())
    batch.set(ref, toCheckDocument(uid, setId, row, order))
  })
}

// ── Create ───────────────────────────────────────────────────────────────────

/** Create a new set and all of its checks in one batch. Returns the new set id. */
export async function createCheckSet(uid: string, input: CheckSetFormInput): Promise<string> {
  const batch = writeBatch(getClientDb())
  const setRef = doc(getCheckSetsCollection()) // generates an id before saving

  batch.set(setRef, {
    uid,
    name: input.name,
    description: input.description,
    checkCount: input.checks.length,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null, // null = active
    _schemaVersion: 1,
  })
  addChecksToBatch(batch, uid, setRef.id, input.checks)

  await batch.commit() // throws (e.g. permission-denied) if the rules reject anything
  return setRef.id
}

// ── Read (one set, for the edit page) ────────────────────────────────────────

export interface LoadedCheckSet {
  set: WithId<CheckSet>
  checks: WithId<Check>[]
}

/**
 * Load one set and its checks.
 * Returns null when the set does not exist, belongs to someone else, or was deleted.
 */
export async function loadCheckSet(uid: string, setId: string): Promise<LoadedCheckSet | null> {
  let setSnap
  try {
    setSnap = await getDoc(checkSetDoc(setId))
  } catch (err) {
    // The rules refuse to read another user's set (or a missing one) with
    // permission-denied. To the user, both simply mean "not found".
    if (err instanceof FirebaseError && err.code === 'permission-denied') return null
    throw err
  }

  const set = setSnap.data()
  if (!set || set.deletedAt !== null) return null

  // Must filter on uid as well: Firestore rules are not filters, so a query that
  // could return someone else's check is rejected as a whole.
  const checksSnap = await getDocs(
    query(getChecksCollection(), where('uid', '==', uid), where('setId', '==', setId))
  )
  const checks = checksSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.order - b.order)

  return { set: { id: setSnap.id, ...set }, checks }
}

// ── Update ───────────────────────────────────────────────────────────────────

/**
 * Save changes to an existing set.
 * `savedCheckIds` = the checks that existed when the edit page opened.
 * Any of them no longer in the form were removed by the user, so they are deleted.
 */
export async function updateCheckSet(
  uid: string,
  setId: string,
  input: CheckSetFormInput,
  savedCheckIds: string[]
): Promise<void> {
  const batch = writeBatch(getClientDb())

  // 1. Update the set itself (uid and createdAt are left alone — the rules forbid changing them)
  batch.update(checkSetDoc(setId), {
    name: input.name,
    description: input.description,
    checkCount: input.checks.length,
    updatedAt: serverTimestamp(),
  })

  // 2. Delete rows the user removed
  const keptIds = new Set(input.checks.map((row) => row.checkId).filter(Boolean))
  savedCheckIds.filter((id) => !keptIds.has(id)).forEach((id) => batch.delete(checkDoc(id)))

  // 3. Update kept rows and create new ones
  addChecksToBatch(batch, uid, setId, input.checks)

  await batch.commit()
}

// ── Delete (soft) ────────────────────────────────────────────────────────────

/** Soft-delete: the set is hidden from the list, not erased. Rules block hard deletes. */
export async function deleteCheckSet(setId: string): Promise<void> {
  const batch = writeBatch(getClientDb())
  batch.update(checkSetDoc(setId), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

// ── Errors ───────────────────────────────────────────────────────────────────

/** Turn a Firebase error into a sentence the user can act on. */
export function friendlyError(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (err.code === 'permission-denied') {
      return 'The server rejected this change. Check every field is filled in correctly and try again.'
    }
    if (err.code === 'unavailable') {
      return 'Could not reach the server. Check your connection and try again.'
    }
  }
  return 'Something went wrong. Please try again.'
}
