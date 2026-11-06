"""
Confidence Breakdown — Judge-Facing Q&A Safety Net
====================================================
Surfaces the FULL class-probability distribution from the trained
RandomForestClassifier (`monitor.rf_clf`), instead of just the single
top-class confidence already returned in `diagnosis.confidence`.

This module is entirely separate from live_monitor.py:
  - live_monitor.py is NEVER imported for its internals, patched, or
    modified in any way — it stays exactly as validated.
  - Only the public attributes LiveEngineMonitor already exposes are
    used: `rf_clf`, `scaler`, `feature_cols`, `sensor_cols`.
  - This function does not mutate `monitor` or its buffer in any way;
    it is a pure read-only computation over whatever reading window
    you pass in.

Design note — why this does NOT keep its own module-level buffer
------------------------------------------------------------------
The originally proposed design kept a second `deque(maxlen=30)` at
module scope in the backend, separate from `LiveEngineMonitor`'s own
buffer, on the theory that the backend is a persistent process holding
state between ticks.

That assumption doesn't hold for this app's actual live data path.
Look at how the frontend talks to the backend: `useTelemetryPoll.js`
POSTs to `/api/tick` and the CLIENT holds `monitor_buffer` between
calls, not the server (see `monitor_buffer` / `next_monitor_buffer` in
tick_logic.py). This is by design, so the same code works unmodified as
a stateless Vercel serverless function (`api/tick.py`), which may spin
up a fresh process per invocation — module-level state like a bare
`deque` is not guaranteed to survive between two ticks in that
environment. Relying on it would silently degrade the confidence
breakdown to rolling stats computed over 0-1 readings on most ticks in
production, rather than a real 30-tick window — a real accuracy bug,
not just "small timing differences."

The fix used here: don't keep a second buffer at all. `run_tick()`
already rebuilds `monitor.buffer` from the client-supplied window on
every call, and `monitor.predict()` appends the current reading to it
before returning. So immediately after calling `monitor.predict(reading)`,
`monitor.buffer` already holds the exact 30-reading window the top-1
prediction was based on — call this module with `list(monitor.buffer)`
at that point and the two outputs are computed from identical inputs.
That's simpler than a second buffer, has no synchronization/timing risk,
and matches `diagnosis.confidence` on the top class exactly rather than
"roughly."

`monitor.buffer` is read (never written) after the fact, purely to
source the same window predict() already used — no feature-engineering
logic from live_monitor.py is invoked, only the same public formulas
duplicated here per the original spec.
"""

from typing import Dict, List

import pandas as pd


def compute_class_probabilities(monitor, buffer_readings: List[dict]) -> Dict[str, float]:
    """
    Compute the RandomForest's full class-probability distribution for
    the most recent reading in `buffer_readings`.

    Parameters
    ----------
    monitor : LiveEngineMonitor
        Only public attributes are read: sensor_cols, feature_cols,
        scaler, rf_clf. live_monitor.py is never modified or relied on
        beyond these.
    buffer_readings : list[dict]
        The rolling window of raw sensor readings (oldest first, most
        recent last) to engineer features from. Pass `list(monitor.buffer)`
        right after calling `monitor.predict(reading)` so this reflects
        the exact window the model's top-1 call was based on.

    Returns
    -------
    dict[str, float]
        {class_label: probability}, rounded to 4 decimals, for every
        class the model knows (e.g. oil_leak, overheat, misfire,
        low_fuel_pressure, none). Empty dict if no readings are given.
    """
    if not buffer_readings:
        return {}

    buf_df = pd.DataFrame(buffer_readings)
    latest = buffer_readings[-1]

    row = {}
    for col in monitor.sensor_cols:
        row[col] = latest[col]
        row[f'{col}_roll_mean'] = buf_df[col].rolling(10, min_periods=1).mean().iloc[-1]
        row[f'{col}_roll_std'] = buf_df[col].rolling(10, min_periods=1).std().fillna(0).iloc[-1]
        row[f'{col}_rate'] = buf_df[col].diff().fillna(0).iloc[-1]

    if len(buf_df) >= 30:
        row['oil_pressure_bar_drop_30'] = (
            buf_df['oil_pressure_bar'].iloc[-1] - buf_df['oil_pressure_bar'].iloc[0]
        )
    else:
        row['oil_pressure_bar_drop_30'] = 0

    X = pd.DataFrame([row])[monitor.feature_cols]
    X_scaled = monitor.scaler.transform(X)
    probs = monitor.rf_clf.predict_proba(X_scaled)[0]

    return {cls: round(float(p), 4) for cls, p in zip(monitor.rf_clf.classes_, probs)}


def stopped_engine_probabilities(monitor) -> Dict[str, float]:
    """
    Placeholder distribution for ticks where the engine is stopped and
    `monitor.predict()` is never called (see the `engine_started=False`
    branch in tick_logic.run_tick). Mirrors the hardcoded "Engine
    Stopped" / "none" diagnosis for that branch so the panel has
    something consistent to render instead of a stale distribution.
    """
    return {cls: (1.0 if cls == 'none' else 0.0) for cls in monitor.rf_clf.classes_}
