import React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

function formatClock(sec) {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip mono">
      <div className="chart-tooltip-time">{formatClock(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value.toFixed(2)}
        </div>
      ))}
    </div>
  )
}

export default function TrendChart({ history }) {
  return (
    <div className="trend-chart panel">
      <div className="trend-chart-header">
        <span className="panel-label">Oil Pressure &amp; CHT Trend</span>
        <span className="panel-label" style={{ color: 'var(--text-tertiary)' }}>
          last {Math.round((history.length * 2) / 60) || 0} min
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="sim_time_sec"
            tickFormatter={formatClock}
            stroke="var(--text-tertiary)"
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 11 }}
            minTickGap={40}
          />
          <YAxis
            yAxisId="oil"
            stroke="var(--data-cyan)"
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 11 }}
            domain={[0, 8]}
            width={34}
          />
          <YAxis
            yAxisId="cht"
            orientation="right"
            stroke="var(--status-warning)"
            tick={{ fontFamily: 'IBM Plex Mono', fontSize: 11 }}
            domain={[0, 160]}
            width={34}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            yAxisId="oil"
            type="monotone"
            dataKey="oil_pressure_bar"
            name="Oil Pressure (bar)"
            stroke="var(--data-cyan)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Line
            yAxisId="cht"
            type="monotone"
            dataKey="cht_c"
            name="CHT (°C)"
            stroke="var(--status-warning)"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="trend-legend mono">
        <span style={{ color: 'var(--data-cyan)' }}>● Oil Pressure (bar)</span>
        <span style={{ color: 'var(--status-warning)' }}>● CHT (°C)</span>
      </div>
    </div>
  )
}
