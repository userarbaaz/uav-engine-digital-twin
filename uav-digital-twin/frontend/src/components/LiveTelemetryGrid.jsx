import React from 'react'

/**
 * LiveGraphCard: Responsive SVG line chart matching reference styling.
 */
function LiveGraphCard({
  title,
  dataKey,
  unit = '',
  color,
  history,
  currentValue,
  minBound = 0,
  maxBound = 100,
  decimals = 1,
}) {
  const points = history.map((item) => {
    const val = item ? item[dataKey] : null
    return typeof val === 'number' ? val : null
  }).filter((v) => v !== null)

  const displayVal = currentValue != null
    ? `${Number(currentValue).toFixed(decimals)}${unit ? ' ' + unit : ''}`
    : `--${unit ? ' ' + unit : ''}`

  // Compute dynamic scale bounds with padding
  let effectiveMin = minBound
  let effectiveMax = maxBound
  if (points.length > 1) {
    const dataMin = Math.min(...points)
    const dataMax = Math.max(...points)
    if (minBound == null || dataMin < minBound) effectiveMin = dataMin * 0.9
    if (maxBound == null || dataMax > maxBound) effectiveMax = dataMax * 1.1
  }
  if (effectiveMax <= effectiveMin) effectiveMax = effectiveMin + 1

  // Map history to SVG coordinate points (viewBox 300 x 100)
  const width = 300
  const height = 90
  const paddingX = 10
  const paddingY = 12

  const svgPoints = points.map((val, idx) => {
    const x = points.length <= 1
      ? width / 2
      : paddingX + (idx / (points.length - 1)) * (width - 2 * paddingX)
    const clampedVal = Math.max(effectiveMin, Math.min(effectiveMax, val))
    const normalizedY = (clampedVal - effectiveMin) / (effectiveMax - effectiveMin)
    const y = height - paddingY - normalizedY * (height - 2 * paddingY)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Area under path
  let areaPath = ''
  if (points.length > 1) {
    const firstX = paddingX
    const lastX = width - paddingX
    const bottomY = height - paddingY
    areaPath = `M ${svgPoints.split(' ')[0]} ${svgPoints.split(' ').map((p) => `L ${p}`).join(' ')} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`
  }

  const gradId = `grad-${dataKey}`

  return (
    <div className="telemetry-graph-card">
      <div className="graph-card-header">
        <span className="graph-title mono">{title}</span>
        <span className="graph-current-val mono" style={{ color }}>
          {displayVal}
        </span>
      </div>

      <div className="graph-svg-wrapper">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="graph-svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Dotted horizontal reference grid lines */}
          <line
            x1="0"
            y1={paddingY}
            x2={width}
            y2={paddingY}
            stroke="#1c2b3d"
            strokeWidth="0.8"
            strokeDasharray="3 3"
          />
          <line
            x1="0"
            y1={height / 2}
            x2={width}
            y2={height / 2}
            stroke="#1c2b3d"
            strokeWidth="0.8"
            strokeDasharray="3 3"
          />
          <line
            x1="0"
            y1={height - paddingY}
            x2={width}
            y2={height - paddingY}
            stroke="#1c2b3d"
            strokeWidth="0.8"
            strokeDasharray="3 3"
          />

          {/* Left axis tick marks */}
          <line x1="2" y1={paddingY} x2="6" y2={paddingY} stroke="#334155" strokeWidth="1" />
          <line x1="2" y1={height / 2} x2="6" y2={height / 2} stroke="#334155" strokeWidth="1" />
          <line x1="2" y1={height - paddingY} x2="6" y2={height - paddingY} stroke="#334155" strokeWidth="1" />

          {/* Area fill */}
          {areaPath && (
            <path d={areaPath} fill={`url(#${gradId})`} />
          )}

          {/* Polyline */}
          {points.length > 0 && (
            <polyline
              fill="none"
              stroke={color}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={svgPoints}
            />
          )}

          {/* Current tip pulse */}
          {points.length > 0 && (
            <circle
              cx={svgPoints.split(' ').slice(-1)[0].split(',')[0]}
              cy={svgPoints.split(' ').slice(-1)[0].split(',')[1]}
              r="3.5"
              fill={color}
            />
          )}
        </svg>
      </div>
    </div>
  )
}

/**
 * LiveTelemetryGrid
 * Renders the exact 8-card metric stream + 6-card real-time graphs as shown in user's image.
 */
export default function LiveTelemetryGrid({ telemetry, history = [] }) {
  const t = telemetry || {}
  const diag = t.diagnosis || {}

  const rpm = t.rpm ?? 0
  const cht = t.cht_c ?? 25.0
  const egt = t.egt_c ?? 25.0
  const oilPressure = t.oil_pressure_bar ?? 0.0
  const oilTemp = t.oil_temp_c ?? 25.0
  const vibration = t.vibration_level ?? 0.114
  const fuelFlow = t.fuel_flow_lph ?? 0.0
  const load = t.load_pct ?? 100
  const health = diag.health_score ?? 100

  // History with composite health included
  const enrichedHistory = history.map((item) => ({
    ...item,
    health_score: item?.diagnosis?.health_score ?? 100,
  }))

  return (
    <div className="live-telemetry-container panel">
      <div className="telemetry-section-header">
        <span className="telemetry-sub-badge mono">SENSOR STREAM</span>
        <h2 className="telemetry-title">Live Telemetry</h2>
      </div>

      {/* Top 9 Metric Indicator Cards (Row) */}
      <div className="metric-cards-row">
        <div className="metric-card">
          <span className="metric-label mono">RPM</span>
          <span className="metric-val mono">{Math.round(rpm)}</span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">CHT</span>
          <span className="metric-val mono">
            {cht.toFixed(1)} <span className="metric-unit">°C</span>
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">EGT</span>
          <span className="metric-val mono">
            {egt.toFixed(1)} <span className="metric-unit">°C</span>
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">OIL PRESSURE</span>
          <span className="metric-val mono">
            {oilPressure.toFixed(2)} <span className="metric-unit">bar</span>
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">OIL TEMP</span>
          <span className="metric-val mono">
            {oilTemp.toFixed(1)} <span className="metric-unit">°C</span>
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">VIBRATION</span>
          <span className="metric-val mono">
            {vibration.toFixed(3)} <span className="metric-unit">g</span>
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">FUEL FLOW</span>
          <span className="metric-val mono">
            {fuelFlow.toFixed(1)} <span className="metric-unit">L/h</span>
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">LOAD</span>
          <span className="metric-val mono">
            {Math.round(load)}<span className="metric-unit">%</span>
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label mono">HEALTH</span>
          <span className="metric-val mono">{Math.round(health)}</span>
        </div>
      </div>

      {/* 2x3 Live Telemetry Graphs Grid */}
      <div className="graphs-2x3-grid">
        {/* Graph 1: RPM / TIME (Cyan) */}
        <LiveGraphCard
          title="RPM / TIME"
          dataKey="rpm"
          color="#38bdf8"
          history={enrichedHistory}
          currentValue={rpm}
          minBound={0}
          maxBound={6000}
          decimals={1}
        />

        {/* Graph 2: CHT / TIME (Amber) */}
        <LiveGraphCard
          title="CHT / TIME"
          dataKey="cht_c"
          unit="°C"
          color="#f59e0b"
          history={enrichedHistory}
          currentValue={cht}
          minBound={20}
          maxBound={150}
          decimals={1}
        />

        {/* Graph 3: EGT / TIME (Coral / Red) */}
        <LiveGraphCard
          title="EGT / TIME"
          dataKey="egt_c"
          unit="°C"
          color="#ef4444"
          history={enrichedHistory}
          currentValue={egt}
          minBound={20}
          maxBound={950}
          decimals={1}
        />

        {/* Graph 4: OIL PRESSURE / TIME (Teal) */}
        <LiveGraphCard
          title="OIL PRESSURE / TIME"
          dataKey="oil_pressure_bar"
          unit="bar"
          color="#06b6d4"
          history={enrichedHistory}
          currentValue={oilPressure}
          minBound={0}
          maxBound={6}
          decimals={1}
        />

        {/* Graph 5: VIBRATION / TIME (Amber) */}
        <LiveGraphCard
          title="VIBRATION / TIME"
          dataKey="vibration_level"
          unit="g"
          color="#f59e0b"
          history={enrichedHistory}
          currentValue={vibration}
          minBound={0}
          maxBound={10}
          decimals={3}
        />

        {/* Graph 6: ENGINE HEALTH / TIME (Green) */}
        <LiveGraphCard
          title="ENGINE HEALTH / TIME"
          dataKey="health_score"
          color="#10b981"
          history={enrichedHistory}
          currentValue={health}
          minBound={0}
          maxBound={100}
          decimals={1}
        />
      </div>
    </div>
  )
}
