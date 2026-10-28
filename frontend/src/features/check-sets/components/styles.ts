/**
 * FILE: features/check-sets/components/styles.ts
 * PURPOSE: Shared Tailwind classes so every input in the feature looks the same.
 * USED BY: CheckSetForm.tsx, CheckSetList.tsx
 */

/** Text inputs, textareas and selects. Turns red when aria-invalid is set; greys out when read-only. */
export const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-500 focus:outline-none aria-invalid:border-red-500 read-only:bg-zinc-100 read-only:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:read-only:bg-zinc-800'

/** Red box used for page-level error messages. */
export const errorBoxClass =
  'rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'

/** White card that groups related content. */
export const cardClass =
  'rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900'
