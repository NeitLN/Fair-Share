import { expect, test } from 'vitest'

import { ApiError } from '../api/client'
import { formError } from './formError'

const validation = (loc: unknown[]) =>
  new ApiError(422, 'validation_error', 'bad', [{ loc, type: 'value_error', msg: 'x' }])

test('nothing to show without an error', () => {
  expect(formError(null)).toBeNull()
})

test.each([
  [['body', 'description'], 'description'],
  [['body', 'amount'], 'amount'],
  [['body', 'payer_id'], 'payer'],
  [['body', 'spent_at'], 'date'],
  [['body', 'split', 'shares', 0, 'amount'], 'split'],
])('a refused body field %j points at the %s field', (loc, field) => {
  expect(formError(validation(loc))?.field).toBe(field)
})

test.each(['unknown_member', 'member_without_account'])('%s is about the split', (code) => {
  expect(formError(new ApiError(422, code, 'x'))?.field).toBe('split')
})

test('the month of a repeating item already recorded is not a form error', () => {
  expect(formError(new ApiError(409, 'recurring_month_taken', 'x'))).toBeNull()
})

test('a network failure or an unknown error has a message but no field', () => {
  const offline = formError(new ApiError(0, 'network_error', 'offline'))
  expect(offline?.field).toBeNull()
  expect(offline?.message).toBeTruthy()
  expect(formError(new ApiError(500, 'internal_error', 'boom'))?.field).toBeNull()
  expect(formError(new Error('?'))?.field).toBeNull()
})

test('a validation error on an unknown field has no field', () => {
  expect(formError(validation(['body', 'colour']))?.field).toBeNull()
})
