// Every call to the FastAPI backend goes through request(), so error handling lives in one place.
import { messages } from '../i18n'
import { currentSession, signOut } from '../lib/session'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** A failed API call, with a message that is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type ErrorBody = {
  // Our format (docs/ARCHITECTURE.md §5): {"error": {"code": "...", "message": "..."}}
  error?: { code?: string; message?: string }
  // FastAPI's default format, until every route uses ours
  detail?: unknown
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody = {}
  try {
    body = await response.json()
  } catch {
    // Not JSON (e.g. an HTML page from a proxy); fall through to the generic message
  }
  if (body.error?.message) {
    return new ApiError(response.status, body.error.code ?? 'error', body.error.message)
  }
  if (typeof body.detail === 'string') {
    return new ApiError(response.status, 'error', body.detail)
  }
  return new ApiError(response.status, 'error', messages().failure.server(response.status))
}

/**
 * Header carrying the old secret key of a household from before accounts, only to take it over
 * (docs/ACCOUNTS.md, L1). Everything else is reached through the signed-in account.
 */
export const KEY_HEADER = 'X-Household-Key'

// A wrong password is a 401 too, but it does not mean the session ended
const SIGN_IN_ROUTES = /^\/api\/auth\/(login|register)$/

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const session = currentSession()
  if (session) headers.set('Authorization', `Bearer ${session.token}`)

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  } catch {
    // fetch only throws when no response arrived at all (offline, DNS, CORS)
    throw new ApiError(0, 'network_error', messages().failure.network)
  }

  // Someone else signed in on this tab while the request was on its way (review of #166): its
  // answer belongs to the last account, so it must neither sign the new one out nor reach its cache
  const changed = () => currentSession()?.token !== session?.token
  if (changed()) throw sessionChanged()

  // The session ended (logged out elsewhere, or expired): back to the sign-in page
  if (response.status === 401 && session && !SIGN_IN_ROUTES.test(path)) signOut()
  if (!response.ok) throw await toApiError(response)
  const body = response.status === 204 ? undefined : await response.json()
  if (changed()) throw sessionChanged()
  return body as T
}

const sessionChanged = () => new ApiError(0, 'session_changed', messages().failure.unexpected)

/**
 * The second argument of the routes addressed by a member, expense or settlement id used to say
 * which household's key to send; the session covers every household now, so it is ignored.
 */
export const api = {
  get: <T>(path: string, _household?: number, headers?: HeadersInit) => request<T>(path, { headers }),
  post: <T>(path: string, body: unknown, _household?: number, headers?: HeadersInit) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), headers }),
  patch: <T>(path: string, body: unknown, _household?: number) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown, _household?: number) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = void>(path: string, _household?: number) => request<T>(path, { method: 'DELETE' }),
}
