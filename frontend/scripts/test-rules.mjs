/**
 * FILE: frontend/scripts/test-rules.mjs
 * RUN:  pnpm run test:rules        (from the repo root)
 *
 * PURPOSE
 *   Proves the Firestore security rules for the Saved Check Sets feature work,
 *   against the REAL Firebase project in your .env (after `firebase deploy --only firestore:rules`).
 *
 * HOW
 *   1. The Admin SDK creates three throwaway users:
 *        A = verified owner, B = verified "other user", C = unverified user
 *   2. Each user signs in with the normal browser SDK (the same one the app uses),
 *      so every request below is checked by firebase/firestore.rules.
 *   3. Each test tries one action and records whether Firestore ALLOWED or DENIED it.
 *   4. Everything the test created is deleted at the end with the Admin SDK.
 *
 * Exit code 0 = every rule behaved as expected.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { initializeApp as initAdmin, cert } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminDb } from 'firebase-admin/firestore'

// ── 1. Load config from frontend/.env.local (generated from the root .env) ──
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    })
)

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const serviceAccount = JSON.parse(
  Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8')
)
const admin = initAdmin({ credential: cert(serviceAccount) }, 'rules-test-admin')
const adminAuth = getAdminAuth(admin)
const adminDb = getAdminDb(admin)

// ── 2. Helpers ──
const stamp = Date.now()
const PASSWORD = `RulesTest-${stamp}!`
const createdUids = []
const clientApps = []

async function makeUser(label, emailVerified) {
  const user = await adminAuth.createUser({
    email: `rules-test-${stamp}-${label}@example.com`,
    password: PASSWORD,
    emailVerified,
  })
  createdUids.push(user.uid)
  const app = initializeApp(firebaseConfig, `user-${label}`)
  clientApps.push(app)
  await signInWithEmailAndPassword(getAuth(app), user.email, PASSWORD)
  return { uid: user.uid, db: getFirestore(app) }
}

/** A valid check set document for `uid`. Pass overrides to break one thing. */
function validSet(uid, overrides = {}) {
  return {
    uid,
    name: 'Rules test set',
    description: 'Created by test-rules.mjs',
    checkCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    deletedAt: null,
    _schemaVersion: 1,
    ...overrides,
  }
}

/** A valid check document for `uid`. Pass overrides to break one thing. */
function validCheck(uid, setId, overrides = {}) {
  return {
    uid,
    setId,
    property: 'FireRating',
    operator: 'equals',
    expectedValue: '60',
    severity: 'fail',
    order: 0,
    _schemaVersion: 1,
    ...overrides,
  }
}

const results = []

/** Run one action and record whether Firestore allowed it. */
async function test(id, description, expected, action) {
  let actual
  let detail = ''
  try {
    const extra = await action()
    actual = 'ALLOWED'
    if (extra) detail = extra
  } catch (err) {
    actual = err?.code === 'permission-denied' ? 'DENIED' : 'ERROR'
    if (actual === 'ERROR') detail = String(err?.message ?? err)
  }
  const pass = actual === expected
  results.push({ id, description, expected, actual, result: pass ? 'PASS' : 'FAIL', detail })
}

