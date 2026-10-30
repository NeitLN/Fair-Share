import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { setLanguage } from '../i18n'
import { resetVisit } from '../lib/knownHouseholds'

// findBy*/waitFor give up after 1 s by default. Rendering the whole app on a busy laptop or CI
// runner can take longer than that, which made page tests fail at random; 5 s is still quick
// to report a real failure.
configure({ asyncUtilTimeout: 5000 })

// The tests were written in Vietnamese and keep checking the Vietnamese words; English is the app's
// default, and i18n/english.test.tsx checks it page by page
beforeEach(() => {
  setLanguage('vi')
})

// Unmount whatever the previous test rendered, so tests never see each other's DOM, nor its storage
// (household keys, "Bạn là ai?"), nor the keys a visit keeps in memory (lib/knownHouseholds.ts)
afterEach(() => {
  cleanup()
  localStorage.clear()
  resetVisit()
})
