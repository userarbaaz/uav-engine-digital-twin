import React from 'react'

const META = {
  live: { color: 'var(--status-normal)', text: 'LINK ESTABLISHED' },
  connecting: { color: 'var(--status-warning)', text: 'CONNECTING…' },
  disconnected: { color: 'var(--status-critical)', text: 'LINK LOST — RETRYING' },
}

export default function ConnectionStatus({ status }) {
  const meta = META[status] ?? META.connecting
  return (
    <div className="connection-status mono">
      <span className={`connection-dot ${status === 'live' ? 'connection-dot-pulse' : ''}`} style={{ background: meta.color }} />
      <span style={{ color: meta.color }}>{meta.text}</span>
    </div>
  )
}
