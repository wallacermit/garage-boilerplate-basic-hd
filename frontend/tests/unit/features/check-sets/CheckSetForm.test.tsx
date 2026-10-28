/**
 * Tests the create/edit form as a user would use it (typing, clicking).
 * Firestore is mocked, so these run offline. The real Firestore rules are
 * tested separately by `pnpm run test:rules` (frontend/scripts/test-rules.mjs).
 * Source: src/features/check-sets/components/CheckSetForm.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckSetForm } from '@/features/check-sets/components/CheckSetForm'
import { createCheckSet, updateCheckSet } from '@/features/check-sets/services/checkSets.service'

const push = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'user-1' } }) }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Mock the Firestore calls. friendlyError returns a fixed message so the test can look for it.
vi.mock('@/features/check-sets/services/checkSets.service', () => ({
  createCheckSet: vi.fn(),
  updateCheckSet: vi.fn(),
  friendlyError: () => 'The server rejected this change.',
}))

describe('CheckSetForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks saving and shows errors when required fields are empty', async () => {
    const user = userEvent.setup()
    render(<CheckSetForm />)

    await user.click(screen.getByRole('button', { name: /create set/i }))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Property is required')).toBeInTheDocument()
    expect(screen.getByText('Expected value is required')).toBeInTheDocument()
    expect(createCheckSet).not.toHaveBeenCalled()
  })

  it('creates a set with two checks and returns to the list', async () => {
    vi.mocked(createCheckSet).mockResolvedValue('new-set-id')
    const user = userEvent.setup()
    render(<CheckSetForm />)

    await user.type(screen.getByLabelText(/set name/i), 'Level 2 fire compliance')
    await user.type(screen.getByLabelText('Property'), 'FireRating')
    await user.type(screen.getByLabelText('Expected value'), '60')

    await user.click(screen.getByRole('button', { name: /add check/i }))
    const properties = screen.getAllByLabelText('Property')
    await user.type(properties[1]!, 'OccupantNumber')
    await user.selectOptions(screen.getAllByLabelText('Operator')[1]!, 'exists')

    await user.click(screen.getByRole('button', { name: /create set/i }))

    await waitFor(() => expect(createCheckSet).toHaveBeenCalledTimes(1))
    expect(createCheckSet).toHaveBeenCalledWith('user-1', {
      name: 'Level 2 fire compliance',
      description: '',
      checks: [
        { property: 'FireRating', operator: 'equals', expectedValue: '60', severity: 'fail' },
        { property: 'OccupantNumber', operator: 'exists', expectedValue: '', severity: 'fail' },
      ],
    })
    expect(push).toHaveBeenCalledWith('/check-sets')
  })

  it('shows an error banner and stays on the page when the server rejects the save', async () => {
    vi.mocked(createCheckSet).mockRejectedValue(new Error('permission-denied'))
    const user = userEvent.setup()
    render(<CheckSetForm />)

    await user.type(screen.getByLabelText(/set name/i), 'Doors')
    await user.type(screen.getByLabelText('Property'), 'ClearWidth')
    await user.type(screen.getByLabelText('Expected value'), '850')
    await user.click(screen.getByRole('button', { name: /create set/i }))

    expect(await screen.findByText('The server rejected this change.')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('edits an existing set and passes the removed check ids along', async () => {
    vi.mocked(updateCheckSet).mockResolvedValue()
    const user = userEvent.setup()
    render(
      <CheckSetForm
        existing={{
          setId: 'set-1',
          savedCheckIds: ['c1', 'c2'],
          values: {
            name: 'Doors',
            description: '',
            checks: [
              {
                checkId: 'c1',
                property: 'ClearWidth',
                operator: 'greater_than_or_equal',
                expectedValue: '850',
                severity: 'fail',
              },
              {
                checkId: 'c2',
                property: 'FireRating',
                operator: 'equals',
                expectedValue: '30',
                severity: 'warning',
              },
            ],
          },
        }}
      />
    )

    await user.click(screen.getByRole('button', { name: /remove check 2/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateCheckSet).toHaveBeenCalledTimes(1))
    const [uid, setId, values, savedIds] = vi.mocked(updateCheckSet).mock.calls[0]!
    expect(uid).toBe('user-1')
    expect(setId).toBe('set-1')
    expect(values.checks).toHaveLength(1)
    expect(values.checks[0]?.checkId).toBe('c1')
    expect(savedIds).toEqual(['c1', 'c2'])
  })
})
