/**
 * Tests the Zod validation rules for a check set (the browser-side checks).
 * Source: src/features/check-sets/checkSet.schema.ts
 */
import { describe, it, expect } from 'vitest'
import { checkSetFormSchema, emptyCheckRow } from '@/features/check-sets/checkSet.schema'

const validSet = {
  name: 'Level 2 fire compliance',
  description: 'Corridor walls and doors',
  checks: [{ property: 'FireRating', operator: 'equals', expectedValue: '60', severity: 'fail' }],
}

function errorsFor(input: unknown) {
  const result = checkSetFormSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

describe('checkSetFormSchema', () => {
  it('accepts a valid set', () => {
    expect(checkSetFormSchema.safeParse(validSet).success).toBe(true)
  })

  it('rejects a blank name, including one made only of spaces', () => {
    expect(errorsFor({ ...validSet, name: '' })).toContain('Name is required')
    expect(errorsFor({ ...validSet, name: '    ' })).toContain('Name is required')
  })

  it('rejects a name over 60 characters', () => {
    expect(errorsFor({ ...validSet, name: 'x'.repeat(61) })).toContain('Max 60 characters')
  })

  it('trims spaces around the name before saving', () => {
    const result = checkSetFormSchema.parse({ ...validSet, name: '  Doors  ' })
    expect(result.name).toBe('Doors')
  })

  it('rejects a set with no checks', () => {
    expect(errorsFor({ ...validSet, checks: [] })).toContain('Add at least one check')
  })

  it('rejects a set with more than 50 checks', () => {
    const checks = Array.from({ length: 51 }, () => validSet.checks[0])
    expect(errorsFor({ ...validSet, checks })).toContain('A set can hold at most 50 checks')
  })

  it('requires an expected value for every operator except exists', () => {
    const missingValue = {
      ...emptyCheckRow,
      property: 'ClearWidth',
      operator: 'greater_than_or_equal',
    }
    expect(errorsFor({ ...validSet, checks: [missingValue] })).toContain(
      'Expected value is required'
    )

    const existsCheck = { ...emptyCheckRow, property: 'OccupantNumber', operator: 'exists' }
    expect(checkSetFormSchema.safeParse({ ...validSet, checks: [existsCheck] }).success).toBe(true)
  })

  it('rejects an operator that is not in the contract', () => {
    const badOperator = { ...validSet.checks[0], operator: 'contains' }
    expect(checkSetFormSchema.safeParse({ ...validSet, checks: [badOperator] }).success).toBe(false)
  })

  it('rejects a severity other than fail or warning', () => {
    const badSeverity = { ...validSet.checks[0], severity: 'critical' }
    expect(checkSetFormSchema.safeParse({ ...validSet, checks: [badSeverity] }).success).toBe(false)
  })
})
