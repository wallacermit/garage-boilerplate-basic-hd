/**
 * FILE: features/check-sets/checkSet.schema.ts
 * LAYER: Validation (browser side)
 *
 * PURPOSE
 *   Defines what a valid check set looks like, using Zod. The form uses this to
 *   show friendly error messages BEFORE anything is sent to Firestore.
 *
 * USED BY
 *   - components/CheckSetForm.tsx  (zodResolver runs this on submit)
 *   - services/checkSets.service.ts (the parsed values are what get saved)
 *
 * IMPORTANT
 *   This is for user experience only. The browser can be bypassed, so the SAME
 *   limits are enforced again on the server in firebase/firestore.rules.
 *   If you change a limit here, change it in the rules too.
 */
import { z } from 'zod'
import { CHECK_OPERATORS, CHECK_SEVERITIES, type CheckOperator } from '@/types/firestore'

// ── Limits (must match firebase/firestore.rules) ─────────────────────────────
export const LIMITS = {
  nameMax: 60,
  descriptionMax: 280,
  propertyMax: 100,
  expectedValueMax: 200,
  checksMax: 50,
} as const

// ── Labels shown in the "Operator" dropdown ──────────────────────────────────
// The stored value is the contract name (e.g. greater_than_or_equal);
// the label is what the user reads.
export const OPERATOR_LABELS: Record<CheckOperator, string> = {
  equals: 'equals',
  in_set: 'is one of',
  greater_than_or_equal: 'is at least (≥)',
  less_than_or_equal: 'is at most (≤)',
  within_tolerance: 'is within tolerance of',
  exists: 'exists (has any value)',
}

// ── One row in the checks table ──────────────────────────────────────────────
export const checkRowSchema = z
  .object({
    // Firestore id of a check that is already saved. Missing for a new row.
    // Used when editing, to update the existing document instead of creating a new one.
    checkId: z.string().optional(),
    property: z
      .string()
      .trim()
      .min(1, 'Property is required')
      .max(LIMITS.propertyMax, `Max ${LIMITS.propertyMax} characters`),
    operator: z.enum(CHECK_OPERATORS),
    expectedValue: z
      .string()
      .trim()
      .max(LIMITS.expectedValueMax, `Max ${LIMITS.expectedValueMax} characters`),
    severity: z.enum(CHECK_SEVERITIES),
  })
  // Cross-field rule: "exists" only asks whether the property is present,
  // so it is the one operator that does not need an expected value.
  .refine((row) => row.operator === 'exists' || row.expectedValue.length > 0, {
    message: 'Expected value is required',
    path: ['expectedValue'],
  })

// ── The whole form ───────────────────────────────────────────────────────────
export const checkSetFormSchema = z.object({
  name: z
    .string()
    .trim() // "   " becomes "" and then fails min(1)
    .min(1, 'Name is required')
    .max(LIMITS.nameMax, `Max ${LIMITS.nameMax} characters`),
  description: z
    .string()
    .trim()
    .max(LIMITS.descriptionMax, `Max ${LIMITS.descriptionMax} characters`),
  checks: z
    .array(checkRowSchema)
    .min(1, 'Add at least one check')
    .max(LIMITS.checksMax, `A set can hold at most ${LIMITS.checksMax} checks`),
})

// TypeScript types generated from the schemas above
export type CheckRowInput = z.infer<typeof checkRowSchema>
export type CheckSetFormInput = z.infer<typeof checkSetFormSchema>

/** A blank row, used when the form opens and when "Add check" is clicked. */
export const emptyCheckRow: CheckRowInput = {
  property: '',
  operator: 'equals',
  expectedValue: '',
  severity: 'fail',
}
