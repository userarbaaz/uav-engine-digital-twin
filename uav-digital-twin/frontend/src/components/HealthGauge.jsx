import React, { useMemo } from 'react'

const SIZE = 156
const STROKE = 12
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

function colorForScore(score) {
  if (score >= 80) return 'var(--status-normal)'
  if (score >= 50) return 'var(--status-warning)'
  return 'var(--status-critical)'
}

export default function HealthGauge({ score }) {
  const pct = score == null ? 0 : Math.min(100, Math.max(0, score)) / 100
  const dash = useMemo(() => `${CIRC * pct} ${CIRC}`, [pct])
  const color = score == null ? 'var(--text-tertiary)' : colorForScore(score)

  return (
    <div className="health-gauge">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--border)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={dash}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.6s ease' }}
        />
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="mono"
          fontSize="34"
          fontWeight="600"
          fill={color}
        >
          {score == null ? '—' : Math.round(score)}
        </text>
        <text
          x="50%"
          y="64%"
          textAnchor="middle"
          className="mono"
          fontSize="11"
          fill="var(--text-tertiary)"
          letterSpacing="1"
        >
          HEALTH
        </text>
      </svg>
    </div>
  )
}
