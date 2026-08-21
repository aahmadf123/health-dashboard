import { useEffect, useState } from 'react'
import type { Theme } from './model'
import { DARK, LIGHT, type ChartColors } from './palette'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Applies the `dark` class to <html> and reports the resolved mode. */
export function useResolvedTheme(theme: Theme): boolean {
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return isDark
}

export function chartColors(isDark: boolean): ChartColors {
  return isDark ? DARK : LIGHT
}
