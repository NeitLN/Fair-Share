import { renderHook } from '@testing-library/react'
import { expect, test } from 'vitest'

import { usePageTitle } from './usePageTitle'

test("names the tab after the page, and puts back the app's title on leaving", () => {
  document.title = 'Fair-Share · Rõ ai trả ai.'
  const { rerender, unmount } = renderHook(({ text, app }) => usePageTitle(text, app), {
    initialProps: { text: 'Nhà của bạn', app: 'Fair-Share · Rõ ai trả ai.' },
  })
  expect(document.title).toBe('Nhà của bạn · Fair-Share')
  // Switching to English renames the page and what is put back
  rerender({ text: 'Your groups', app: 'Fair-Share · See who owes who.' })
  expect(document.title).toBe('Your groups · Fair-Share')
  unmount()
  expect(document.title).toBe('Fair-Share · See who owes who.')
})
