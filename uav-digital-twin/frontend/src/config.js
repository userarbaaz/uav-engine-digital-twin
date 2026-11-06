// Backend base URL.
// In Vercel deployment and local Vite dev proxy, requests to /api are relative (empty API_BASE).
// If testing against a separate backend host, define VITE_API_BASE.
export const API_BASE = import.meta.env.VITE_API_BASE ?? ''

const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'
export const WS_URL = (API_BASE || origin).replace(/^http/, 'ws') + '/ws/telemetry'

// How many ticks of history to keep for the trend chart (90 ticks * 2s = 3 minutes)
export const HISTORY_LENGTH = 90
export const POLL_INTERVAL_MS = 2000
