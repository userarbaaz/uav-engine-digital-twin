import { useEffect, useRef } from 'react'

/**
 * useAlarm — Feature 1
 * Plays a short, repeating alert tone whenever `severity === "critical"`.
 * Stops immediately when severity returns to "normal" or "warning".
 *
 * Uses Web Audio API to synthesise the tone on-the-fly — no audio file needed.
 * The tone is a soft 880 Hz sine wave pulsed at 1 Hz, loud enough to notice
 * but not jarring (gain 0.18).
 */
export function useAlarm(severity) {
  const audioCtxRef = useRef(null)
  const intervalRef = useRef(null)

  // Helper: play a short beep (180 ms, 880 Hz sine)
  function playBeep(ctx) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.18)
  }

  function stopAlarm() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  function startAlarm() {
    if (intervalRef.current) return // already running

    // Lazily create AudioContext on first user-interaction-triggered alarm
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch {
        return // audio not available
      }
    }

    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    // Play immediately then repeat every 1.1 s
    playBeep(ctx)
    intervalRef.current = setInterval(() => playBeep(ctx), 1100)
  }

  useEffect(() => {
    if (severity === 'critical') {
      startAlarm()
    } else {
      stopAlarm()
    }

    return stopAlarm
  }, [severity]) // eslint-disable-line react-hooks/exhaustive-deps
}
