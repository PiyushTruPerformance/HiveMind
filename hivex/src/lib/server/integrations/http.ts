import 'server-only'

/**
 * Error type and response helpers for the integrations route handlers.
 * Error bodies use FastAPI's `{ detail }` shape, matching the other services
 * HiveX talks to.
 */

export class HttpError extends Error {
  status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ detail: error.message }, { status: error.status })
  }
  console.error('[integrations] unhandled error', error)
  return Response.json({ detail: 'Internal server error' }, { status: 500 })
}

/** Wraps a route body so every thrown error becomes a JSON response. */
export async function handle(fn: () => Promise<Response | unknown>): Promise<Response> {
  try {
    const result = await fn()
    return result instanceof Response ? result : Response.json(result ?? null)
  } catch (error) {
    return errorResponse(error)
  }
}

/** Throws a 502 with provider context when an external API call fails. */
export async function ensureOk(response: Response, context: string): Promise<Response> {
  if (response.ok) return response
  let body = ''
  try {
    body = (await response.text()).slice(0, 300)
  } catch {
    body = ''
  }
  throw new HttpError(502, `${context} failed (${response.status})${body ? `: ${body}` : ''}`)
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.')
  }
}
