"""
Shared Simulation Tick Logic
============================
Used by BOTH the Vercel serverless function (api/tick.py) and the local
FastAPI dev server (backend/main.py) so the two deployment paths never
drift out of sync. dt_sec is fixed at 2.0s to match the trained model
features — this must never change.
"""

import time

import numpy as np

from engine_model import EngineState
from confidence_breakdown import compute_class_probabilities, stopped_engine_probabilities

DT_SEC = 2.0
FAULT_RAMP_SECONDS = 300.0   # Faults ramp to full severity over 5 minutes (30-60min flight scale)


def flight_profile(t: float):
    """Climb -> cruise -> descent flight profile, used only when no throttle
    is supplied by the client (autonomous / demo flight mode)."""
    if t < 120:
        rpm = 1400.0 + (t / 120.0) * (5500.0 - 1400.0)
        alt = 50.0 + (t / 120.0) * 1000.0
    elif t < 800:
        rpm, alt = 5000.0, 2000.0
    else:
        rpm = 4200.0
        alt = max(500.0, 2000.0 - ((t - 800.0) / 400.0) * 1500.0)
    return float(rpm), float(alt)


def compute_active_faults(active_faults_in: dict, sim_time: float) -> dict:
    """Converts {fault_id: started_at_sim_time} -> {fault_id: severity(0..1)}
    using the fixed fault ramp-up window."""
    active = {}
    for fault_id, started_at in (active_faults_in or {}).items():
        if fault_id == "none" or started_at is None:
            continue
        elapsed = sim_time - float(started_at)
        severity = min(1.0, max(0.0, elapsed / FAULT_RAMP_SECONDS))
        if severity > 0.0:
            active[fault_id] = severity
    return active


