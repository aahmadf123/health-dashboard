// Response headers shared by every /api/* response, including the 401 from
// worker/auth.ts.
//
// The dashboard holds personal health data and runs with no auth, so at minimum
// keep it out of search indexes and out of caches.
export const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
