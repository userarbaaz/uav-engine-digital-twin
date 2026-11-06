import React, { useState } from 'react'
import { useTelemetryPoll } from './hooks/useTelemetryPoll'
import { useAlarm } from './hooks/useAlarm'
import { useAlertLog } from './hooks/useAlertLog'
import { useMissionSession } from './hooks/useMissionSession'
import Gauge from './components/Gauge'
import HealthGauge from './components/HealthGauge'
import DiagnosisPanel from './components/DiagnosisPanel'
import ConfidenceBreakdown from './components/ConfidenceBreakdown'
import MissionStatusBanner from './components/MissionStatusBanner'
import FaultControls from './components/FaultControls'
import ConnectionStatus from './components/ConnectionStatus'
import EngineVisual from './components/EngineVisual'
import CockpitControls from './components/CockpitControls'
import LiveTelemetryGrid from './components/LiveTelemetryGrid'
import AlertLogPanel, { ToastStack } from './components/AlertLogPanel'
import RulCountdown from './components/RulCountdown'
import MissionSummaryModal from './components/MissionSummaryModal'
import './dashboard.css'

const GAUGES = [
  {
    key: 'rpm',
    label: 'RPM',
    unit: 'rpm',
    min: 0,
    max: 6000,
    decimals: 0,
    zones: [
      { from: 5500, to: 5800, color: 'var(--status-warning)' },
      { from: 5800, to: 6000, color: 'var(--status-critical)' },
    ],
  },
  {
    key: 'cht_c',
    label: 'CHT',
    unit: '°C',
    min: 0,
    max: 150,
    decimals: 0,
    zones: [
      { from: 110, to: 135, color: 'var(--status-warning)' },
      { from: 135, to: 150, color: 'var(--status-critical)' },
    ],
  },
  {
    key: 'oil_pressure_bar',
    label: 'Oil Pressure',
    unit: 'bar',
    min: 0,
    max: 8,
    decimals: 2,
    zones: [
      { from: 0, to: 0.8, color: 'var(--status-critical)' },
      { from: 0.8, to: 2.0, color: 'var(--status-warning)' },
      { from: 5.0, to: 7.0, color: 'var(--status-warning)' },
      { from: 7.0, to: 8.0, color: 'var(--status-critical)' },
    ],
  },
  {
    key: 'oil_temp_c',
    label: 'Oil Temp',
    unit: '°C',
    min: 0,
    max: 150,
    decimals: 0,
    zones: [
      { from: 110, to: 130, color: 'var(--status-warning)' },
      { from: 130, to: 150, color: 'var(--status-critical)' },
    ],
  },
  {
    key: 'egt_c',
    label: 'EGT',
    unit: '°C',
    min: 0,
    max: 1000,
    decimals: 0,
    zones: [
      { from: 750, to: 880, color: 'var(--status-warning)' },
      { from: 880, to: 1000, color: 'var(--status-critical)' },
    ],
  },
  {
    key: 'vibration_level',
    label: 'Vibration',
    unit: 'g',
    min: 0,
    max: 10,
    decimals: 3,
    zones: [
      { from: 4, to: 8, color: 'var(--status-warning)' },
      { from: 8, to: 10, color: 'var(--status-critical)' },
    ],
  },
  {
    key: 'fuel_pressure_bar',
    label: 'Fuel Pressure',
    unit: 'bar',
    min: 0,
    max: 0.5,
    decimals: 2,
    zones: [
      { from: 0, to: 0.15, color: 'var(--status-critical)' },
      { from: 0.15, to: 0.2, color: 'var(--status-warning)' },
    ],
  },
]

function formatMissionClock(sec) {
  if (sec == null) return '00:00:00'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':')
}

