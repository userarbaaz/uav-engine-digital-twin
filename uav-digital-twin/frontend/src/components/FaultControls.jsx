import React, { useState } from 'react'

const FAULTS = [
  { id: 'oil_leak', label: 'Oil Leak' },
  { id: 'overheat', label: 'Overheat' },
  { id: 'misfire', label: 'Misfire' },
  { id: 'low_fuel_pressure', label: 'Low Fuel Pressure' },
]

export default function FaultControls({
  activeFaults = {},
  onToggleFault,
  onClearFault,
  onResetSimulation,
}) {
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)

  const activeIds = Object.keys(activeFaults)

  async function run(action, id) {
    setPending(id)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError('Command failed — is backend / API online?')
    } finally {
      setPending(null)
    }
  }

  const isActive = (id) => activeFaults[id] !== undefined

  return (
    <div className="fault-controls panel">
      <span className="panel-label">Fault Injection — Demo Control</span>
      <p className="fault-hint mono">Select any combination — faults stack and compound on the engine.</p>

      <div className="fault-grid">
        {FAULTS.map((f) => (
          <button
            key={f.id}
            className={`fault-btn ${isActive(f.id) ? 'fault-btn-active' : ''}`}
            disabled={pending !== null}
            onClick={() => run(() => onToggleFault(f.id), f.id)}
          >
            {pending === f.id ? '…' : (isActive(f.id) ? `✓ ${f.label}` : f.label)}
          </button>
        ))}
      </div>

      {activeIds.length > 0 && (
        <div className="active-fault-chips">
          {activeIds.map((id) => {
            const meta = FAULTS.find((f) => f.id === id)
            const severity = activeFaults[id]
            return (
              <span key={id} className="active-fault-chip mono">
                {meta ? meta.label : id}
                <span className="chip-severity">
                  {typeof severity === 'number' ? ` ${Math.round(severity * 100)}%` : ''}
                </span>
                <button
                  className="chip-remove"
                  aria-label={`Clear ${meta ? meta.label : id}`}
                  disabled={pending !== null}
                  onClick={() => run(() => onClearFault(id), id)}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}

      <div className="fault-actions">
        <button
          className="fault-btn fault-btn-clear"
          disabled={pending !== null || activeIds.length === 0}
          onClick={() => run(() => onClearFault(), 'clear')}
        >
          {pending === 'clear' ? 'Clearing…' : 'Clear All Faults'}
        </button>
        <button
          className="fault-btn fault-btn-reset"
          disabled={pending !== null}
          onClick={() => run(onResetSimulation, 'reset')}
        >
          {pending === 'reset' ? 'Resetting…' : 'Reset Flight'}
        </button>
      </div>

      {error && <div className="fault-error mono">{error}</div>}
    </div>
  )
}
