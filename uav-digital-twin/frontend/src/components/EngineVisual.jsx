import React, { useEffect, useRef, useState } from 'react'

/**
 * Rotax 912 Engine Digital Twin Visualization
 * -------------------------------------------
 * Horizontally opposed 4-cylinder (boxer) aero piston engine.
 * - Cylinders 1 & 3 (Left Bank) and Cylinders 2 & 4 (Right Bank)
 * - Central crankshaft + reciprocating pistons moving with RPM
 * - Firing chamber glow synchronized with 4-stroke cycle
 * - Cylinder head temperature (CHT) thermodynamic heatmap
 * - Lubrication circuit & oil pressure flow pulses
 * - Exhaust manifold glow proportional to EGT
 * - Mechanical vibration jitter driven by vibration_level
 * - Fault indicators for oil leak, overheat, misfire, low fuel pressure
 */
export default function EngineVisual({
  telemetry,
  isStale,
  engineStarted = true,
  throttle = 65,
  activeFaults = {},
}) {
  const containerRef = useRef(null)
  const animFrameRef = useRef(null)
  const [angle, setAngle] = useState(0)
  const [selectedCylinder, setSelectedCylinder] = useState(null)

  // RPM is driven by the real physics model — it accounts for BOTH throttle
  // AND engine load (a loaded engine bogs down relative to throttle alone),
  // plus inertia so it doesn't snap instantly. Before the first tick lands we
  // fall back to a rough throttle-only estimate purely for initial paint.
  const rpm = !engineStarted
    ? 0
    : (typeof telemetry?.rpm === 'number'
        ? telemetry.rpm
        : Math.round(1400 + (throttle / 100) * (5800 - 1400)))

  const cht = telemetry?.cht_c ?? 25
  const egt = telemetry?.egt_c ?? 25
  const oilPressure = telemetry?.oil_pressure_bar ?? (engineStarted ? 3.5 : 0)
  const oilTemp = telemetry?.oil_temp_c ?? 25
  const vibration = telemetry?.vibration_level ?? (engineStarted ? 1.2 : 0.114)

  // Multiple faults may be simultaneously active; each with its own severity (0-1)
  const faults = telemetry?.active_faults ?? activeFaults ?? {}
  const activeFaultIds = Object.keys(faults).filter((id) => faults[id] > 0)
  const hasFault = (id) => activeFaultIds.includes(id)
  const faultSeverity = (id) => faults[id] ?? 0

  // Diagnosis-driven fault state (Feature 2)
  const diagnosis = telemetry?.diagnosis
  const isNormal = !diagnosis || diagnosis.severity === 'normal'
  const diagnosisLabel = (diagnosis?.label || '').toLowerCase()
  const faultMode = (telemetry?.fault_mode || '').toLowerCase()

  // Fault zone activations — driven by diagnosis.label and cleared when severity returns to normal
  const isOilLeak = !isNormal && (diagnosisLabel.includes('oil') || faultMode === 'oil_leak' || hasFault('oil_leak'))
  const isOverheat = !isNormal && (diagnosisLabel.includes('overheat') || faultMode === 'overheat' || hasFault('overheat'))
  const isMisfire = !isNormal && (diagnosisLabel.includes('misfire') || faultMode === 'misfire' || hasFault('misfire'))
  const isLowFuel = !isNormal && (diagnosisLabel.includes('fuel') || faultMode === 'low_fuel_pressure' || hasFault('low_fuel_pressure'))

  // Low fuel pressure: lean/starved mixture causes the flame front to flicker
  // and weaken unpredictably rather than firing cleanly every stroke. Must be
  // computed before the combustion-flash intensities below, since they read it.
  const lowFuelSeverity = faultSeverity('low_fuel_pressure')
  const fuelFlicker = lowFuelSeverity > 0
    ? Math.max(0.15, 1 - lowFuelSeverity * (0.4 + 0.5 * Math.random()))
    : 1
  const overheatSeverity = faultSeverity('overheat')

  // Animate crankshaft rotation smoothly based on live RPM
  const lastTimeRef = useRef(performance.now())
  const angleRef = useRef(0)

  useEffect(() => {
    let active = true

    const loop = (now) => {
      const delta = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now

      if (rpm > 0 && !isStale) {
        // Rotax 912 runs up to ~5800 RPM. We scale animation speed to look natural and smooth
        const speedMultiplier = (rpm / 60) * 0.75
        angleRef.current = (angleRef.current + speedMultiplier * 360 * delta) % 360
        setAngle(angleRef.current)
      }

      if (active) {
        animFrameRef.current = requestAnimationFrame(loop)
      }
    }

    animFrameRef.current = requestAnimationFrame(loop)

    return () => {
      active = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [rpm, isStale])

  // Boxer piston displacement (-1 to 1) based on crank angle
  const rad = (angle * Math.PI) / 180
  // In a boxer engine, opposing pistons move simultaneously outwards and inwards
  const pistonStrokeL1 = Math.cos(rad) * 18 // Cyl 1
  const pistonStrokeR2 = Math.cos(rad + Math.PI) * 18 // Cyl 2 (opposite phase)
  const pistonStrokeL3 = Math.cos(rad + Math.PI) * 18 // Cyl 3
  const pistonStrokeR4 = Math.cos(rad) * 18 // Cyl 4

  // Firing chamber intensity (flash when piston is at top dead center in ignition stroke)
  // Rotax 912 firing order: 1 - 4 - 2 - 3 (every 180 deg in 720 deg 4-stroke cycle)
  const cycleAngle = (angle * 2) % 720
  const fireCyl1 = rpm > 0 ? (Math.max(0, Math.sin((cycleAngle - 0) * (Math.PI / 180))) ** 8) * fuelFlicker : 0
  const fireCyl4 = rpm > 0 ? (Math.max(0, Math.sin((cycleAngle - 180) * (Math.PI / 180))) ** 8) * fuelFlicker : 0
  const fireCyl2 = rpm > 0 ? (Math.max(0, Math.sin((cycleAngle - 360) * (Math.PI / 180))) ** 8) * fuelFlicker : 0
  const fireCyl3 = rpm === 0
    ? 0
    : (hasFault('misfire')
        ? 0.05 // Suppressed / irregular ignition flash during misfire fault
        : Math.max(0, Math.sin((cycleAngle - 540) * (Math.PI / 180))) ** 8)

  // Thermodynamic color mapping
  const getChtColor = (temp) => {
    if (temp < 60) return '#4895ef' // Cold / warming up
    if (temp < 110) return '#3ed88b' // Optimal green
    if (temp < 135) return '#f0a83c' // Warning amber
    return '#f14e4e' // Critical overheating red
  }

  const getEgtColor = (temp) => {
    if (temp < 400) return '#566072'
    if (temp < 750) return '#f0a83c'
    if (temp < 880) return '#ff7b00'
    return '#f14e4e'
  }

  const getOilStatusColor = (pressure) => {
    if (pressure < 0.8) return '#f14e4e'
    if (pressure < 2.0) return '#f0a83c'
    if (pressure <= 5.5) return '#3ed88b'
    return '#f0a83c'
  }

  const chtColor = getChtColor(cht)
  const egtColor = getEgtColor(egt)
  const oilColor = getOilStatusColor(oilPressure)

  // Vibration shake styling
  const jitterX = vibration > 4 ? (Math.sin(angle * 5) * (vibration * 0.4)).toFixed(2) : 0
  const jitterY = vibration > 4 ? (Math.cos(angle * 7) * (vibration * 0.4)).toFixed(2) : 0

  return (
    <div className="engine-visual-card panel" ref={containerRef}>
      <div className="engine-visual-header">
        <div className="engine-title-wrap">
          <span className="panel-label">ROTAX 912 AIRCRAFT ENGINE • FLAT-4 DIGITAL TWIN</span>
          <span className="engine-subtitle mono">
            {rpm === 0
              ? 'IGNITION OFF • ENGINE STOPPED • COLD STANDBY'
              : (rpm > 500 ? 'OPERATING • ' + Math.round(rpm) + ' RPM' : 'IDLE / CRANKING • ' + Math.round(rpm) + ' RPM')} • PROPELLER GEAR RATIO 2.43:1
          </span>
        </div>

        <div className="engine-live-badges">
          {activeFaultIds.length > 0 && (
            <div className="engine-fault-banner-group">
              {activeFaultIds.map((id) => (
                <div key={id} className={`engine-fault-banner fault-banner-${id} mono`}>
                  <span className="fault-pulse-dot" />
                  {id.toUpperCase().replace(/_/g, ' ')} · {Math.round(faultSeverity(id) * 100)}%
                </div>
              ))}
            </div>
          )}
          <div className="engine-mode-tag mono">
            CHT: <span style={{ color: chtColor }}>{Math.round(cht)}°C</span>
          </div>
          <div className="engine-mode-tag mono">
            OIL: <span style={{ color: oilColor }}>{oilPressure.toFixed(1)} bar</span>
          </div>
        </div>
      </div>

      <div
        className={`engine-viewport ${overheatSeverity > 0 ? 'engine-viewport-overheat' : ''}`}
        style={{
          transform: `translate(${jitterX}px, ${jitterY}px)`,
          transition: 'transform 0.05s linear',
          '--overheat-intensity': overheatSeverity,
          animationDuration: overheatSeverity > 0 ? `${Math.max(0.5, 1.6 - overheatSeverity)}s` : undefined,
        }}
      >
        <svg
          viewBox="0 0 760 380"
          className="engine-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Glow filters */}
            <filter id="flame-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="heat-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <linearGradient id="crankcase-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#0a0f1d" />
            </linearGradient>

            <linearGradient id="cylinder-sleeve-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="50%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>

            <linearGradient id="piston-metal-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="60%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>

            <linearGradient id="exhaust-grad-left" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={egtColor} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#334155" stopOpacity="0.4" />
            </linearGradient>

            <linearGradient id="exhaust-grad-right" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={egtColor} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#334155" stopOpacity="0.4" />
            </linearGradient>

            <pattern id="cooling-fins" width="8" height="6" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#1e293b" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Background grid markings for engineering blueprint aesthetic */}
          <g opacity="0.12" stroke="#4895ef" strokeWidth="0.5">
            <line x1="40" y1="190" x2="720" y2="190" strokeDasharray="4 4" />
            <line x1="380" y1="40" x2="380" y2="340" strokeDasharray="4 4" />
            <circle cx="380" cy="190" r="160" fill="none" strokeDasharray="3 3" />
          </g>

          {/* ══════════════════ EXHAUST HEADERS (BOTTOM) ══════════════════ */}
          <g className="exhaust-system">
            {/* Left exhaust runners from Cyl 1 & 3 */}
            <path
              d="M 170,225 C 170,275 220,310 320,315"
              fill="none"
              stroke={egtColor}
              strokeWidth="10"
              strokeLinecap="round"
              filter="url(#heat-glow)"
              opacity="0.85"
            />
            {/* Right exhaust runners from Cyl 2 & 4 */}
            <path
              d="M 590,225 C 590,275 540,310 440,315"
              fill="none"
              stroke={egtColor}
              strokeWidth="10"
              strokeLinecap="round"
              filter="url(#heat-glow)"
              opacity="0.85"
            />
            {/* Collector pipe */}
            <rect x="320" y="308" width="120" height="14" rx="7" fill={egtColor} opacity="0.9" />
            <text x="380" y="340" textAnchor="middle" className="svg-label mono" fill={egtColor}>
              EXHAUST MANIFOLD • EGT {Math.round(egt)}°C
            </text>
          </g>

          {/* ══════════════════ PROPELLER REDUCTION GEARBOX (TOP) ══════════════════ */}
          <g className="gearbox-section">
            <rect x="330" y="45" width="100" height="65" rx="10" fill="url(#crankcase-grad)" stroke="#38bdf8" strokeWidth="1.5" />
            <circle cx="380" cy="65" r="18" fill="#0f172a" stroke="#64748b" strokeWidth="2" />
            {/* Spinning propeller hub shaft */}
            <g transform={`rotate(${angle * 0.41}, 380, 65)`}>
              <line x1="380" y1="40" x2="380" y2="90" stroke="#38bdf8" strokeWidth="3" />
              <line x1="355" y1="65" x2="405" y2="65" stroke="#38bdf8" strokeWidth="3" />
              <circle cx="380" cy="65" r="7" fill="#38bdf8" />
            </g>
            <text x="380" y="32" textAnchor="middle" className="svg-label mono" fill="#94a3b8">
              PROP REDUCTION GEARBOX (2.43:1)
            </text>
          </g>

          {/* ══════════════════ FUEL SYSTEM & INTAKE (TOP-CENTER) ══════════════════ */}
          <g className={`fuel-system ${isLowFuel ? 'zone-fault-pulsing' : ''}`}>
            {/* Fuel rail / distribution manifold */}
            <rect
              x="295"
              y="94"
              width="170"
              height="14"
              rx="4"
              fill="#090d16"
              stroke={isLowFuel ? '#f14e4e' : '#38bdf8'}
              strokeWidth="1.5"
            />
            {/* Fuel supply lines to Left Bank (Cyl 1 & 3) */}
            <path
              d="M 295,101 C 240,101 210,120 180,125"
              fill="none"
              stroke={isLowFuel ? '#f14e4e' : '#38bdf8'}
              strokeWidth="2"
              strokeDasharray={rpm > 0 ? '4 3' : 'none'}
              strokeDashoffset={-angle * 0.4}
            />
            {/* Fuel supply lines to Right Bank (Cyl 2 & 4) */}
            <path
              d="M 465,101 C 520,101 550,120 580,125"
              fill="none"
              stroke={isLowFuel ? '#f14e4e' : '#38bdf8'}
              strokeWidth="2"
              strokeDasharray={rpm > 0 ? '4 3' : 'none'}
              strokeDashoffset={-angle * 0.4}
            />
            <text
              x="380"
              y="104"
              textAnchor="middle"
              className="svg-label mono"
              fill={isLowFuel ? '#f14e4e' : '#38bdf8'}
              fontSize="8.5"
            >
              FUEL SYSTEM • {(telemetry?.fuel_pressure_bar ?? 0.32).toFixed(2)} bar
            </text>
          </g>

          {/* ══════════════════ OIL SUMP & LUBRICATION CIRCUIT ══════════════════ */}
          <g className={`oil-sump ${isOilLeak ? 'zone-fault-pulsing' : ''}`}>
            <path
              d="M 320,265 L 440,265 L 420,295 L 340,295 Z"
              fill="#090d16"
              stroke={isOilLeak ? '#f14e4e' : oilColor}
              strokeWidth="1.5"
            />
            {/* Oil circuit lines */}
            <path
              d="M 330,280 C 260,280 240,220 220,190"
              fill="none"
              stroke={oilColor}
              strokeWidth="2.5"
              strokeDasharray={rpm > 0 ? '6 4' : 'none'}
              strokeDashoffset={-angle * 0.5}
            />
            <path
              d="M 430,280 C 500,280 520,220 540,190"
              fill="none"
              stroke={oilColor}
              strokeWidth="2.5"
              strokeDasharray={rpm > 0 ? '6 4' : 'none'}
              strokeDashoffset={-angle * 0.5}
            />
            <text x="380" y="283" textAnchor="middle" className="svg-label mono" fill={oilColor} fontSize="9">
              OIL SUMP • {oilTemp.toFixed(0)}°C
            </text>
            {hasFault('oil_leak') && (
              <g className="oil-leak-animation">
                <circle cx="380" cy="302" r="3" fill="#f14e4e">
                  <animate attributeName="cy" values="300;318;300" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite" />
                </circle>
                <text x="380" y="318" textAnchor="middle" fill="#f14e4e" fontSize="9" className="mono" fontWeight="bold">
                  OIL LEAK
                </text>
              </g>
            )}
          </g>

          {/* ══════════════════ CENTRAL CRANKCASE ══════════════════ */}
          <g className="crankcase">
            <rect
              x="290"
              y="110"
              width="180"
              height="155"
              rx="18"
              fill="url(#crankcase-grad)"
              stroke="#334155"
              strokeWidth="2"
            />
            {/* Center Crankshaft Chamber */}
            <circle cx="380" cy="187" r="48" fill="#090d16" stroke="#475569" strokeWidth="2" />

            {/* Rotating Crankshaft Journal */}
            <g transform={`rotate(${angle}, 380, 187)`}>
              <circle cx="380" cy="187" r="36" fill="none" stroke="#64748b" strokeWidth="3" strokeDasharray="16 8" />
              {/* Crank pin 1 & 4 */}
              <circle cx="362" cy="187" r="9" fill="#94a3b8" stroke="#f8fafc" strokeWidth="1.5" />
              {/* Crank pin 2 & 3 */}
              <circle cx="398" cy="187" r="9" fill="#94a3b8" stroke="#f8fafc" strokeWidth="1.5" />
              <line x1="362" y1="187" x2="398" y2="187" stroke="#cbd5e1" strokeWidth="4" />
            </g>
            <circle cx="380" cy="187" r="6" fill="#38bdf8" />
            <text x="380" y="191" textAnchor="middle" className="svg-label mono" fill="#cbd5e1" fontSize="8">
              CRANK
            </text>
          </g>

          {/* ══════════════════ LEFT BANK: CYLINDER 1 (TOP-LEFT) ══════════════════ */}
          <g
            className={`cylinder-group ${isMisfire ? 'zone-fault-pulsing' : ''}`}
            onClick={() => setSelectedCylinder('Cylinder 1')}
            style={{ cursor: 'pointer' }}
          >
            {/* Cylinder barrel sleeve */}
            <rect
              x="130"
              y="125"
              width="160"
              height="55"
              rx="6"
              fill="url(#cylinder-sleeve-grad)"
              stroke="#334155"
              strokeWidth="1.5"
            />
            {/* Cooling fins */}
            <line x1="145" y1="120" x2="145" y2="185" stroke="#475569" strokeWidth="2" />
            <line x1="160" y1="120" x2="160" y2="185" stroke="#475569" strokeWidth="2" />
            <line x1="175" y1="120" x2="175" y2="185" stroke="#475569" strokeWidth="2" />
            <line x1="190" y1="120" x2="190" y2="185" stroke="#475569" strokeWidth="2" />

            {/* Cylinder Head (Combustion chamber) */}
            <rect
              x="100"
              y="120"
              width="34"
              height="65"
              rx="6"
              fill="#1e293b"
              stroke={chtColor}
              strokeWidth="2"
            />
            {/* Spark plug */}
            <rect x="78" y="148" width="22" height="9" fill="#f8fafc" rx="2" />
            <polygon points="72,152 78,149 78,155" fill="#f0a83c" />

            {/* Combustion Flash Glow */}
            {fireCyl1 > 0.05 && (
              <circle
                cx="120"
                cy="152"
                r={16 * fireCyl1 + 6}
                fill="#fbbf24"
                opacity={fireCyl1 * 0.9}
                filter="url(#flame-glow)"
              />
            )}

            {/* Reciprocating Piston + Conrod */}
            <g transform={`translate(${pistonStrokeL1}, 0)`}>
              {/* Connecting rod */}
              <line x1="210" y1="152" x2="362" y2="187" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
              {/* Piston body */}
              <rect x="155" y="130" width="45" height="45" rx="4" fill="url(#piston-metal-grad)" stroke="#475569" strokeWidth="1" />
              <line x1="165" y1="130" x2="165" y2="175" stroke="#1e293b" strokeWidth="1.5" />
              <line x1="172" y1="130" x2="172" y2="175" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="180" cy="152" r="4" fill="#1e293b" />
            </g>

            <text x="117" y="108" className="svg-label mono" fill="#94a3b8" textAnchor="middle">
              CYLINDER 1
            </text>
          </g>

          {/* ══════════════════ LEFT BANK: CYLINDER 3 (BOTTOM-LEFT) ══════════════════ */}
          <g
            className={`cylinder-group ${isMisfire ? 'zone-fault-pulsing' : ''}`}
            onClick={() => setSelectedCylinder('Cylinder 3')}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x="130"
              y="195"
              width="160"
              height="55"
              rx="6"
              fill="url(#cylinder-sleeve-grad)"
              stroke="#334155"
              strokeWidth="1.5"
            />
            {/* Cooling fins */}
            <line x1="145" y1="190" x2="145" y2="255" stroke="#475569" strokeWidth="2" />
            <line x1="160" y1="190" x2="160" y2="255" stroke="#475569" strokeWidth="2" />
            <line x1="175" y1="190" x2="175" y2="255" stroke="#475569" strokeWidth="2" />
            <line x1="190" y1="190" x2="190" y2="255" stroke="#475569" strokeWidth="2" />

            {/* Cylinder Head */}
            <rect
              x="100"
              y="190"
              width="34"
              height="65"
              rx="6"
              fill="#1e293b"
              stroke={chtColor}
              strokeWidth="2"
            />
            {/* Spark plug */}
            <rect x="78" y="218" width="22" height="9" fill="#f8fafc" rx="2" />
            <polygon points="72,222 78,219 78,225" fill="#f0a83c" />

            {/* Combustion Flash */}
            {fireCyl3 > 0.05 && (
              <circle
                cx="120"
                cy="222"
                r={16 * fireCyl3 + 6}
                fill={hasFault('misfire') ? '#94a3b8' : '#fbbf24'}
                opacity={fireCyl3 * 0.9}
                filter="url(#flame-glow)"
              />
            )}

            {/* Reciprocating Piston + Conrod */}
            <g transform={`translate(${pistonStrokeL3}, 0)`}>
              <line x1="210" y1="222" x2="398" y2="187" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
              <rect x="155" y="200" width="45" height="45" rx="4" fill="url(#piston-metal-grad)" stroke="#475569" strokeWidth="1" />
              <line x1="165" y1="200" x2="165" y2="245" stroke="#1e293b" strokeWidth="1.5" />
              <line x1="172" y1="200" x2="172" y2="245" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="180" cy="222" r="4" fill="#1e293b" />
            </g>

            <text x="117" y="275" className="svg-label mono" fill="#94a3b8" textAnchor="middle">
              CYLINDER 3 {hasFault('misfire') && '• MISFIRE'}
            </text>
          </g>

          {/* ══════════════════ RIGHT BANK: CYLINDER 2 (TOP-RIGHT) ══════════════════ */}
          <g
            className={`cylinder-group ${isMisfire ? 'zone-fault-pulsing' : ''}`}
            onClick={() => setSelectedCylinder('Cylinder 2')}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x="470"
              y="125"
              width="160"
              height="55"
              rx="6"
              fill="url(#cylinder-sleeve-grad)"
              stroke="#334155"
              strokeWidth="1.5"
            />
            {/* Cooling fins */}
            <line x1="570" y1="120" x2="570" y2="185" stroke="#475569" strokeWidth="2" />
            <line x1="585" y1="120" x2="585" y2="185" stroke="#475569" strokeWidth="2" />
            <line x1="600" y1="120" x2="600" y2="185" stroke="#475569" strokeWidth="2" />
            <line x1="615" y1="120" x2="615" y2="185" stroke="#475569" strokeWidth="2" />

            {/* Cylinder Head */}
            <rect
              x="626"
              y="120"
              width="34"
              height="65"
              rx="6"
              fill="#1e293b"
              stroke={chtColor}
              strokeWidth="2"
            />
            {/* Spark plug */}
            <rect x="660" y="148" width="22" height="9" fill="#f8fafc" rx="2" />
            <polygon points="688,152 682,149 682,155" fill="#f0a83c" />

            {/* Combustion Flash */}
            {fireCyl2 > 0.05 && (
              <circle
                cx="640"
                cy="152"
                r={16 * fireCyl2 + 6}
                fill="#fbbf24"
                opacity={fireCyl2 * 0.9}
                filter="url(#flame-glow)"
              />
            )}

            {/* Reciprocating Piston + Conrod */}
            <g transform={`translate(${pistonStrokeR2}, 0)`}>
              <line x1="550" y1="152" x2="398" y2="187" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
              <rect x="560" y="130" width="45" height="45" rx="4" fill="url(#piston-metal-grad)" stroke="#475569" strokeWidth="1" />
              <line x1="595" y1="130" x2="595" y2="175" stroke="#1e293b" strokeWidth="1.5" />
              <line x1="588" y1="130" x2="588" y2="175" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="580" cy="152" r="4" fill="#1e293b" />
            </g>

            <text x="643" y="108" className="svg-label mono" fill="#94a3b8" textAnchor="middle">
              CYLINDER 2
            </text>
          </g>

          {/* ══════════════════ RIGHT BANK: CYLINDER 4 (BOTTOM-RIGHT) ══════════════════ */}
          <g
            className={`cylinder-group ${isMisfire ? 'zone-fault-pulsing' : ''}`}
            onClick={() => setSelectedCylinder('Cylinder 4')}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x="470"
              y="195"
              width="160"
              height="55"
              rx="6"
              fill="url(#cylinder-sleeve-grad)"
              stroke="#334155"
              strokeWidth="1.5"
            />
            {/* Cooling fins */}
            <line x1="570" y1="190" x2="570" y2="255" stroke="#475569" strokeWidth="2" />
            <line x1="585" y1="190" x2="585" y2="255" stroke="#475569" strokeWidth="2" />
            <line x1="600" y1="190" x2="600" y2="255" stroke="#475569" strokeWidth="2" />
            <line x1="615" y1="190" x2="615" y2="255" stroke="#475569" strokeWidth="2" />

            {/* Cylinder Head */}
            <rect
              x="626"
              y="190"
              width="34"
              height="65"
              rx="6"
              fill="#1e293b"
              stroke={chtColor}
              strokeWidth="2"
            />
            {/* Spark plug */}
            <rect x="660" y="218" width="22" height="9" fill="#f8fafc" rx="2" />
            <polygon points="688,222 682,219 682,225" fill="#f0a83c" />

            {/* Combustion Flash */}
            {fireCyl4 > 0.05 && (
              <circle
                cx="640"
                cy="222"
                r={16 * fireCyl4 + 6}
                fill="#fbbf24"
                opacity={fireCyl4 * 0.9}
                filter="url(#flame-glow)"
              />
            )}

            {/* Reciprocating Piston + Conrod */}
            <g transform={`translate(${pistonStrokeR4}, 0)`}>
              <line x1="550" y1="222" x2="362" y2="187" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
              <rect x="560" y="200" width="45" height="45" rx="4" fill="url(#piston-metal-grad)" stroke="#475569" strokeWidth="1" />
              <line x1="595" y1="200" x2="595" y2="245" stroke="#1e293b" strokeWidth="1.5" />
              <line x1="588" y1="200" x2="588" y2="245" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="580" cy="222" r="4" fill="#1e293b" />
            </g>

            <text x="643" y="275" className="svg-label mono" fill="#94a3b8" textAnchor="middle">
              CYLINDER 4
            </text>
          </g>

          {/* Overhead Callout Legend */}
          <g className="engine-hud-overlays">
            {/* Left Bank CHT overlay */}
            <g className={`engine-hud-overlay ${isOverheat ? 'zone-fault-pulsing' : ''}`}>
              <rect x="50" y="58" width="130" height="24" rx="3" fill="#090d16" stroke={isOverheat ? '#f14e4e' : '#1e293b'} strokeWidth={isOverheat ? 2 : 1} />
              <text x="115" y="74" textAnchor="middle" className="svg-label mono" fill={isOverheat ? '#f14e4e' : chtColor} fontSize="10">
                LEFT BANK • CHT {Math.round(cht)}°C
              </text>
            </g>

            {/* Right Bank CHT overlay */}
            <g className={`engine-hud-overlay ${isOverheat ? 'zone-fault-pulsing' : ''}`}>
              <rect x="580" y="58" width="130" height="24" rx="3" fill="#090d16" stroke={isOverheat ? '#f14e4e' : '#1e293b'} strokeWidth={isOverheat ? 2 : 1} />
              <text x="645" y="74" textAnchor="middle" className="svg-label mono" fill={isOverheat ? '#f14e4e' : chtColor} fontSize="10">
                RIGHT BANK • CHT {Math.round(cht)}°C
              </text>
            </g>
          </g>
        </svg>
      </div>

      <div className="engine-visual-footer">
        <div className="engine-stat-item">
          <span className="engine-stat-label mono">CONFIG</span>
          <span className="engine-stat-val">Horizontally Opposed 4-Cyl (Boxer)</span>
        </div>
        <div className="engine-stat-item">
          <span className="engine-stat-label mono">DISPLACEMENT</span>
          <span className="engine-stat-val">1211 cm³ (Rotax 912)</span>
        </div>
        <div className="engine-stat-item">
          <span className="engine-stat-label mono">FIRING ORDER</span>
          <span className="engine-stat-val mono">1 - 4 - 2 - 3</span>
        </div>
        <div className="engine-stat-item">
          <span className="engine-stat-label mono">VIBRATION INDEX</span>
          <span className="engine-stat-val mono" style={{ color: vibration > 4 ? 'var(--status-warning)' : 'var(--status-normal)' }}>
            {vibration.toFixed(2)} a.u.
          </span>
        </div>
      </div>
    </div>
  )
}
