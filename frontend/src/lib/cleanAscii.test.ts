import { expect, test } from 'vitest'

import cases from './clean-ascii-cases.json'
import { cleanAscii } from './cleanAscii'

// The same pairs as the server's own test (tests/test_vietqr_service.py), so the live preview on the
// profile page shows exactly what will be saved (specs/016-vietqr, FR-003)
test.each(cases as [string, string][])('%j becomes %j', (raw, cleaned) => {
  expect(cleanAscii(raw)).toBe(cleaned)
})
