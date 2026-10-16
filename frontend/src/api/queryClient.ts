import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx will fail again the same way; only retry once when the server or network hiccups
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
})
