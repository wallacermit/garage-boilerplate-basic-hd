/**
 * FILE: features/check-sets/components/CheckSetForm.tsx
 * SCREEN: "New check set" (/check-sets/new) and the top of "Edit check set" (/check-sets/[setId])
 *
 * PURPOSE
 *   One form used for BOTH creating and editing a set:
 *     - no `existing` prop  → create mode ("Create set" button)
 *     - `existing` prop     → edit mode, pre-filled ("Save changes" button)
 *   The user enters a name, an optional description, and a table of check rows
 *   (property / operator / expected value / severity). Rows can be added and removed.
 *
 * HOW IT WORKS
 *   react-hook-form holds the form state; useFieldArray manages the list of rows.
 *   zodResolver(checkSetFormSchema) validates on submit and shows inline errors.
 *   onSubmit() calls the service, which writes to Firestore in one batch.
 *   If Firestore rejects the write, a red banner + toast show the reason.
 *
 * USED BY
 *   app/(dashboard)/check-sets/new/page.tsx   (create)
 *   components/EditCheckSet.tsx               (edit)
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { CHECK_OPERATORS, CHECK_SEVERITIES } from '@/types/firestore'
import {
  createCheckSet,
  friendlyError,
  updateCheckSet,
} from '@/features/check-sets/services/checkSets.service'
import {
  LIMITS,
  OPERATOR_LABELS,
  checkSetFormSchema,
  emptyCheckRow,
  type CheckSetFormInput,
} from '@/features/check-sets/checkSet.schema'
import { cardClass, errorBoxClass, inputClass } from '@/features/check-sets/components/styles'

interface CheckSetFormProps {
  /** Present when editing an existing set. Absent when creating a new one. */
  existing?: {
    setId: string
    values: CheckSetFormInput
    savedCheckIds: string[] // ids loaded from Firestore — used to work out which rows were removed
  }
}

