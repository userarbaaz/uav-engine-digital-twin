import { useEffect, useRef, useState, useCallback } from 'react'
import { API_BASE, HISTORY_LENGTH, POLL_INTERVAL_MS } from '../config'

const INITIAL_ENGINE_STATE = {
  ambient_c: 25.0,
  oil_temp_c: 25.0,
  cht_c: 25.0,
  egt_c: 25.0,
  cumulative_oil_loss: 0.0,
  rpm: 1400.0,
  health_score: 100.0,
}

/**
 * useTelemetryPoll
 * Replaces WebSocket connection with client-owned simulation state + REST polling.
 * Compatible with serverless environments (Vercel) and standard local backends.
 * Features immediate optimistic local UI updates for Start/Stop, Throttle, and Load,
 * with debounced and queued server synchronization.
 */
export function useTelemetryPoll() {
  const [status, setStatus] = useState('connecting') // 'connecting' | 'live' | 'disconnected'
  const [telemetry, setTelemetry] = useState(null)
  const [history, setHistory] = useState([])

  // Engine operational controls state
  const [engineStarted, setEngineStartedState] = useState(true)
  const [throttle, setThrottleState] = useState(65)
  const [engineLoad, setEngineLoadState] = useState(100)

  // Client-owned simulation state refs
  const engineStateRef = useRef({ ...INITIAL_ENGINE_STATE })
  const monitorBufferRef = useRef([])
  const simTimeRef = useRef(0.0)
  // Multiple faults can be active at once: { [faultId]: simTimeInjectedAt }
  const activeFaultsRef = useRef({})
  const [activeFaults, setActiveFaultsState] = useState({})

  const engineStartedRef = useRef(true)
  const throttleRef = useRef(65)
  const engineLoadRef = useRef(100)

  const isMountedRef = useRef(false)
  const isFetchingRef = useRef(false)
  const pendingTickRef = useRef(false)
  const debounceTimerRef = useRef(null)
  const errorCountRef = useRef(0)
  const timerRef = useRef(null)

  const sendTick = useCallback(async () => {
    if (!isMountedRef.current) return

    // If already fetching, queue up the next tick so no user command is dropped
    if (isFetchingRef.current) {
      pendingTickRef.current = true
      return
    }

    isFetchingRef.current = true

    const payload = {
      engine_state: engineStateRef.current,
      monitor_buffer: monitorBufferRef.current,
      sim_time_sec: simTimeRef.current,
      active_faults: activeFaultsRef.current,
      engine_started: engineStartedRef.current,
      throttle: throttleRef.current,
      load: engineLoadRef.current,
    }

    try {
      const res = await fetch(`${API_BASE}/api/tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error(`Tick error: HTTP ${res.status}`)
      }

      const data = await res.json()

      if (!isMountedRef.current) return

      // Update client-held simulation state
      if (data.next_engine_state) {
        engineStateRef.current = data.next_engine_state
      }
      if (data.next_monitor_buffer) {
        monitorBufferRef.current = data.next_monitor_buffer
      }
      if (typeof data.sim_time_sec === 'number') {
        simTimeRef.current = data.sim_time_sec
      }

      errorCountRef.current = 0
      setStatus('live')

      // Ensure local user control (start/stop) takes precedence over delayed
      // in-flight responses. RPM itself is NOT overridden here — the backend
      // physics model computes it from throttle AND load together (with
      // realistic inertia), so trust whatever it returns.
      if (!engineStartedRef.current) {
        data.rpm = 0
        data.power_kw = 0
        data.torque_nm = 0
        data.fuel_flow_lph = 0
        data.oil_pressure_bar = 0
        data.vibration_level = 0.114
        data.engine_started = false
        if (data.diagnosis) {
          data.diagnosis.health_score = 100.0
          data.diagnosis.label = 'Engine Stopped'
        }
      } else {
        data.engine_started = true
      }

      setTelemetry(data)
      if (data.active_faults) {
        setActiveFaultsState(data.active_faults)
      }

      setHistory((prev) => {
        const next = [...prev, data]
        if (next.length > HISTORY_LENGTH) next.shift()
        return next
      })
    } catch (err) {
      console.warn('Telemetry tick failed:', err.message)
      errorCountRef.current += 1
      if (errorCountRef.current >= 3 && isMountedRef.current) {
        setStatus('disconnected')
      }
    } finally {
      isFetchingRef.current = false
      // If a command was queued while this request was in flight, process it immediately
      if (pendingTickRef.current && isMountedRef.current) {
        pendingTickRef.current = false
        sendTick()
      }
    }
  }, [])

  const triggerDebouncedTick = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      sendTick()
    }, 150)
  }, [sendTick])

  const toggleEngineStart = useCallback(() => {
    const nextVal = !engineStartedRef.current
    engineStartedRef.current = nextVal
    setEngineStartedState(nextVal)

    // Optimistic instantaneous local telemetry update
    setTelemetry((prev) => {
      if (!prev) return prev
      if (!nextVal) {
        return {
          ...prev,
          rpm: 0,
          power_kw: 0,
          torque_nm: 0,
          fuel_flow_lph: 0,
          oil_pressure_bar: 0,
          vibration_level: 0.114,
          engine_started: false,
          diagnosis: {
            ...prev.diagnosis,
            label: 'Engine Stopped',
            message: 'Ignition OFF. Standby mode.',
            severity: 'normal',
            health_score: 100.0,
          },
        }
      } else {
        const targetRpm = Math.round(1400 + (throttleRef.current / 100) * (5800 - 1400))
        return {
          ...prev,
          rpm: targetRpm,
          engine_started: true,
          oil_pressure_bar: 3.5,
          vibration_level: 1.2,
        }
      }
    })

    // Immediately trigger server sync
    sendTick()
  }, [sendTick])

  const setThrottle = useCallback((val) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(val))))
    throttleRef.current = clamped
    setThrottleState(clamped)

    // Optimistic instantaneous local update
    if (engineStartedRef.current) {
      const targetRpm = Math.round(1400 + (clamped / 100) * (5800 - 1400))
      setTelemetry((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          rpm: targetRpm,
          throttle_pct: clamped,
        }
      })
    }

    triggerDebouncedTick()
  }, [triggerDebouncedTick])

  const setEngineLoad = useCallback((val) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(val))))
    engineLoadRef.current = clamped
    setEngineLoadState(clamped)

    setTelemetry((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        load_pct: clamped,
      }
    })

    triggerDebouncedTick()
  }, [triggerDebouncedTick])

  // Injects a fault, stacking with any already-active faults (multiple
  // faults can run simultaneously and their effects combine on the engine).
  const injectFault = useCallback(async (faultType) => {
    activeFaultsRef.current = {
      ...activeFaultsRef.current,
      [faultType]: simTimeRef.current,
    }
    setActiveFaultsState({ ...activeFaultsRef.current })
    await sendTick()
  }, [sendTick])

  // Clears a single fault by id, or all faults if no id is given.
  const clearFault = useCallback(async (faultType) => {
    if (faultType) {
      const next = { ...activeFaultsRef.current }
      delete next[faultType]
      activeFaultsRef.current = next
    } else {
      activeFaultsRef.current = {}
    }
    setActiveFaultsState({ ...activeFaultsRef.current })
    await sendTick()
  }, [sendTick])

  // Toggles a fault on/off — convenient for multi-select fault buttons.
  const toggleFault = useCallback((faultType) => {
    if (activeFaultsRef.current[faultType] !== undefined) {
      return clearFault(faultType)
    }
    return injectFault(faultType)
  }, [injectFault, clearFault])

  const resetSimulation = useCallback(async () => {
    engineStateRef.current = { ...INITIAL_ENGINE_STATE }
    monitorBufferRef.current = []
    simTimeRef.current = 0.0
    activeFaultsRef.current = {}
    setActiveFaultsState({})

    engineStartedRef.current = true
    setEngineStartedState(true)
    throttleRef.current = 65
    setThrottleState(65)
    engineLoadRef.current = 100
    setEngineLoadState(100)

    setHistory([])

    try {
      await fetch(`${API_BASE}/api/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      // Ignored
    }

    await sendTick()
  }, [sendTick])

  const resetHistory = useCallback(() => setHistory([]), [])

  useEffect(() => {
    isMountedRef.current = true
    errorCountRef.current = 0

    // Immediate initial tick
    sendTick()

    // Recurring polling loop
    timerRef.current = setInterval(sendTick, POLL_INTERVAL_MS)

    return () => {
      isMountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [sendTick])

  return {
    status,
    telemetry,
    history,
    resetHistory,
    activeFaults,
    injectFault,
    clearFault,
    toggleFault,
    resetSimulation,
    engineStarted,
    toggleEngineStart,
    throttle,
    setThrottle,
    engineLoad,
    setEngineLoad,
  }
}
