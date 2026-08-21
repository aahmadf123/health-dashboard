import { useState, type ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 sm:p-5 ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-[var(--ink-2)]">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-[var(--hairline)] bg-[var(--page)] px-3 py-2 text-sm ' +
  'text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]'

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
}) {
  const styles = {
    primary:
      'bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40',
    ghost:
      'border border-[var(--hairline)] bg-transparent text-[var(--ink)] hover:bg-[var(--page)] disabled:opacity-40',
    danger:
      'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 disabled:opacity-40',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

/** Delete button that asks for a second tap to confirm. */
export function DeleteButton({ onDelete, label = 'Delete' }: { onDelete: () => void; label?: string }) {
  const [arm, setArm] = useState(false)
  if (!arm) {
    return (
      <button
        type="button"
        onClick={() => {
          setArm(true)
          setTimeout(() => setArm(false), 3000)
        }}
        className="text-xs text-[var(--muted)] underline-offset-2 hover:underline"
      >
        {label}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        setArm(false)
        onDelete()
      }}
      className="text-xs font-semibold text-red-600 underline-offset-2 hover:underline dark:text-red-400"
    >
      Confirm?
    </button>
  )
}

export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-[var(--accent)] underline-offset-2 hover:underline"
    >
      Edit
    </button>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--axis)] px-4 py-8 text-center text-sm text-[var(--muted)]">
      {children}
    </div>
  )
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  )
}

export function StatTile({
  label,
  value,
  sub,
  subClass = '',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  subClass?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub !== undefined && sub !== null && (
        <div className={`mt-1 text-xs text-[var(--ink-2)] ${subClass}`}>{sub}</div>
      )}
    </div>
  )
}

/** Scrollable table wrapper so wide tables never scroll the page. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export const thClass =
  'whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-[var(--ink-2)]'
export const tdClass = 'whitespace-nowrap px-2 py-2 text-sm tabular-nums'