export function CheckSetForm({ existing }: CheckSetFormProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [saveError, setSaveError] = useState<string | null>(null) // server-side error message

  // ── Form state ──
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckSetFormInput>({
    resolver: zodResolver(checkSetFormSchema),
    defaultValues: existing?.values ?? {
      name: '',
      description: '',
      checks: [emptyCheckRow], // a new set starts with one blank row
    },
  })

  // The list of check rows. keyName 'key' so React's list key doesn't clash with our checkId field.
  const { fields, append, remove } = useFieldArray({ control, name: 'checks', keyName: 'key' })
  // Live copy of the rows, used to know which rows have the "exists" operator selected
  const rows = useWatch({ control, name: 'checks' })

  // ── Submit ── (only runs if Zod validation passed)
  const onSubmit = async (values: CheckSetFormInput) => {
    if (!user) {
      setSaveError('You are signed out. Sign in again and retry.')
      return
    }
    setSaveError(null)
    try {
      if (existing) {
        await updateCheckSet(user.uid, existing.setId, values, existing.savedCheckIds)
        toast.success('Check set saved')
      } else {
        await createCheckSet(user.uid, values)
        toast.success('Check set created')
      }
      router.push('/check-sets') // back to the list, which updates live
    } catch (err) {
      // ERROR state: Firestore rules rejected the write, or the network failed
      const message = friendlyError(err)
      setSaveError(message)
      toast.error(message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {/* Server error banner */}
      {saveError && (
        <div role="alert" className={errorBoxClass}>
          {saveError}
        </div>
      )}

      {/* ── Card 1: set details ── */}
      <section className={`space-y-4 ${cardClass}`}>
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium">
            Set name
          </label>
          <input
            id="name"
            type="text"
            maxLength={LIMITS.nameMax}
            placeholder="e.g. Level 2 fire compliance"
            aria-invalid={!!errors.name}
            className={inputClass}
            {...register('name')}
          />
          {errors.name && (
            <p className="text-xs text-red-500" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="text-sm font-medium">
            Description <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            id="description"
            rows={2}
            maxLength={LIMITS.descriptionMax}
            placeholder="What is this set for?"
            aria-invalid={!!errors.description}
            className={inputClass}
            {...register('description')}
          />
          {errors.description && (
            <p className="text-xs text-red-500" role="alert">
              {errors.description.message}
            </p>
          )}
        </div>
      </section>

      {/* ── Card 2: the checks table ── */}
      <section className={`space-y-4 ${cardClass}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Checks <span className="font-normal text-zinc-400">({fields.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => append(emptyCheckRow)}
            disabled={fields.length >= LIMITS.checksMax} // stop at 50 rows
            className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            Add check
          </button>
        </div>

        {/* Errors about the list as a whole (e.g. "Add at least one check") */}
        {errors.checks?.root && (
          <p className="text-xs text-red-500" role="alert">
            {errors.checks.root.message}
          </p>
        )}
        {errors.checks?.message && (
          <p className="text-xs text-red-500" role="alert">
            {errors.checks.message}
          </p>
        )}

        <ol className="space-y-3">
          {fields.map((field, index) => {
            const rowErrors = errors.checks?.[index]
            const isExists = rows?.[index]?.operator === 'exists'
            return (
              <li
                key={field.key}
                className="grid gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-[1.4fr_1.2fr_1.4fr_0.8fr_auto] dark:border-zinc-800"
              >
                {/* Property name, e.g. FireRating */}
                <div className="space-y-1">
                  <label htmlFor={`checks.${index}.property`} className="text-xs text-zinc-500">
                    Property
                  </label>
                  <input
                    id={`checks.${index}.property`}
                    type="text"
                    placeholder="e.g. FireRating"
                    maxLength={LIMITS.propertyMax}
                    aria-invalid={!!rowErrors?.property}
                    className={inputClass}
                    {...register(`checks.${index}.property`)}
                  />
                  {rowErrors?.property && (
                    <p className="text-xs text-red-500">{rowErrors.property.message}</p>
                  )}
                </div>

                {/* Operator — only the six contract operators are offered */}
                <div className="space-y-1">
                  <label htmlFor={`checks.${index}.operator`} className="text-xs text-zinc-500">
                    Operator
                  </label>
                  <select
                    id={`checks.${index}.operator`}
                    className={inputClass}
                    {...register(`checks.${index}.operator`, {
                      // Switching to "exists" clears the value, because it is not used
                      onChange: (e) => {
                        if (e.target.value === 'exists') {
                          setValue(`checks.${index}.expectedValue`, '')
                        }
                      },
                    })}
                  >
                    {CHECK_OPERATORS.map((op) => (
                      <option key={op} value={op}>
                        {OPERATOR_LABELS[op]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Expected value — read-only when the operator is "exists" */}
                <div className="space-y-1">
                  <label
                    htmlFor={`checks.${index}.expectedValue`}
                    className="text-xs text-zinc-500"
                  >
                    Expected value
                  </label>
                  <input
                    id={`checks.${index}.expectedValue`}
                    type="text"
                    readOnly={isExists} // readOnly (not disabled) so the field is still submitted
                    placeholder={isExists ? 'Not needed' : 'e.g. 60'}
                    maxLength={LIMITS.expectedValueMax}
                    aria-invalid={!!rowErrors?.expectedValue}
                    className={inputClass}
                    {...register(`checks.${index}.expectedValue`)}
                  />
                  {rowErrors?.expectedValue && (
                    <p className="text-xs text-red-500">{rowErrors.expectedValue.message}</p>
                  )}
                </div>

                {/* Severity — what a violation means: FAIL or WARNING */}
                <div className="space-y-1">
                  <label htmlFor={`checks.${index}.severity`} className="text-xs text-zinc-500">
                    Severity
                  </label>
                  <select
                    id={`checks.${index}.severity`}
                    className={inputClass}
                    {...register(`checks.${index}.severity`)}
                  >
                    {CHECK_SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Remove row — disabled on the last row so a set always has one check */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    aria-label={`Remove check ${index + 1}`}
                    className="rounded-md p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting} // stops double-clicks creating two sets
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {isSubmitting ? 'Saving…' : existing ? 'Save changes' : 'Create set'}
        </button>
        <Link
          href="/check-sets"
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
