import React from 'react'

/**
 * Mission-readiness recommendation, derived purely from the diagnosis
 * object already streamed from the backend (`health_score`, `severity`)
 * — no new backend logic needed.
 *
 * Precedence (checked in order):
 *   1. health_score < 40  OR severity === 'critical'         -> NO-GO
 *   2. health_score in [40, 70) OR severity === 'warning'    -> CAUTION
 *   3. otherwise (health_score >= 70 and no active fault)    -> GO
 *
 * A critical or low-health reading always wins even if the other
 * condition looks fine — e.g. a fault that just tipped into "critical"
 * but hasn't dragged the composite health score down yet should still
 * ground the mission.
 */
export function computeMissionStatus(diagnosis) {
  if (!diagnosis || diagnosis.health_score == null) {
    return {
      level: 'unknown',
      label: 'AWAITING TELEMETRY',
      detail: 'Mission readiness pending live data.',
    }
  }

  const { health_score: health, severity, label } = diagnosis

  if (health < 40 || severity === 'critical') {
    return {
      level: 'no-go',
      label: 'NO-GO — RETURN TO BASE',
      detail: `Health ${Math.round(health)} · ${label ?? 'Critical condition'}`,
    }
  }

  if (health < 70 || severity === 'warning') {
    return {
      level: 'caution',
      label: 'CAUTION — MONITOR CLOSELY',
      detail: `Health ${Math.round(health)} · ${label ?? 'Degraded parameter'}`,
    }
  }

  return {
    level: 'go',
    label: 'GO — MISSION PARAMETERS NOMINAL',
    detail: `Health ${Math.round(health)} · All systems within limits`,
  }
}

export default function MissionStatusBanner({ diagnosis }) {
  const status = computeMissionStatus(diagnosis)

  return (
    <div className={`mission-status-banner mission-status-${status.level}`} role="status">
      <span className="mission-status-label">{status.label}</span>
      <span className="mission-status-detail mono">{status.detail}</span>
    </div>
  )
}
