import React, { useEffect, useRef, useState } from 'react'

/**
 * RulCountdown — Feature 4
 *
 * ALWAYS visible. Two data sources:
 *   1. `rulSeconds` (real ML estimate from backend, present only for oil_leak)
 *      → Ticks down client-side between WebSocket updates, resyncs each tick.
 *   2. `healthScore` (always present) → used to derive a rough linear estimate
 *      when no fault-specific rul_seconds is available.
 *
 * Two display modes:
 *   compact=false (default) — tall card for sidebar
 *   compact=true            — slim horizontal chip for the dashboard header
 *
 * Estimate logic when no rul_seconds from backend:
 *   health 100 → ~3h 00m (10 800 s) — fully healthy, long service life
 *   health 70  → ~1h 00m (3 600 s)  — caution threshold
 *   health 40  → ~10m 00m (600 s)   — near no-go
 *   health 0   → 0s
 * Linear interpolation between these waypoints.
 */

function estimateFromHealth(health) {
  // Piecewise curve — mirrors backend _estimate_rul() for a 30-60 min flight lifecycle:
  //  100% → 3600 s (1 h 00 m)
  //   90% → 2700 s (45 min)
  //   70% → 1800 s (30 min)
  //   50% →  900 s (15 min)
  //   30% →  300 s  (5 min)
  //   10% →   60 s  (1 min)
  //    0% →    0 s
  const h = Math.max(0, Math.min(100, health ?? 100))
  if (h >= 90) {
    return Math.round(2700 + ((h - 90) / 10) * 900)
  } else if (h >= 70) {
    return Math.round(1800 + ((h - 70) / 20) * 900)
  } else if (h >= 50) {
    return Math.round(900 + ((h - 50) / 20) * 900)
  } else if (h >= 30) {
    return Math.round(300 + ((h - 30) / 20) * 600)
  } else if (h >= 10) {
    return Math.round(60 + ((h - 10) / 20) * 240)
  } else {
    return Math.round((h / 10) * 60)
  }
}

function fmt(s) {
  if (s == null || s < 0) return '0m 00s'
  const sRound = Math.max(0, Math.round(s))
  const h = Math.floor(sRound / 3600)
  const m = Math.floor((sRound % 3600) / 60)
  const rem = sRound % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}m ${rem.toString().padStart(2, '0')}s`
}

export default function RulCountdown({
  rulSeconds,
  severity,
  healthScore,
  compact = false,
}) {
  const [display, setDisplay] = useState('—')
  const [isEstimate, setIsEstimate] = useState(true)
  const timerRef = useRef(null)
  const valueRef = useRef(null)

  useEffect(() => {
    // Determine base value: prefer real rul_seconds, fall back to health estimate
    const base = rulSeconds != null
      ? rulSeconds
      : estimateFromHealth(healthScore)
    const isEst = rulSeconds == null

    valueRef.current = base
    setIsEstimate(isEst)
    setDisplay(fmt(base))

    // Clear old interval, start fresh countdown from new base
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (valueRef.current == null) return
      valueRef.current = Math.max(0, valueRef.current - 1)
      setDisplay(fmt(valueRef.current))
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [rulSeconds, healthScore]) // re-sync whenever either changes

  const color =
    severity === 'critical'
      ? 'var(--status-critical)'
      : severity === 'warning'
      ? 'var(--status-warning)'
      : 'var(--status-normal)'
  const dimBg =
    severity === 'critical'
      ? 'var(--status-critical-dim)'
      : severity === 'warning'
      ? 'var(--status-warning-dim)'
      : 'var(--status-normal-dim)'

  // ── COMPACT (header chip) ─────────────────────────────────────────────────
  if (compact) {
    return (
      <div
        className={`rul-chip rul-chip-${severity ?? 'normal'}`}
        style={{ borderColor: color, background: dimBg }}
        role="status"
        aria-live="polite"
        title={
          isEstimate
            ? 'Estimated flight life based on composite health score. Resets when a fault is detected.'
            : 'ML-derived Remaining Useful Life — estimated time until engine reaches critical state.'
        }
      >
        <span className="rul-chip-icon" style={{ color }}>⏱</span>
        <div className="rul-chip-body">
          <span className="rul-chip-label panel-label" style={{ color }}>
            {isEstimate ? 'Est. flight life' : 'Est. time to critical'}
          </span>
          <span className="rul-chip-value mono" style={{ color }}>
            {display}
            {isEstimate && (
              <span className="rul-chip-tilde"> ~</span>
            )}
          </span>
        </div>
      </div>
    )
  }

  // ── FULL (sidebar card) ───────────────────────────────────────────────────
  return (
    <div
      className="rul-countdown"
      style={{ borderColor: color, background: dimBg }}
      role="status"
      aria-live="polite"
    >
      <div className="rul-countdown-header">
        <span className="rul-countdown-icon" style={{ color }}>⏱</span>
        <span className="panel-label" style={{ color }}>
          {isEstimate ? 'Est. flight life remaining' : 'Est. time until critical'}
        </span>
      </div>
      <span className="rul-countdown-value mono" style={{ color }}>
        {display}{isEstimate && ' ~'}
      </span>
      <p className="rul-countdown-sub">
        {isEstimate
          ? 'Health-score estimate — updates each telemetry tick'
          : 'ML-derived RUL — resyncs each telemetry tick'}
      </p>
    </div>
  )
}
