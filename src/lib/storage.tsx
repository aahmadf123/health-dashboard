import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { emptyData, type AppData } from './model'
import { buildBackup } from './export'
import {
  PREMIGRATION_KEY,
  bootstrapMeta,
  diffAndStamp,
  loadMeta,
  pendingCount,
  saveMeta,
  type SyncMeta,
} from './sync-meta'
import {
  applySyncResult,
  backoffDelay,
  isOffline,
  pushPull,
  type SyncState,
} from './sync-client'
import { UnauthorizedError } from './api'

const STORAGE_KEY = 'health-dashboard-v1'

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    const parsed = JSON.parse(raw) as AppData
    if (parsed?.version !== 1) return emptyData()
    // Fill any fields added since the data was saved.
    const base = emptyData()
    return {
      ...base,
      ...parsed,
      settings: {
        ...base.settings,
        ...parsed.settings,
        injectionSchedule: {
          ...base.settings.injectionSchedule,
          ...parsed.settings?.injectionSchedule,
        },
      },
    }
  } catch {
    return emptyData()
  }
}

function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('Failed to save data', err)
  }
}

interface AppDataContextValue {
  data: AppData
  /** Apply an update; the result is persisted locally and queued for sync. */
  update: (fn: (prev: AppData) => AppData) => void
  /** Replace the whole dataset (backup restore, clear). */
  replace: (next: AppData) => void
  sync: SyncState
  /** Force a sync attempt now, for the button in the Data tab. */
  syncNow: () => void
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)
  const [sync, setSync] = useState<SyncState>({
    status: 'idle',
    pending: 0,
    lastSyncedAt: null,
    quarantined: 0,
  })

  // The sidecar is kept in a ref, not state: it changes on every edit and on
  // every sync round, and nothing renders directly from it except the small
  // summary mirrored into `sync` above.
  const metaRef = useRef<SyncMeta | null>(null)
  const prevDataRef = useRef<AppData>(data)
  const dataRef = useRef<AppData>(data)
  /**
   * Set while a pull's result is being written back, so the persistence effect
   * below skips diffing it. Without this, applying a pull would re-stamp every
   * row it just merged as locally modified and push them straight back, and the
   * two sides would trade the same rows forever.
   */
  const applyingRemote = useRef(false)
  const startedRef = useRef(false)
  const runningRef = useRef(false)
  const failuresRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const publish = useCallback((meta: SyncMeta, status: SyncStatus, message?: string) => {
    setSync({
      status,
      pending: pendingCount(meta),
      lastSyncedAt: meta.lastSyncedAt,
      quarantined: meta.quarantine.length,
      message,
    })
  }, [])

  /**
   * Lazily initialise the sidecar. Its absence is what marks a device as never
   * synced, and detecting that cannot disturb the data key. Called from effects
   * rather than during render, since it both reads and writes localStorage.
   */
  const ensureMeta = useCallback((current: AppData): SyncMeta => {
    const existing = metaRef.current
    if (existing) return existing

    const stored = loadMeta()
    if (stored) {
      metaRef.current = stored
      return stored
    }

    const fresh = bootstrapMeta(current, Date.now())
    metaRef.current = fresh
    saveMeta(fresh)
    // Snapshot before this device has uploaded anything, so there is an offline
    // undo for the one moment that feels irreversible. Only worth doing when
    // there is data to protect: a brand new device has nothing to lose.
    try {
      if (pendingCount(fresh) > 1 && !localStorage.getItem(PREMIGRATION_KEY)) {
        localStorage.setItem(PREMIGRATION_KEY, buildBackup(current))
      }
    } catch {
      // A full quota is not a reason to block startup.
    }
    return fresh
  }, [])

  /**
   * Queue the next sync attempt. It reaches runSync through a ref because the
   * two call each other: a sync schedules its own retry or its next chunk.
   */
  const runSyncRef = useRef<(() => Promise<void>) | null>(null)
  const arm = useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void runSyncRef.current?.()
    }, ms)
  }, [])

  // Persist locally and record what changed. localStorage is written first and
  // unconditionally, so the app keeps working with no network at all.
  useEffect(() => {
    saveData(data)
    dataRef.current = data

    const prev = prevDataRef.current
    prevDataRef.current = data
    const meta = ensureMeta(data)

    if (applyingRemote.current) {
      applyingRemote.current = false
      return
    }
    if (prev === data) return

    const next = diffAndStamp(prev, data, meta, Date.now())
    if (next !== meta) {
      metaRef.current = next
      saveMeta(next)
      publish(next, 'idle')
      arm(300)
    }
  }, [data, publish, ensureMeta, arm])

  const runSync = useCallback(async () => {
    if (runningRef.current) return
    const meta = ensureMeta(dataRef.current)

    if (isOffline()) {
      publish(meta, 'offline')
      arm(backoffDelay(failuresRef.current))
      return
    }

    runningRef.current = true
    publish(meta, 'syncing')

    try {
      const { plan, res } = await pushPull(dataRef.current, meta)

      // Re-read the refs rather than reusing the snapshot above: the user can
      // submit an entry while the request is in flight, and the persistence
      // effect will have recorded it in both. Merging into the snapshot would
      // drop its dirty marker so it never uploaded, and would wipe the entry
      // itself off the screen.
      const out = applySyncResult(dataRef.current, metaRef.current ?? meta, plan, res)
      metaRef.current = out.meta
      saveMeta(out.meta)
      failuresRef.current = 0

      if (out.dataChanged) {
        applyingRemote.current = true
        prevDataRef.current = out.data
        setData(out.data)
      }

      publish(out.meta, 'idle')
      // Another push chunk or another pull page is waiting; keep going.
      if (out.more) arm(50)
    } catch (err) {
      failuresRef.current += 1
      const outdated = err instanceof Error && err.message === 'schema mismatch'
      const unauthorized = err instanceof UnauthorizedError
      publish(
        metaRef.current ?? meta,
        outdated ? 'outdated' : unauthorized ? 'unauthorized' : isOffline() ? 'offline' : 'error',
        outdated
          ? 'This page is older than the server. Reload to get the latest version.'
          : err instanceof Error
            ? err.message
            : 'Sync failed'
      )
      // Neither an outdated client nor a missing token is fixed by retrying:
      // one needs a reload, the other needs the user to enter a token.
      if (!outdated && !unauthorized) arm(backoffDelay(failuresRef.current))
    } finally {
      runningRef.current = false
    }
  }, [publish, ensureMeta, arm])

  useEffect(() => {
    runSyncRef.current = runSync
  }, [runSync])

  useEffect(() => {
    // Guarded so React's development double-effect does not sync twice.
    if (startedRef.current) return
    startedRef.current = true
    void runSync()

    const onOnline = () => void runSync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [runSync])

  const update = useCallback((fn: (prev: AppData) => AppData) => {
    setData((prev) => fn(prev))
  }, [])

  const replace = useCallback((next: AppData) => {
    setData(next)
  }, [])

  const syncNow = useCallback(() => {
    failuresRef.current = 0
    void runSync()
  }, [runSync])

  const value = useMemo(
    () => ({ data, update, replace, sync, syncNow }),
    [data, update, replace, sync, syncNow]
  )
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider')
  return ctx
}

type SyncStatus = SyncState['status']