// ── 3. The tests ──
async function run() {
  console.log(`\nFirestore rules test — project: ${firebaseConfig.projectId}\n`)

  const A = await makeUser('a', true) // verified owner
  const B = await makeUser('b', true) // verified, different user
  const C = await makeUser('c', false) // NOT verified
  const anonApp = initializeApp(firebaseConfig, 'signed-out')
  clientApps.push(anonApp)
  const anonDb = getFirestore(anonApp)

  const setRef = doc(collection(A.db, 'checkSets'))
  const checkRef = doc(collection(A.db, 'checks'))

  // Happy path
  await test('RT-01', 'Owner creates a set and its check in one batch', 'ALLOWED', async () => {
    const batch = writeBatch(A.db)
    batch.set(setRef, validSet(A.uid))
    batch.set(checkRef, validCheck(A.uid, setRef.id))
    await batch.commit()
  })

  await test('RT-02', 'Owner lists their active sets (compound query)', 'ALLOWED', async () => {
    const snap = await getDocs(
      query(
        collection(A.db, 'checkSets'),
        where('uid', '==', A.uid),
        where('deletedAt', '==', null)
      )
    )
    return `${snap.size} set(s) returned`
  })

  // Ownership
  await test('RT-03', "Another user opens the owner's set by id", 'DENIED', () =>
    getDoc(doc(B.db, 'checkSets', setRef.id))
  )
  await test('RT-04', "Another user queries for the owner's sets", 'DENIED', () =>
    getDocs(query(collection(B.db, 'checkSets'), where('uid', '==', A.uid)))
  )
  await test('RT-05', 'Another user creates a set pretending to be the owner', 'DENIED', () =>
    setDoc(doc(collection(B.db, 'checkSets')), validSet(A.uid))
  )
  await test('RT-06', 'Unverified user creates their own set', 'DENIED', () =>
    setDoc(doc(collection(C.db, 'checkSets')), validSet(C.uid))
  )
  await test('RT-07', "Signed-out visitor reads the owner's set", 'DENIED', () =>
    getDoc(doc(anonDb, 'checkSets', setRef.id))
  )

  // Field validation
  await test('RT-08', 'Set name is only spaces', 'DENIED', () =>
    setDoc(doc(collection(A.db, 'checkSets')), validSet(A.uid, { name: '   ' }))
  )
  await test('RT-09', 'Set has an extra field (role: admin)', 'DENIED', () =>
    setDoc(doc(collection(A.db, 'checkSets')), validSet(A.uid, { role: 'admin' }))
  )
  await test('RT-10', 'Set uses a browser-made timestamp instead of server time', 'DENIED', () =>
    setDoc(doc(collection(A.db, 'checkSets')), validSet(A.uid, { createdAt: Timestamp.now() }))
  )
  await test('RT-11', 'Set claims 51 checks (limit is 50)', 'DENIED', () =>
    setDoc(doc(collection(A.db, 'checkSets')), validSet(A.uid, { checkCount: 51 }))
  )
  await test('RT-12', "Check uses an operator not in the contract ('contains')", 'DENIED', () =>
    setDoc(doc(collection(A.db, 'checks')), validCheck(A.uid, setRef.id, { operator: 'contains' }))
  )
  await test('RT-13', "Check uses 'equals' with no expected value", 'DENIED', () =>
    setDoc(doc(collection(A.db, 'checks')), validCheck(A.uid, setRef.id, { expectedValue: '' }))
  )
  await test('RT-14', "Check uses 'exists' with no expected value", 'ALLOWED', () =>
    setDoc(
      doc(collection(A.db, 'checks')),
      validCheck(A.uid, setRef.id, { operator: 'exists', expectedValue: '', order: 1 })
    )
  )
  await test('RT-15', "Check severity is 'critical' (only fail|warning)", 'DENIED', () =>
    setDoc(doc(collection(A.db, 'checks')), validCheck(A.uid, setRef.id, { severity: 'critical' }))
  )

  // Updates and deletes
  await test('RT-16', 'Owner hands the set to another user (uid change)', 'DENIED', () =>
    updateDoc(setRef, { uid: B.uid, updatedAt: serverTimestamp() })
  )
  await test('RT-17', 'Owner moves a check into a different set', 'DENIED', () =>
    updateDoc(checkRef, { setId: 'some-other-set' })
  )
  await test('RT-18', 'Owner hard-deletes the set', 'DENIED', () => deleteDoc(setRef))
  await test('RT-19', 'Owner soft-deletes the set (deletedAt = server time)', 'ALLOWED', () =>
    updateDoc(setRef, { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() })
  )
  await test('RT-20', 'Owner edits the set after it was deleted', 'DENIED', () =>
    updateDoc(setRef, { name: 'Edited after delete', updatedAt: serverTimestamp() })
  )
}

// ── 4. Clean up everything the test created ──
async function cleanUp() {
  for (const uid of createdUids) {
    for (const name of ['checkSets', 'checks']) {
      const snap = await adminDb.collection(name).where('uid', '==', uid).get()
      await Promise.all(snap.docs.map((d) => d.ref.delete()))
    }
  }
  if (createdUids.length) await adminAuth.deleteUsers(createdUids)
  await Promise.all(clientApps.map((app) => deleteApp(app)))
}

let exitCode = 0
try {
  await run()
} catch (err) {
  console.error('Test run stopped early:', err)
  exitCode = 1
} finally {
  await cleanUp()
}

console.table(
  results.map(({ id, description, expected, actual, result, detail }) => ({
    id,
    test: description,
    expected,
    actual,
    result,
    ...(detail ? { note: detail } : {}),
  }))
)
const passed = results.filter((r) => r.result === 'PASS').length
console.log(`\n${passed}/${results.length} rules behaved as expected.`)
console.log('Test users and documents deleted.\n')
if (passed !== results.length) exitCode = 1
process.exit(exitCode)
