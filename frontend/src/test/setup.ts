import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount whatever the previous test rendered, so tests never see each other's DOM
afterEach(cleanup)
