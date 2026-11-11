import { afterEach, describe, expect, test, vi } from 'vitest'

import { newDraftId } from './draftId'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newDraftId (specs/020-no-double-save)', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('a version-4 UUID, a new one each time', () => {
    const ids = new Set(Array.from({ length: 50 }, newDraftId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID)
  })

  test('over plain HTTP, where randomUUID does not exist, it is still a version-4 UUID', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const ids = new Set(Array.from({ length: 50 }, newDraftId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID)
  })
})
