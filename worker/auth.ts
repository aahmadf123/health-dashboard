/**
 * The single authorization seam.
 *
 * Every /api/* route calls this. Today the dashboard runs with no auth, so an
 * unset API_TOKEN allows everything. Setting that one secret
 * (`wrangler secret put API_TOKEN`) turns on bearer-token checking across every
 * route without touching route code.
 */
export function authorize(request: Request, env: Env): Response | null {
  const expected = env.API_TOKEN
  if (!expected) return null

  const header = request.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token && timingSafeEqual(token, expected)) return null

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer',
    },
  })
}

/** Constant-time compare so a token cannot be guessed a character at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
