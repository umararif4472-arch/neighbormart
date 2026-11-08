/** Typed service errors — the only error shape components should handle. */
export type ApiErrorCode =
  | 'not-found'
  | 'invalid'
  | 'forbidden'
  | 'conflict'
  | 'unknown'
  | 'unauthenticated'
  | 'rate-limited'
  | 'auth/requires-recent-login'

export class ApiError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** Extract a display-friendly message from any thrown value. */
export function toErrorMessage(error: unknown): string {
  if (isApiError(error) || error instanceof Error) {
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
