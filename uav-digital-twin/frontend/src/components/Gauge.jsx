import React, { useMemo } from 'react'

const START_ANGLE = 135 // degrees, bottom-left
const END_ANGLE = 405 // degrees, bottom-right (270deg sweep through the top)

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
}

function valueToAngle(value, min, max) {
  const clamped = Math.min(max, Math.max(min, value))
  const frac = (clamped - min) / (max - min)
  return START_ANGLE + frac * (END_ANGLE - START_ANGLE)
}

/**
 * A single instrument dial: label placard, arc scale with optional caution /
 * critical zones, a needle, and a mono numeric readout.
 *
 * `zones` is an ordered list of { from, to, color } in data units, drawn as
 * colored bands on the outer edge of the arc (e.g. a caution/redline band).
 */
export default function Gauge({ label, value, unit, min, max, decimals = 0, zones = [], size = 168 }) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.36
  const trackR = r
  const zoneR = r + 9
  const needleAngle = useMemo(() => valueToAngle(value ?? min, min, max), [value, min, max])
  const needleTip = polarToCartesian(cx, cy, r - 10, needleAngle)

  const activeZoneColor = useMemo(() => {
    if (value == null) return 'var(--data-cyan)'
    for (const z of zones) {
      if (value >= z.from && value <= z.to) return z.color
    }
    return 'var(--data-cyan)'
  }, [value, zones])

  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label} gauge`}>
        {/* base track */}
        <path
          d={describeArc(cx, cy, trackR, START_ANGLE, END_ANGLE)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* zone bands */}
        {zones.map((z, i) => (
          <path
            key={i}
            d={describeArc(cx, cy, zoneR, valueToAngle(z.from, min, max), valueToAngle(z.to, min, max))}
            fill="none"
            stroke={z.color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.75}
          />
        ))}
        {/* value arc */}
        <path
          d={describeArc(cx, cy, trackR, START_ANGLE, needleAngle)}
          fill="none"
          stroke={activeZoneColor}
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="var(--text-primary)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4.5} fill="var(--text-primary)" />
      </svg>
      <div className="gauge-readout">
        <span className="gauge-value mono" style={{ color: activeZoneColor }}>
          {value == null ? '—' : value.toFixed(decimals)}
        </span>
        <span className="gauge-unit mono">{unit}</span>
      </div>
      <div className="gauge-label panel-label">{label}</div>
    </div>
  )
}