export default function App() {
  const {
    status,
    telemetry,
    history,
    activeFaults,
    toggleFault,
    clearFault,
    resetSimulation,
    engineStarted,
    toggleEngineStart,
    throttle,
    setThrottle,
    engineLoad,
    setEngineLoad,
  } = useTelemetryPoll()

  const diagnosis = telemetry?.diagnosis ?? null
  // Prefer the server-confirmed fault set once a tick has landed; fall back
  // to the optimistic client-side state for the very first paint.
  const currentFaults = telemetry?.active_faults ?? activeFaults
  const isStale = status !== 'live'

  // ── Feature 1: Alarm on critical severity ─────────────────────────────────
  useAlarm(diagnosis?.severity)

  // ── Feature 3: Alert log + toast notifications ───────────────────────────
  const { log, toasts, dismissToast } = useAlertLog(diagnosis)

  // ── Feature 6: Mission session tracking ──────────────────────────────────
  const { session, resetSession } = useMissionSession(telemetry)
  const [showSummary, setShowSummary] = useState(false)

  async function handleEndMission() {
    setShowSummary(true)
  }

  async function handleResetFlight() {
    await resetSimulation()
    resetSession()
  }

  return (
    <div className="dashboard">
      {/* ── Feature 3: Toast stack (top-right, fixed) ─────────────────────── */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* ── Feature 6: Mission summary modal ─────────────────────────────── */}
      {showSummary && (
        <MissionSummaryModal
          session={session}
          simTimeSec={telemetry?.sim_time_sec}
          onClose={() => {
            setShowSummary(false)
            resetSession()
          }}
        />
      )}

      <header className="dashboard-header">
        <div className="dashboard-title">
          <span className="dashboard-title-main">ROTAX 912 DIGITAL TWIN</span>
          <span className="dashboard-title-sub mono">SIH26054 — MALE UAV Aero Piston Engine Monitor</span>
        </div>
        <div className="dashboard-header-right">
          <div className="mission-clock">
            <span className="panel-label">Mission Time</span>
            <span className="mono mission-clock-value">{formatMissionClock(telemetry?.sim_time_sec)}</span>
          </div>

          {/* ── Feature 4: RUL Countdown — inline header chip ─────────────── */}
          <RulCountdown
            rulSeconds={diagnosis?.rul_seconds}
            severity={diagnosis?.severity}
            healthScore={diagnosis?.health_score}
            compact
          />

          {/* ── Feature 6: End Mission button ────────────────────────────── */}
          <button
            id="end-mission-btn"
            className="end-mission-btn"
            onClick={handleEndMission}
            title="View mission summary report"
          >
            End Mission
          </button>
          <ConnectionStatus status={status} />
        </div>
      </header>

      <MissionStatusBanner diagnosis={diagnosis} />

      <main className={`dashboard-body ${isStale ? 'dashboard-body-stale' : ''}`}>
        {/* Left / Main Column */}
        <div className="main-content-column">
          {/* Section 1: Rotax 912 Engine Digital Twin */}
          <section className="engine-section">
            <EngineVisual
              telemetry={telemetry}
              isStale={isStale}
              engineStarted={engineStarted}
              throttle={throttle}
              activeFaults={currentFaults}
            />
          </section>

          {/* Section 2: Interactive Cockpit Controls (Start/Stop, Throttle, Load) */}
          <section className="controls-section">
            <CockpitControls
              engineStarted={engineStarted}
              toggleEngineStart={toggleEngineStart}
              throttle={throttle}
              setThrottle={setThrottle}
              engineLoad={engineLoad}
              setEngineLoad={setEngineLoad}
            />
          </section>

          {/* Section 3: Analog Avionics Gauges */}
          <section className="gauge-section panel">
            <span className="panel-label section-title">Analog Dial Gauges</span>
            <div className="gauge-grid">
              {GAUGES.map((g) => (
                <Gauge
                  key={g.key}
                  label={g.label}
                  unit={g.unit}
                  min={g.min}
                  max={g.max}
                  decimals={g.decimals}
                  zones={g.zones}
                  value={telemetry ? telemetry[g.key] : null}
                />
              ))}
            </div>
          </section>

          {/* Section 4: Live Telemetry Stream */}
          <section className="telemetry-grid-section">
            <LiveTelemetryGrid
              telemetry={telemetry}
              history={history}
            />
          </section>
        </div>

        {/* Right Column: AI Diagnostics & Fault Controls */}
        <aside className="side-column">
          <DiagnosisPanel diagnosis={diagnosis} activeFaults={currentFaults} />


          {/* ── Feature 7: Confidence Breakdown (collapsed by default) ───── */}
          <ConfidenceBreakdown classProbabilities={telemetry?.class_probabilities} />

          <div className="health-row panel">
            <HealthGauge score={diagnosis?.health_score} />
            <div className="health-row-meta">
              <span className="panel-label">Composite Health Score</span>
              <p className="health-row-copy">
                Heuristic score derived from oil pressure, CHT, EGT, oil temp and
                vibration relative to Rotax 912 operating limits.
              </p>
            </div>
          </div>

          {/* ── Feature 3: Collapsible event log ─────────────────────────── */}
          <AlertLogPanel log={log} />

          <FaultControls
            activeFaults={currentFaults}
            onToggleFault={toggleFault}
            onClearFault={clearFault}
            onResetSimulation={handleResetFlight}
          />
        </aside>
      </main>
    </div>
  )
}
