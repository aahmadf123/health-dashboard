import { useState } from 'react'
import { AppDataProvider, useAppData } from './lib/storage'
import { useResolvedTheme } from './lib/theme'
import OverviewTab from './components/tabs/OverviewTab'
import WeightTab from './components/tabs/WeightTab'
import BpTab from './components/tabs/BpTab'
import LabsTab from './components/tabs/LabsTab'
import InjectionsTab from './components/tabs/InjectionsTab'
import MeasurementsTab from './components/tabs/MeasurementsTab'
import SleepTab from './components/tabs/SleepTab'
import JournalTab from './components/tabs/JournalTab'
import DataTab from './components/tabs/DataTab'

export type TabKey =
  | 'overview'
  | 'weight'
  | 'bp'
  | 'labs'
  | 'injections'
  | 'measurements'
  | 'sleep'
  | 'journal'
  | 'data'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'weight', label: 'Weight & Body' },
  { key: 'bp', label: 'Blood Pressure' },
  { key: 'labs', label: 'Labs' },
  { key: 'injections', label: 'Injections' },
  { key: 'measurements', label: 'Measurements' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'journal', label: 'Journal' },
  { key: 'data', label: 'Data' },
]

function Shell() {
  const { data, update } = useAppData()
  const [tab, setTab] = useState<TabKey>('overview')
  const isDark = useResolvedTheme(data.settings.theme)
  const units = data.settings.units

  const goTo = (t: TabKey) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  const toggleUnits = () => {
    update((prev) => ({
      ...prev,
      settings: { ...prev.settings, units: prev.settings.units === 'lb' ? 'kg' : 'lb' },
    }))
  }

  const toggleTheme = () => {
    update((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        theme: isDark ? 'light' : 'dark',
      },
    }))
  }

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-3 pb-10 sm:px-5">
      <header className="flex items-center gap-3 py-4">
        <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden>
          <rect width="48" height="48" rx="10" fill="#0f766e" />
          <path
            d="M6 26h8l4-12 8 20 5-14 3 6h8"
            fill="none"
            stroke="#fff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="text-lg font-bold sm:text-xl">Health Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleUnits}
            className="rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--surface)]"
            title="Switch units"
          >
            {units === 'lb' ? 'lb / in' : 'kg / cm'}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface)]"
            title="Toggle dark mode"
            aria-label="Toggle dark mode"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <nav className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0" aria-label="Sections">
        <div className="flex w-max gap-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-1 sm:w-full sm:flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => goTo(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:bg-[var(--page)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main>
        {tab === 'overview' && <OverviewTab isDark={isDark} goTo={goTo} />}
        {tab === 'weight' && <WeightTab isDark={isDark} />}
        {tab === 'bp' && <BpTab isDark={isDark} />}
        {tab === 'labs' && <LabsTab isDark={isDark} />}
        {tab === 'injections' && <InjectionsTab isDark={isDark} />}
        {tab === 'measurements' && <MeasurementsTab isDark={isDark} />}
        {tab === 'sleep' && <SleepTab isDark={isDark} />}
        {tab === 'journal' && <JournalTab />}
        {tab === 'data' && <DataTab />}
      </main>

      <footer className="mt-8 border-t border-[var(--hairline)] pt-4 text-xs text-[var(--muted)]">
        <p>
          Personal tracking only, not medical advice. Talk to your clinician about your
          results and before changing any medication.
        </p>
        <p className="mt-1">
          Your data is stored only in this browser. Back it up from the Data tab.
        </p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  )
}
