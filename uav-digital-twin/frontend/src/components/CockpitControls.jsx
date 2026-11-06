import React from 'react'

const THROTTLE_PRESETS = [
  { label: 'IDLE', pct: 0, rpm: '1400' },
  { label: 'CRUISE', pct: 75, rpm: '4700' },
  { label: 'MAX CONT', pct: 90, rpm: '5500' },
  { label: 'TAKEOFF', pct: 100, rpm: '5800' },
]

const LOAD_PRESETS = [
  { label: '0% IDLE', pct: 0 },
  { label: '50% HALF', pct: 50 },
  { label: '75% CRUISE', pct: 75 },
  { label: '100% FULL', pct: 100 },
]

export default function CockpitControls({
  engineStarted,
  toggleEngineStart,
  throttle,
  setThrottle,
  engineLoad,
  setEngineLoad,
}) {
  const commandedRpm = engineStarted
    ? Math.round(1400 + (throttle / 100) * (5800 - 1400))
    : 0

  return (
    <div className="cockpit-controls panel">
      <div className="cockpit-header">
        <div className="cockpit-title-group">
          <span className="panel-label">COCKPIT COMMAND • ROTAX 912</span>
          <span className="cockpit-sub mono">
            {engineStarted ? 'IGNITION ACTIVE • DUAL MAGNETOS ON' : 'IGNITION OFF • COLD STANDBY'}
          </span>
        </div>

        {/* Engine Master Start / Stop Button */}
        <button
          className={`engine-master-btn ${engineStarted ? 'master-running' : 'master-stopped'} mono`}
          onClick={toggleEngineStart}
          title={engineStarted ? 'Cut Ignition & Fuel' : 'Start Engine & Engage Starter'}
        >
          <span className="master-indicator-dot" />
          <span className="master-btn-text">
            {engineStarted ? 'STOP ENGINE' : 'START ENGINE'}
          </span>
        </button>
      </div>

      <div className="cockpit-grid">
        {/* Throttle Control */}
        <div className="control-card">
          <div className="control-card-header">
            <span className="panel-label">THROTTLE LEVER</span>
            <span className="control-val-readout mono">
              {throttle}% <span className="control-sub-val">({commandedRpm} RPM)</span>
            </span>
          </div>

          <div className="slider-wrapper">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={throttle}
              disabled={!engineStarted}
              onChange={(e) => setThrottle(e.target.value)}
              className="aero-slider throttle-slider"
            />
          </div>

          <div className="preset-btn-row">
            {THROTTLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className={`preset-btn mono ${throttle === preset.pct ? 'preset-active' : ''}`}
                disabled={!engineStarted}
                onClick={() => setThrottle(preset.pct)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Engine Load Control */}
        <div className="control-card">
          <div className="control-card-header">
            <span className="panel-label">ENGINE DYNAMOMETER LOAD</span>
            <span className="control-val-readout mono">
              {engineLoad}% <span className="control-sub-val">(PROP RESISTANCE)</span>
            </span>
          </div>

          <div className="slider-wrapper">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={engineLoad}
              disabled={!engineStarted}
              onChange={(e) => setEngineLoad(e.target.value)}
              className="aero-slider load-slider"
            />
          </div>

          <div className="preset-btn-row">
            {LOAD_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className={`preset-btn mono ${engineLoad === preset.pct ? 'preset-active' : ''}`}
                disabled={!engineStarted}
                onClick={() => setEngineLoad(preset.pct)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
