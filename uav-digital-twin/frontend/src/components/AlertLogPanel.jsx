import React, { useState } from 'react'

const SEVERITY_ICON = {
  warning: '⚠',
  critical: '🔴',
  normal: '✓',
}

const SEVERITY_COLOR = {
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
  normal: 'var(--status-normal)',
}

/**
 * ToastStack — Feature 3 (toast part)
 * Renders the currently-active toast notifications in the top-right corner.
 */
export function ToastStack({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null

  return (
    <div className="toast-stack" role="log" aria-live="assertive" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.severity}`}
          role="alert"
        >
          <div className="toast-header">
            <span className="toast-icon">{SEVERITY_ICON[t.severity] ?? '●'}</span>
            <span className="toast-label mono">{t.label}</span>
            <span className="toast-time mono">{t.ts}</span>
            <button
              className="toast-dismiss"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
          <p className="toast-message">{t.message}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * AlertLogPanel — Feature 3 (collapsible log part)
 * Appended to the right sidebar. Collapsible. Shows full history.
 */
export default function AlertLogPanel({ log }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="alert-log-panel panel">
      <button
        type="button"
        className="alert-log-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="panel-label">Alert Event Log</span>
        <div className="alert-log-toggle-right">
          {log.length > 0 && (
            <span className="alert-log-count mono">{log.length}</span>
          )}
          <span className="confidence-breakdown-chevron mono">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="alert-log-body">
          {log.length === 0 ? (
            <p className="alert-log-empty mono">No alerts during this session.</p>
          ) : (
            <ul className="alert-log-list">
              {[...log].reverse().map((entry) => (
                <li
                  key={entry.id}
                  className={`alert-log-entry alert-log-entry-${entry.severity}`}
                >
                  <span className="alert-log-ts mono">{entry.ts}</span>
                  <span
                    className="alert-log-icon"
                    style={{ color: SEVERITY_COLOR[entry.severity] }}
                  >
                    {SEVERITY_ICON[entry.severity]}
                  </span>
                  <span className="alert-log-text">
                    <strong>{entry.label}</strong>
                    {' — '}
                    {entry.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
