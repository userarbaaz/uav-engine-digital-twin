import { useEffect, useRef, useState } from 'react'

/**
 * useMissionSession — Feature 6
 *
 * Accumulates session statistics from the live telemetry stream so the
 * post-flight summary modal has something to show.
 *
 * Tracked client-side (in memory). Resets when resetSession() is called
 * (wired up to the "End Mission" button and the existing Reset Flight).
 */
export function useMissionSession(telemetry) {
  const [session, setSession] = useState(makeBlankSession())
  const prevRef = useRef({ severity: null, faults: [] })

  function makeBlankSession() {
    return {
      startedAt: Date.now(),
      worstHealthScore: 100,
      faultEvents: [],         // { ts, label, severity }
      timeInSeverity: { normal: 0, warning: 0, critical: 0 },
      lastTickAt: null,
      lastSeverity: 'normal',
    }
  }

  const resetSession = () => setSession(makeBlankSession())

  useEffect(() => {
    if (!telemetry) return
    const diag = telemetry.diagnosis
    if (!diag) return

    const { severity, label, health_score } = diag
    const now = Date.now()

    setSession((prev) => {
      const dt = prev.lastTickAt ? (now - prev.lastTickAt) / 1000 : 0
      const newTimeInSeverity = { ...prev.timeInSeverity }
      newTimeInSeverity[prev.lastSeverity] = (newTimeInSeverity[prev.lastSeverity] || 0) + dt

      const newFaultEvents = [...prev.faultEvents]
      if (
        severity !== 'normal' &&
        severity !== prev.lastSeverity
      ) {
        const ts = new Date().toLocaleTimeString('en-GB', { hour12: false })
        newFaultEvents.push({ ts, label: label ?? 'Unknown', severity })
      }

      return {
        ...prev,
        worstHealthScore: Math.min(prev.worstHealthScore, health_score ?? 100),
        faultEvents: newFaultEvents,
        timeInSeverity: newTimeInSeverity,
        lastTickAt: now,
        lastSeverity: severity ?? 'normal',
      }
    })
  }, [telemetry])

  return { session, resetSession }
}