def run_tick(body: dict, monitor) -> dict:
    """Advance the simulation by one DT_SEC tick from a client-supplied state
    snapshot (`body`) and return the new telemetry + diagnosis + next state.

    `body` fields:
        engine_state: {ambient_c, oil_temp_c, cht_c, egt_c, cumulative_oil_loss, rpm}
        monitor_buffer: list of prior readings for rolling-window features
        sim_time_sec: float
        active_faults: {fault_id: sim_time_sec_when_injected}  (preferred, supports multiple)
        fault_mode / fault_started_at: legacy single-fault fields (still honored)
        engine_started: bool
        throttle: float | None (0-100)
        load: float (0-100)
        altitude_m: float | None
    """
    from collections import deque

    es = body.get("engine_state", {}) or {}
    engine = EngineState(
        ambient_c=es.get("ambient_c", 25.0),
        rpm=es.get("rpm", 1400.0),
    )
    engine.oil_temp_c = es.get("oil_temp_c", 25.0)
    engine.cht_c = es.get("cht_c", 25.0)
    engine.egt_c = es.get("egt_c", 25.0)
    engine.cumulative_oil_loss = es.get("cumulative_oil_loss", 0.0)
    engine.health_score = float(es.get("health_score", 100.0))

    monitor.buffer = deque(body.get("monitor_buffer") or [], maxlen=30)

    sim_time_raw = body.get("sim_time_sec")
    sim_time = float(sim_time_raw) if sim_time_raw is not None else 0.0
    engine_started = bool(body.get("engine_started", True))
    throttle = body.get("throttle", None)
    load_raw = body.get("load")
    load = float(load_raw) if load_raw is not None else 100.0

    # ── Active faults: prefer the new multi-fault field, fall back to legacy ──
    active_faults_in = dict(body.get("active_faults") or {})
    legacy_mode = body.get("fault_mode", "none")
    legacy_started_at = body.get("fault_started_at", None)
    if legacy_mode and legacy_mode != "none" and legacy_started_at is not None and not active_faults_in:
        active_faults_in = {legacy_mode: legacy_started_at}

    active_faults = compute_active_faults(active_faults_in, sim_time)

    next_sim_time = sim_time + DT_SEC
    raw_alt = body.get("altitude_m")

    if not engine_started:
        alt = float(raw_alt) if raw_alt is not None else 0.0
        effective_amb = engine.ambient_c
        # Exponential cooling toward ambient
        engine.cht_c += (effective_amb - engine.cht_c) * (1.0 - np.exp(-DT_SEC / 180.0))
        engine.egt_c += (effective_amb - engine.egt_c) * (1.0 - np.exp(-DT_SEC / 40.0))
        engine.oil_temp_c += (effective_amb - engine.oil_temp_c) * (1.0 - np.exp(-DT_SEC / 300.0))
        engine.rpm = 0.0

        telemetry = {
            "rpm": 0.0,
            "power_kw": 0.0,
            "torque_nm": 0.0,
            "manifold_pressure_inhg": 15.0,
            "fuel_flow_lph": 0.0,
            "fuel_pressure_bar": 0.02,
            "oil_pressure_bar": 0.0,
            "oil_temp_c": round(engine.oil_temp_c, 1),
            "cht_c": round(engine.cht_c, 1),
            "egt_c": round(engine.egt_c, 1),
            "coolant_temp_c": round(engine.cht_c, 1),
            "vibration_level": round(float(0.114 + np.random.normal(0, 0.005)), 3),
            "altitude_m": alt,
            "active_faults": active_faults,
            "fault_mode": ",".join(active_faults.keys()) if active_faults else "none",
            "fault_severity": float(max(active_faults.values())) if active_faults else 0.0,
            "load_pct": load,
            "throttle_pct": float(throttle) if throttle is not None else 0.0,
            "engine_started": False,
        }
        diagnosis = {
            "label": "Engine Stopped",
            "message": "Ignition OFF. Standby mode.",
            "severity": "normal",
            "confidence": "100%",
            "anomaly_flag": False,
            "health_score": round(float(engine.health_score), 1),
        }
        # No monitor.predict() call happens on this branch (engine is off),
        # so there's no real feature window to score — mirror the "none"
        # diagnosis above instead of showing a stale distribution.
        class_probabilities = stopped_engine_probabilities(monitor)
    else:
        alt = float(raw_alt) if raw_alt is not None else 100.0
        if throttle is not None:
            # Realistic coupling: RPM responds to both throttle AND load, with inertia
            rpm = engine.compute_rpm_response(
                throttle_pct=float(throttle), load_pct=load, dt_sec=DT_SEC
            )
        else:
            rpm, alt = flight_profile(next_sim_time)
            engine.rpm = rpm

        telemetry = engine.step(
            rpm=rpm,
            dt_sec=DT_SEC,
            altitude_m=alt,
            active_faults=active_faults,
        )

        # Apply engine load factor (0-100%) to power/torque/fuel draw
        load_factor = max(0.0, min(1.0, load / 100.0))
        telemetry["power_kw"] = round(telemetry["power_kw"] * (0.35 + 0.65 * load_factor), 1)
        telemetry["torque_nm"] = round(telemetry["torque_nm"] * (0.35 + 0.65 * load_factor), 1)
        telemetry["fuel_flow_lph"] = round(telemetry["fuel_flow_lph"] * (0.4 + 0.6 * load_factor), 1)
        telemetry["load_pct"] = load
        telemetry["throttle_pct"] = (
            float(throttle) if throttle is not None
            else round((rpm - 1400.0) / (5800.0 - 1400.0) * 100.0, 1)
        )
        telemetry["engine_started"] = True

        diagnosis = monitor.predict(dict(telemetry))
        engine.health_score = float(diagnosis["health_score"])
        telemetry["health_score"] = round(engine.health_score, 1)

        # monitor.buffer now holds the exact 30-reading window predict()
        # just used internally (predict() appends the current reading
        # before running inference) — reuse it so the full class
        # distribution below is computed from identical inputs to
        # diagnosis.confidence, rather than a separately-tracked buffer
        # that could drift out of sync. Read-only: live_monitor.py's
        # buffer is never modified here.
        class_probabilities = compute_class_probabilities(monitor, list(monitor.buffer))

    telemetry["timestamp"] = round(time.time(), 3)
    telemetry["sim_time_sec"] = round(next_sim_time, 1)

    return {
        **telemetry,
        "diagnosis": diagnosis,
        "class_probabilities": class_probabilities,
        "next_engine_state": {
            "ambient_c": engine.ambient_c,
            "oil_temp_c": engine.oil_temp_c,
            "cht_c": engine.cht_c,
            "egt_c": engine.egt_c,
            "cumulative_oil_loss": engine.cumulative_oil_loss,
            "rpm": engine.rpm,
            "health_score": round(float(engine.health_score), 1),
        },
        "next_monitor_buffer": list(monitor.buffer),
    }
