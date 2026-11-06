import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useAlertLog — Feature 3
 *
 * Tracks state transitions of `diagnosis.severity` and emits log entries
 * ONLY when the severity actually changes (normal→warning, warning→critical, etc.).
 * Does NOT duplicate entries for every tick while a fault stays active.
 *
 * Returns:
 *   log        — array of { id, ts, label, message, severity } (newest last)
 *   toasts     — currently visible toasts (auto-dismissed after 6s)
 *   dismissToast(id) — manually dismiss a toast
 */
export function useAlertLog(diagnosis) {
  const prevSeverityRef = useRef(null)
  const [log, setLog] = useState([])
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    if (!diagnosis) return
    const { severity, label, message } = diagnosis
    if (severity === prevSeverityRef.current) return // no transition

    prevSeverityRef.current = severity

    // Only log/toast on non-normal transitions (or transition back to normal)
    const isInteresting = severity === 'warning' || severity === 'critical' || (
      severity === 'normal' && log.length > 0
    )
    if (!isInteresting) return

    const now = new Date()
    const ts = now.toLocaleTimeString('en-GB', { hour12: false }) // HH:MM:SS
    const entry = {
      id: `${Date.now()}-${Math.random()}`,
      ts,
      label: label ?? 'System',
      message: message ?? '',
      severity,
    }

    setLog((prev) => [...prev, entry])

    if (severity === 'warning' || severity === 'critical') {
      const toast = { ...entry }
      setToasts((prev) => [...prev, toast])
      // Auto-dismiss after 6 seconds
      setTimeout(() => dismissToast(toast.id), 6000)
    }
  }, [diagnosis?.severity, diagnosis?.label]) // eslint-disable-line react-hooks/exhaustive-deps

  return { log, toasts, dismissToast }
}
