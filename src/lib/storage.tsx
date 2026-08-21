import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { emptyData, type AppData } from './model'

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
  /** Apply an update; the result is persisted to localStorage immediately. */
  update: (fn: (prev: AppData) => AppData) => void
  /** Replace the whole dataset (backup restore, clear). */
  replace: (next: AppData) => void
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)

  useEffect(() => {
    saveData(data)
  }, [data])

  const update = useCallback((fn: (prev: AppData) => AppData) => {
    setData((prev) => fn(prev))
  }, [])

  const replace = useCallback((next: AppData) => {
    setData(next)
  }, [])

  const value = useMemo(() => ({ data, update, replace }), [data, update, replace])
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider')
  return ctx
}
