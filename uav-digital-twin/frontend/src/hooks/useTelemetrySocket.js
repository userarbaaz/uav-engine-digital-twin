import { useEffect, useRef, useState, useCallback } from 'react'
import { WS_URL, HISTORY_LENGTH } from '../config'

const MAX_BACKOFF_MS = 8000
const BASE_BACKOFF_MS = 500

/**
 * Connects to the telemetry WebSocket, keeps the latest reading + a rolling
 * history for the trend chart, and reconnects automatically with backoff
 * whenever the connection drops. Exposes a clear connection status so the
 * UI never quietly freezes on stale data.
 */
export function useTelemetrySocket() {
  const [status, setStatus] = useState('connecting') // 'connecting' | 'live' | 'disconnected'
  const [telemetry, setTelemetry] = useState(null)
  const [history, setHistory] = useState([])

  const wsRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  const attemptRef = useRef(0)
  const unmountedRef = useRef(false)

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    setStatus((prev) => (prev === 'live' ? prev : 'connecting'))

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      attemptRef.current = 0
    }

    ws.onmessage = (event) => {
      let packet
      try {
        packet = JSON.parse(event.data)
      } catch {
        return
      }
      setStatus('live')
      setTelemetry(packet)
      setHistory((prev) => {
        const next = [...prev, packet]
        if (next.length > HISTORY_LENGTH) next.shift()
        return next
      })
    }

    const scheduleReconnect = () => {
      if (unmountedRef.current) return
      setStatus('disconnected')
      const attempt = attemptRef.current + 1
      attemptRef.current = attempt
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
      retryTimeoutRef.current = setTimeout(connect, delay)
    }

    ws.onclose = scheduleReconnect
    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    unmountedRef.current = false
    connect()
    return () => {
      unmountedRef.current = true
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const resetHistory = useCallback(() => setHistory([]), [])

  return { status, telemetry, history, resetHistory }
}
