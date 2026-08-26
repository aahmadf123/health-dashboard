import { useAppData } from '../lib/storage'
import { LIGHT } from '../lib/palette'

// The status hues are identical in the light and dark palettes, so this needs
// no theme threading.
const { good, warning, critical } = LIGHT

/**
 * A small header indicator. It states plainly whether data has reached the
 * server, because with a database behind the app "did that save?" becomes a
 * question worth answering at a glance.
 */
export default function SyncStatus() {
  const { sync, syncNow } = useAppData()

  const dot =
    sync.status === 'error' || sync.status === 'outdated' || sync.status === 'unauthorized'
      ? critical
      : sync.status === 'offline'
        ? warning
        : sync.pending > 0 || sync.status === 'syncing'
          ? 'var(--accent)'
          : good

  const label =
    sync.status === 'unauthorized'
      ? 'Token needed'
      : sync.status === 'outdated'
        ? 'Reload needed'
        : sync.status === 'error'
          ? 'Sync failed'
          : sync.status === 'offline'
            ? 'Offline'
            : sync.status === 'syncing'
              ? 'Syncing'
              : sync.pending > 0
                ? `${sync.pending} pending`
                : 'Synced'

  const title =
    sync.message ??
    (sync.lastSyncedAt
      ? `Last synced ${new Date(sync.lastSyncedAt).toLocaleString()}`
      : 'Not synced yet')

  return (
    <button
      type="button"
      onClick={syncNow}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface)]"
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${sync.status === 'syncing' ? 'animate-pulse' : ''}`}
        style={{ background: dot }}
        aria-hidden
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
