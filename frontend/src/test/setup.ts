import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy*/waitFor give up after 1 s by default. Rendering the whole app on a busy laptop or CI
// runner can take longer than that, which made page tests fail at random; 5 s is still quick
// to report a real failure.
configure({ asyncUtilTimeout: 5000 })

// Unmount whatever the previous test rendered, so tests never see each other's DOM, nor its storage
// (household keys, "Bạn là ai?")
afterEach(() => {
  cleanup()
  localStorage.clear()
})
