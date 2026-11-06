import React from 'react'

const SEVERITY_META = {
  normal: { color: 'var(--status-normal)', dim: 'var(--status-normal-dim)', word: 'NOMINAL' },
  warning: { color: 'var(--status-warning)', dim: 'var(--status-warning-dim)', word: 'CAUTION' },
  critical: { color: 'var(--status-critical)', dim: 'var(--status-critical-dim)', word: 'CRITICAL' },
}

const FAULT_LABELS = {
  oil_leak: 'Oil Leak',
  overheat: 'Overheat',
  misfire: 'Misfire',
  low_fuel_pressure: 'Low Fuel Pressure',
}

function formatRul(seconds) {
  if (seconds == null) return null
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem.toString().padStart(2, '0')}s`
}

export default function DiagnosisPanel({ diagnosis, activeFaults = {} }) {
  const meta = SEVERITY_META[diagnosis?.severity] ?? SEVERITY_META.normal
  const rul = formatRul(diagnosis?.rul_seconds)
  const groundTruthIds = Object.keys(activeFaults).filter((id) => activeFaults[id] > 0)

  return (
    <div
      className="diagnosis-panel panel"
      style={{ borderColor: diagnosis ? meta.color : 'var(--border)' }}
    >
      <div className="diagnosis-header">
        <span className="panel-label">Diagnosis</span>
        <span className="diagnosis-badge mono" style={{ color: meta.color, borderColor: meta.color }}>
          {diagnosis ? meta.word : 'NO SIGNAL'}
        </span>
      </div>

      <div className="diagnosis-body">
        <div className="diagnosis-label" style={{ color: diagnosis ? meta.color : 'var(--text-tertiary)' }}>
          {diagnosis?.label ?? 'Awaiting telemetry…'}
        </div>
        <p className="diagnosis-message">{diagnosis?.message ?? ''}</p>
      </div>

      {rul && (
        <div className="rul-callout" style={{ borderColor: meta.color, background: meta.dim }}>
          <span className="panel-label">Estimated time to critical</span>
          <span className="rul-value mono" style={{ color: meta.color }}>
            {rul}
          </span>
        </div>
      )}

      <div className="diagnosis-footer">
        <div className="diagnosis-stat">
          <span className="panel-label">Model confidence</span>
          <span className="mono">{diagnosis?.confidence ?? '—'}</span>
        </div>
        <div className="diagnosis-stat">
          <span className="panel-label">Anomaly flag</span>
          <span className="mono" style={{ color: diagnosis?.anomaly_flag ? 'var(--status-warning)' : 'var(--text-secondary)' }}>
            {diagnosis ? (diagnosis.anomaly_flag ? 'YES' : 'NO') : '—'}
          </span>
        </div>
      </div>

      {/* Feature 8: Single-fault limitation disclaimer */}
      <p className="diagnosis-limitation-note mono" title="The Random Forest classifier was trained on single-fault scenarios and outputs one label per reading. Multi-fault compound states are not yet classified.">
        ⓘ Optimised for single active-fault detection
      </p>

      {/*
        The classifier above only ever returns ONE label at a time (its best
        guess). The simulator can have several faults injected simultaneously,
        so we show that ground truth here, separately, for comparison against
        the model's single-label call.
      */}
      <div className="diagnosis-ground-truth">
        <span className="panel-label">Injected Ground Truth (Simulator)</span>
        {groundTruthIds.length === 0 ? (
          <p className="diagnosis-ground-truth-empty mono">No faults injected</p>
        ) : (
          <div className="ground-truth-chips">
            {groundTruthIds.map((id) => (
              <span key={id} className="active-fault-chip ground-truth-chip mono">
                {FAULT_LABELS[id] ?? id}
                <span className="chip-severity"> {Math.round(activeFaults[id] * 100)}%</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
