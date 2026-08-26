// One place where every /api/* request is made.
//
// The dashboard runs with no auth by default, so no token is stored and nothing
// extra is sent. If API_TOKEN is set as a Worker secret, the same token entered
// in the Data tab is attached here, which is what makes the documented
// "lock it down later" path actually work: worker/auth.ts starts demanding a
// bearer token, and this is the only code that has to know how to send one.

export const API_TOKEN_KEY = 'health-dashboard-api-token'

export function getApiToken(): string {
  try {
    return localStorage.getItem(API_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setApiToken(token: string): void {
  try {
    if (token) localStorage.setItem(API_TOKEN_KEY, token)
    else localStorage.removeItem(API_TOKEN_KEY)
  } catch {
    // A blocked or full store is not worth failing the caller over.
  }
}

/** Thrown on 401 so callers can stop retrying and ask for a token instead. */
export class UnauthorizedError extends Error {
  constructor() {
    super('This dashboard needs an access token. Add it in the Data tab.')
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getApiToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(path, { ...init, headers })
  // Retrying a 401 forever just burns battery: the token is what is missing,
  // and only the user can supply it.
  if (res.status === 401) throw new UnauthorizedError()
  return res
}
