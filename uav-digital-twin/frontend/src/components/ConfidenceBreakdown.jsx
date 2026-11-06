import React, { useState } from 'react'

// Fault-class -> display label. "none" is the model's "no fault" class.
const CLASS_LABELS = {
  none: 'No Fault',
  oil_leak: 'Oil Leak',
  overheat: 'Overheat',
  misfire: 'Misfire',
  low_fuel_pressure: 'Low Fuel Pressure',
}

/**
 * ConfidenceBreakdown
 * Collapsed-by-default panel showing the classifier's FULL probability
 * distribution across every fault class for the current reading, not
 * just the top prediction already shown in DiagnosisPanel. This is a
 * Q&A safety net for judges, not a primary display element, so it
 * starts collapsed and stays out of the way otherwise.
 */
export default function ConfidenceBreakdown({ classProbabilities }) {
  const [open, setOpen] = useState(false)

  const entries = classProbabilities
    ? Object.entries(classProbabilities).sort((a, b) => b[1] - a[1])
    : []

  return (
    <div className="confidence-breakdown panel">
      <button
        type="button"
        className="confidence-breakdown-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="panel-label">Confidence Breakdown (All Classes)</span>
        <span className="confidence-breakdown-chevron mono">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="confidence-breakdown-body">
          {entries.length === 0 ? (
            <p className="confidence-breakdown-empty mono">Awaiting telemetry…</p>
          ) : (
            entries.map(([cls, p]) => {
              const pct = Math.round(p * 1000) / 10 // one decimal place
              return (
                <div className="confidence-bar-row" key={cls}>
                  <span className="confidence-bar-label mono">{CLASS_LABELS[cls] ?? cls}</span>
                  <div className="confidence-bar-track">
                    <div
                      className="confidence-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                  <span className="confidence-bar-value mono">{pct}%</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
