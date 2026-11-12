import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { setLanguage } from '../i18n'
import { resetAiAvailability } from '../lib/aiAvailability'
import { reloadSession } from '../lib/session'
import { resetSlowRequests } from '../lib/slowRequests'

// findBy*/waitFor give up after 1 s by default. Rendering the whole app on a busy laptop or CI
// runner can take longer than that, which made page tests fail at random; 5 s is still quick
// to report a real failure.
configure({ asyncUtilTimeout: 5000 })

// The tests were written in Vietnamese and keep checking the Vietnamese words; English is the app's
// default, and i18n/english.test.tsx checks it page by page
beforeEach(() => {
  setLanguage('vi')
})

// Unmount whatever the previous test rendered, so tests never see each other's DOM, nor its storage,
// nor the session it signed in with (lib/session.ts)
afterEach(() => {
  cleanup()
  localStorage.clear()
  // A kept expense draft and the "session ended" flag live here (lib/keptDraft.ts, lib/session.ts)
  sessionStorage.clear()
  reloadSession()
  // Module state of specs/011: no request left waiting, and /api/version asked again as on a new page
  resetSlowRequests()
  resetAiAvailability()
})
