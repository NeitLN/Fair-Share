import { useEffect, useState } from 'react'

import { request } from '../api/client'

/**
 * Whether this server has AI quick add switched on (specs/011-first-impressions, FR-017 to FR-019),
 * asked once per page load through /api/version. Only an explicit `"ai": false` means off: no answer
 * yet, a failed question or an older server without the field all stay 'unknown', where quick add
 * works as before (and still says so if the server turns out to have no key).
 */
export type AiAvailability = 'unknown' | 'on' | 'off'

let known: AiAvailability = 'unknown'
let asked: Promise<AiAvailability> | null = null

function ask(): Promise<AiAvailability> {
  asked ??= request<{ ai?: unknown }>('/api/version').then(
    (body) => (known = body.ai === true ? 'on' : body.ai === false ? 'off' : 'unknown'),
    () => 'unknown' as const,
  )
  return asked
}

export function useAiAvailability(): AiAvailability {
  const [availability, setAvailability] = useState<AiAvailability>(known)
  useEffect(() => {
    let mounted = true
    void ask().then((answer) => {
      if (mounted) setAvailability(answer)
    })
    return () => {
      mounted = false
    }
  }, [])
  return availability
}

/** Tests only: as after a new page load. */
export function resetAiAvailability() {
  known = 'unknown'
  asked = null
}
