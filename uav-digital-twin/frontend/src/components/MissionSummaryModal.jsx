import React from 'react'

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rem = s % 60
  if (h > 0) return `${h}h ${m}m ${rem}s`
  if (m > 0) return `${m}m ${rem}s`
  return `${rem}s`
}

const SEV_COLOR = {
  normal: 'var(--status-normal)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
}

const SEV_LABEL = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
}

/**
 * MissionSummaryModal — Feature 6
 *
 * Shown when the user clicks "End Mission" or after Reset.
 * Displays a post-flight summary card with:
 *   - Total flight time
 *   - Faults encountered (with timestamps)
 *   - Worst health score
 *   - Time spent in each severity state
 *
 * Props:
 *   session   — from useMissionSession
 *   simTimeSec — current sim_time_sec from telemetry (total flight time)
 *   onClose   — callback to hide the modal
 */
export default function MissionSummaryModal({ session, simTimeSec, onClose }) {
  if (!session) return null

  const flightTime = simTimeSec ?? Math.round((Date.now() - session.startedAt) / 1000)
  const severityKeys = ['normal', 'warning', 'critical']
  const totalTracked = severityKeys.reduce(
    (acc, k) => acc + (session.timeInSeverity[k] || 0),
    0
  )

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Mission Summary">
      <div className="modal-card mission-summary-modal">
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title mono">MISSION SUMMARY REPORT</span>
          <span className="modal-subtitle">SIH26054 — Post-Flight Analysis</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close summary">×</button>
        </div>

        {/* KPI Row */}
        <div className="summary-kpi-row">
          <div className="summary-kpi">
            <span className="panel-label">Total Flight Time</span>
            <span className="summary-kpi-val mono">{fmtDuration(flightTime)}</span>
          </div>
          <div className="summary-kpi">
            <span className="panel-label">Worst Health Score</span>
            <span
              className="summary-kpi-val mono"
              style={{
                color: session.worstHealthScore < 40
                  ? 'var(--status-critical)'
                  : session.worstHealthScore < 70
                  ? 'var(--status-warning)'
                  : 'var(--status-normal)',
              }}
            >
              {Math.round(session.worstHealthScore)}
            </span>
          </div>
          <div className="summary-kpi">
            <span className="panel-label">Fault Events</span>
            <span className="summary-kpi-val mono">{session.faultEvents.length}</span>
          </div>
        </div>

        {/* Severity time breakdown */}
        <div className="summary-section">
          <span className="panel-label summary-section-title">Time in Severity State</span>
          <div className="summary-sev-bars">
            {severityKeys.map((k) => {
              const t = session.timeInSeverity[k] || 0
              const pct = totalTracked > 0 ? (t / totalTracked) * 100 : 0
              return (
                <div key={k} className="summary-sev-row">
                  <span className="summary-sev-label mono" style={{ color: SEV_COLOR[k] }}>
                    {SEV_LABEL[k]}
                  </span>
                  <div className="summary-sev-track">
                    <div
                      className="summary-sev-fill"
                      style={{ width: `${pct}%`, background: SEV_COLOR[k] }}
                    />
                  </div>
                  <span className="summary-sev-time mono">{fmtDuration(t)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Fault event log */}
        <div className="summary-section">
          <span className="panel-label summary-section-title">Fault Events</span>
          {session.faultEvents.length === 0 ? (
            <p className="summary-empty mono">No faults detected during this mission. ✓</p>
          ) : (
            <ul className="summary-fault-list">
              {session.faultEvents.map((ev, i) => (
                <li key={i} className="summary-fault-entry">
                  <span className="summary-fault-ts mono">{ev.ts}</span>
                  <span
                    className="summary-fault-sev mono"
                    style={{ color: SEV_COLOR[ev.severity] }}
                  >
                    {ev.severity.toUpperCase()}
                  </span>
                  <span className="summary-fault-label">{ev.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-footer">
          <button className="summary-close-btn" onClick={onClose}>
            Close &amp; Continue
          </button>
        </div>
      </div>
    </div>
  )
}
