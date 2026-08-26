// Worker entrypoint. Serves the /api/* surface; every other path falls through
// to the static SPA assets, which never reach this code (run_worker_first in
// wrangler.jsonc scopes the Worker to /api/*).

import { authorize } from './auth'
import { handleSync } from './sync'
import { handleLabMarkerNames, handleLabTrend, handleRollup, handleSummary } from './trends'
import { json } from './http'
import { BadRequest, validateSyncRequest } from './validate'
import { SYNC_SCHEMA_VERSION } from '../src/lib/sync-types'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }

    const denied = authorize(request, env)
    if (denied) return denied

    try {
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        const raw = await request.json().catch(() => {
          throw new BadRequest('body must be JSON')
        })
        const req = validateSyncRequest(raw, Date.now())
        return json(await handleSync(req, env.DB))
      }

      if (url.pathname === '/api/trends/rollup' && request.method === 'GET') {
        return json(await handleRollup(url, env.DB))
      }

      if (url.pathname === '/api/trends/summary' && request.method === 'GET') {
        return json(await handleSummary(env.DB))
      }

      if (url.pathname === '/api/trends/labs' && request.method === 'GET') {
        return json(await handleLabTrend(url, env.DB))
      }

      if (url.pathname === '/api/trends/lab-markers' && request.method === 'GET') {
        return json({ markers: await handleLabMarkerNames(env.DB) })
      }

      if (url.pathname === '/api/health' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM scale').first<{
          n: number
        }>()
        return json({ ok: true, schemaVersion: SYNC_SCHEMA_VERSION, scaleRows: row?.n ?? 0 })
      }

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      if (err instanceof BadRequest) return json({ error: err.message }, 400)
      console.error('api error', err)
      return json({ error: 'Internal error' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
