// Every call to the FastAPI backend goes through request(), so error handling lives in one place.
import { keyFor } from '../lib/knownHouseholds'

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
  return new ApiError(response.status, 'error', `Máy chủ trả lỗi ${response.status}`)
}

/** Header carrying a household's secret key (#132, app/access.py). */
export const KEY_HEADER = 'X-Household-Key'

/**
 * Which household a request is about: the id in `/api/households/{id}/…`, or the one the caller names
 * for routes addressed by a member, expense or settlement id.
 */
function householdOf(path: string, household?: number): number | null {
  if (household !== undefined) return household
  const match = /^\/api\/households\/(\d+)/.exec(path)
  return match ? Number(match[1]) : null
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  household?: number,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  const householdId = householdOf(path, household)
  const key = householdId === null ? null : keyFor(householdId)
  if (key) headers.set(KEY_HEADER, key)

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  } catch {
    // fetch only throws when no response arrived at all (offline, DNS, CORS)
    throw new ApiError(0, 'network_error', 'Không kết nối được tới máy chủ. Hãy thử lại.')
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** `household`: for routes addressed by a member, expense or settlement id, whose household it is. */
export const api = {
  get: <T>(path: string, household?: number) => request<T>(path, {}, household),
  post: <T>(path: string, body: unknown, household?: number) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, household),
  patch: <T>(path: string, body: unknown, household?: number) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, household),
  put: <T>(path: string, body: unknown, household?: number) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, household),
  delete: <T = void>(path: string, household?: number) =>
    request<T>(path, { method: 'DELETE' }, household),
}
