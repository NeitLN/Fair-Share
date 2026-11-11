// Every call to the FastAPI backend goes through request(), so error handling lives in one place.
import { messages } from '../i18n'
import { currentSession, signOut } from '../lib/session'
import { beginRequest, endRequest } from '../lib/slowRequests'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

/** A failed API call, with a message that is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** What the server added for the page, e.g. the expense a 409 conflicts with. */
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type ErrorBody = {
  // Our format (docs/ARCHITECTURE.md §5): {"error": {"code": "...", "message": "..."}}
  error?: { code?: string; message?: string; details?: unknown }
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
    return new ApiError(response.status, body.error.code ?? 'error', body.error.message, body.error.details)
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

/** A write with no full answer after this long is given up and reported as "result unknown" (specs/018, FR-005). */
export const WRITE_GIVE_UP_MS = 90_000

/**
 * `countsAsSlow: false` leaves a request out of the slow-server notice: one that is slow by nature, like
 * quick add, whose AI usually takes 7 to 9 s and has its own "AI đang đọc… n giây" (review of #240).
 */
export async function request<T>(path: string, init: RequestInit = {}, { countsAsSlow = true } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  // A JSON body unless the caller said otherwise (a photo goes up as image/jpeg)
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const session = currentSession()
  if (session) headers.set('Authorization', `Bearer ${session.token}`)

  // Counted until the answer has been read, whatever happens, so a sleeping server is explained on
  // screen after 5 s (specs/011, FR-007, FR-009)
  // A write (anything but GET) says only what is known (specs/018, research R1, R2): offline, it is never
  // sent; once sent, a lost or missing answer leaves its result unknown, and 90 s without a full answer
  // gives it up. Reads keep the old behaviour.
  const write = (init.method ?? 'GET').toUpperCase() !== 'GET'
  if (write && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError(0, 'offline', messages().failure.offline)
  }
  const controller = write ? new AbortController() : null
  const giveUp = controller ? setTimeout(() => controller.abort(), WRITE_GIVE_UP_MS) : null
  const lost = () =>
    write
      ? new ApiError(0, 'outcome_unknown', messages().failure.network)
      : new ApiError(0, 'network_error', messages().failure.network)

  const token = countsAsSlow ? beginRequest() : null
  try {
    let response: Response
    try {
      response = await fetch(`${BASE_URL}${path}`, { ...init, headers, signal: controller?.signal ?? init.signal })
    } catch {
      // fetch only throws when no response arrived at all (offline, DNS, CORS, given up)
      throw lost()
    }

    // Someone else signed in on this tab while the request was on its way (review of #166): its
    // answer belongs to the last account, so it must neither sign the new one out nor reach its cache
    const changed = () => currentSession()?.token !== session?.token
    if (changed()) throw sessionChanged()

    // The session ended (logged out elsewhere, or expired): back to the sign-in page
    if (response.status === 401 && session && !SIGN_IN_ROUTES.test(path)) signOut()
    if (!response.ok) throw await toApiError(response)
    let body: unknown
    try {
      body = response.status === 204 ? undefined : await response.json()
    } catch {
      // The answer was cut off, or given up while it was being read: a write may still have happened
      throw lost()
    }
    if (changed()) throw sessionChanged()
    return body as T
  } finally {
    if (giveUp !== null) clearTimeout(giveUp)
    if (token !== null) endRequest(token)
  }
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
