# Firestore Schema

## Overview

All collections use the typed collection pattern — see `frontend/src/lib/firebase/firestore.ts`.
Security rules are in `firebase/firestore.rules`.

When adding a new collection, use the `/firebase-collection` Claude Code skill.

## Schema versioning

Every document in every collection **must** include a `_schemaVersion` field:

```typescript
_schemaVersion: 1; // increment when doing a breaking schema change
```

This enables **lazy migration** — when a document is read, check `_schemaVersion` and migrate on the fly if it's behind current. See the `/evolve-schema` skill for the full migration workflow.

**Rules:**

- `_schemaVersion` is always `1` on creation
- Non-breaking changes (adding optional fields with defaults) keep the same version
- Breaking changes (rename, remove, type change) increment the version and require a migration function
- Never remove `_schemaVersion` from a schema

---

## `users` collection

**Path:** `/users/{userId}`
**Access:** Owner-only (user can read/write their own document; admins can read all)

| Field            | Type                | Required | Description                                  |
| ---------------- | ------------------- | -------- | -------------------------------------------- |
| `uid`            | `string`            | Yes      | Firebase Auth UID (same as document ID)      |
| `email`          | `string`            | Yes      | User's email address                         |
| `displayName`    | `string \| null`    | Yes      | Display name from Auth or profile            |
| `photoURL`       | `string \| null`    | Yes      | Profile photo URL                            |
| `role`           | `'user' \| 'admin'` | Yes      | User role — immutable by user after creation |
| `createdAt`      | `Timestamp`         | Yes      | When the document was created                |
| `updatedAt`      | `Timestamp`         | Yes      | When the document was last updated           |
| `_schemaVersion` | `1`                 | Yes      | Schema version for lazy migration            |

**Creation:** Auto-created by `AuthProvider` on first sign-in via `syncUserProfile()`.
**Deletion:** Hard-delete is disabled in security rules. Use `deletedAt` field for soft-delete.

---

<!-- Add new collection schemas below using the /firebase-collection skill -->

---

## `checkSets` collection

**Path:** `/checkSets/{setId}`
**Access:** Owner-only. Written directly from the browser; `firebase/firestore.rules` validates every write.

| Field            | Type                | Required | Description                                        |
| ---------------- | ------------------- | -------- | -------------------------------------------------- |
| `uid`            | `string`            | Yes      | Owner's Firebase Auth UID — immutable              |
| `name`           | `string`            | Yes      | Set name, 1–60 characters (not blank)              |
| `description`    | `string`            | Yes      | 0–280 characters (empty string if none)            |
| `checkCount`     | `number` (int)      | Yes      | Number of checks in the set, 1–50                  |
| `createdAt`      | `Timestamp`         | Yes      | Server time at creation — immutable                |
| `updatedAt`      | `Timestamp`         | Yes      | Server time of the last change                     |
| `deletedAt`      | `Timestamp \| null` | Yes      | `null` while active; server time when soft-deleted |
| `_schemaVersion` | `1`                 | Yes      | Schema version for lazy migration                  |

**Deletion:** soft-delete only (`deletedAt`). Deleted sets cannot be edited.
**Query used by the app:** `where('uid', '==', uid), where('deletedAt', '==', null)` — no composite index needed.

---

## `checks` collection

**Path:** `/checks/{checkId}`
**Access:** Owner-only.

| Field            | Type           | Required | Description                                                                                                                              |
| ---------------- | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `uid`            | `string`       | Yes      | Owner's Firebase Auth UID — immutable                                                                                                    |
| `setId`          | `string`       | Yes      | Id of the parent `checkSets` document — immutable                                                                                        |
| `property`       | `string`       | Yes      | BIM property name, e.g. `FireRating` (1–100 chars)                                                                                       |
| `operator`       | `string`       | Yes      | One of `equals`, `in_set`, `greater_than_or_equal`, `less_than_or_equal`, `within_tolerance`, `exists` (ValidationAgent contract v2.0.0) |
| `expectedValue`  | `string`       | Yes      | 0–200 chars; must be non-blank unless `operator` is `exists`                                                                             |
| `severity`       | `string`       | Yes      | `fail` or `warning`                                                                                                                      |
| `order`          | `number` (int) | Yes      | Position in the set, 0–49                                                                                                                |
| `_schemaVersion` | `1`            | Yes      | Schema version for lazy migration                                                                                                        |

**Deletion:** hard delete by the owner (removing a row while editing a set).
**Query used by the app:** `where('uid', '==', uid), where('setId', '==', setId)`.
