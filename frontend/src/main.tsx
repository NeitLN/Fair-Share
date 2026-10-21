import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

// Self-hosted fonts (docs/DESIGN.md §4). The per-weight files declare unicode-range, so the browser
// downloads only the latin / latin-ext / vietnamese pieces a page actually uses.
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/700.css'
import '@fontsource/bricolage-grotesque/800.css'

import App from './App.tsx'
import { queryClient } from './api/queryClient.ts'
import './styles/tokens.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
