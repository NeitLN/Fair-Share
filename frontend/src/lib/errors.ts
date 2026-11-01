import { ApiError } from '../api/client'
import { messages } from '../i18n'

/**
 * A message safe and readable for the user, for any error a query or mutation can throw. The API's
 * error codes (app/errors.py, app/routers/*) have a sentence in each language (i18n/); the server's
 * own message is for developers and only shown for a code we do not know.
 */
export function errorMessage(error: unknown): string | null {
  if (!error) return null
  const t = messages()
  if (error instanceof ApiError) {
    return t.errors[error.code] ?? error.message
  }
  return t.failure.unexpected
}
