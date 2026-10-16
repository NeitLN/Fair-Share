// Every call to the FastAPI backend goes through request(), so error handling lives in one place.

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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')

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

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
}
