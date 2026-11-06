"""
UAV Engine Digital Twin — Backend
==================================
SIH26054 — AI-Enabled Real-Time Digital Twin for Health Monitoring of
Aero Piston Engines in MALE UAVs.

Wraps the pre-trained ML pipeline (engine_model.py + live_monitor.py,
built by the ML team — not modified here) in a FastAPI service that:

  - Runs the physics simulation + ML diagnosis on a fixed 2.0s tick
  - Streams each tick to every connected browser over a WebSocket
  - Exposes live fault-injection / clear / reset controls for demos

Run with:  uvicorn main:app --reload --port 8000
"""

import asyncio
import json
import os
import sys
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Use the canonical api/lib modules (engine_model, live_monitor, tick_logic,
# and .pkl files) as the single source of truth, so the local dev server can
# never drift out of sync with the Vercel serverless deployment path. ────────
API_LIB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api", "lib")
API_LIB_DIR = os.path.abspath(API_LIB_DIR)
if os.path.isdir(API_LIB_DIR):
    sys.path.insert(0, API_LIB_DIR)
    MODEL_DIR = API_LIB_DIR
else:
    # Fallback: local copies bundled directly in backend/ (offline dev without api/)
    MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

from engine_model import EngineState  # noqa: E402
from live_monitor import LiveEngineMonitor  # noqa: E402
from tick_logic import run_tick, flight_profile, DT_SEC as SHARED_DT_SEC  # noqa: E402
from confidence_breakdown import compute_class_probabilities  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("digital_twin")

# ---------------------------------------------------------------------------
# Simulation constants
# ---------------------------------------------------------------------------
DT_SEC = SHARED_DT_SEC        # fixed timestep the model was trained against — do not change
INJECTABLE_FAULTS = ["oil_leak", "overheat", "misfire", "low_fuel_pressure", "sensor_failure"]
FAULT_RAMP_SECONDS = 40.0    # time for an injected fault to reach full severity


# ---------------------------------------------------------------------------
# Simulation state — a single shared flight, broadcast to every client
# ---------------------------------------------------------------------------
class DigitalTwinSimulation:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._reset_unlocked()

    def _reset_unlocked(self) -> None:
        self.engine = EngineState(ambient_c=25.0)
        self.monitor = LiveEngineMonitor(model_dir=MODEL_DIR)
        self.sim_start = time.time()
        self.active_faults: dict[str, float] = {}  # fault_id -> injected-at (wall clock)
        self.last_packet: Optional[dict] = None

    async def reset(self) -> None:
        async with self._lock:
            self._reset_unlocked()
        logger.info("Simulation reset")

    async def inject_fault(self, fault_type: str) -> None:
        if fault_type not in INJECTABLE_FAULTS:
            raise ValueError(f"fault_type must be one of {INJECTABLE_FAULTS}")
        async with self._lock:
            # Multiple faults may be injected simultaneously and stack.
            self.active_faults[fault_type] = time.time()
        logger.info("Fault injected: %s (active: %s)", fault_type, list(self.active_faults))

    async def clear_fault(self, fault_type: Optional[str] = None) -> None:
        async with self._lock:
            if fault_type is None:
                self.active_faults.clear()
            else:
                self.active_faults.pop(fault_type, None)
        logger.info("Fault cleared: %s (active: %s)", fault_type or "ALL", list(self.active_faults))

    _flight_profile = staticmethod(flight_profile)

    async def tick(self) -> dict:
        """Advance the simulation by one DT_SEC step and return the combined
        telemetry + diagnosis packet."""
        async with self._lock:
            t_now = time.time() - self.sim_start
            rpm, alt = flight_profile(t_now)
            self.engine.rpm = rpm

            active_faults = {}
            for fault_id, started_at in self.active_faults.items():
                elapsed_fault = time.time() - started_at
                severity = min(1.0, max(0.0, elapsed_fault / FAULT_RAMP_SECONDS))
                if severity > 0.0:
                    active_faults[fault_id] = severity

            telemetry = self.engine.step(
                rpm=rpm,
                dt_sec=DT_SEC,
                altitude_m=alt,
                active_faults=active_faults,
            )
            telemetry["timestamp"] = round(time.time(), 3)
            telemetry["sim_time_sec"] = round(t_now, 1)

            diagnosis = self.monitor.predict(telemetry)
            self.engine.health_score = float(diagnosis["health_score"])
            telemetry["health_score"] = round(self.engine.health_score, 1)
            # Read-only: self.monitor.buffer already holds the same window
            # predict() just used. See confidence_breakdown.py for why this
            # is reused instead of a second independent buffer.
            class_probabilities = compute_class_probabilities(self.monitor, list(self.monitor.buffer))

            packet = {**telemetry, "diagnosis": diagnosis, "class_probabilities": class_probabilities}
            self.last_packet = packet
            return packet


sim = DigitalTwinSimulation()


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.add(ws)
        logger.info("Client connected (%d total)", len(self.active))

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)
        logger.info("Client disconnected (%d total)", len(self.active))

    async def broadcast(self, payload: dict) -> None:
        if not self.active:
            return
        message = json.dumps(payload)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Background simulation loop
# ---------------------------------------------------------------------------
async def simulation_loop() -> None:
    while True:
        loop_start = time.monotonic()
        try:
            packet = await sim.tick()
            await manager.broadcast(packet)
        except Exception:
            logger.exception("Simulation tick failed")
        elapsed = time.monotonic() - loop_start
        await asyncio.sleep(max(0.0, DT_SEC - elapsed))


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(simulation_loop())
    logger.info("Digital twin simulation loop started (dt=%.1fs)", DT_SEC)
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="UAV Engine Digital Twin API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local demo — tighten this for any real deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------
class FaultRequest(BaseModel):
    fault_type: str = Field(..., description=f"One of {INJECTABLE_FAULTS}")


class ClearFaultRequest(BaseModel):
    fault_type: Optional[str] = Field(None, description="Fault to clear; omit to clear all")


@app.get("/")
def root():
    return {
        "service": "UAV Engine Digital Twin API",
        "status": "running",
        "websocket": "/ws/telemetry",
        "dt_sec": DT_SEC,
    }


@app.get("/telemetry/latest")
def latest_telemetry():
    """Snapshot of the most recent packet — lets a freshly-loaded dashboard
    paint immediately instead of waiting for the next WebSocket tick."""
    return sim.last_packet or {}


@app.post("/inject-fault")
async def inject_fault(req: FaultRequest):
    await sim.inject_fault(req.fault_type)
    return {"ok": True, "active_faults": list(sim.active_faults.keys())}


@app.post("/clear-fault")
async def clear_fault(req: ClearFaultRequest = ClearFaultRequest()):
    await sim.clear_fault(req.fault_type)
    return {"ok": True, "active_faults": list(sim.active_faults.keys())}


@app.post("/reset")
async def reset_simulation():
    await sim.reset()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Vercel-compatible stateless endpoints (also available in local dev)
# ---------------------------------------------------------------------------
class TickRequest(BaseModel):
    engine_state: Optional[dict] = None
    monitor_buffer: Optional[list] = None
    sim_time_sec: float = 0.0
    active_faults: Optional[dict] = None   # {fault_id: sim_time_sec_when_injected}
    fault_mode: str = "none"               # legacy single-fault field (still honored)
    fault_started_at: Optional[float] = None
    engine_started: bool = True
    throttle: Optional[float] = None
    load: float = 100.0
    altitude_m: Optional[float] = None


_tick_monitor = LiveEngineMonitor(model_dir=MODEL_DIR)


@app.post("/api/tick")
async def api_tick(req: TickRequest):
    # Delegate to the exact same logic the Vercel serverless function uses,
    # so local dev and production never diverge.
    return run_tick(req.model_dump(), _tick_monitor)


@app.post("/api/reset")
async def api_reset():
    return {
        "ok": True,
        "engine_state": {
            "ambient_c": 25.0,
            "oil_temp_c": 25.0,
            "cht_c": 25.0,
            "egt_c": 25.0,
            "cumulative_oil_loss": 0.0,
            "rpm": 1400.0,
            "health_score": 100.0,
        },
        "monitor_buffer": [],
        "sim_time_sec": 0.0,
    }


@app.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        if sim.last_packet is not None:
            await websocket.send_text(json.dumps(sim.last_packet))
        while True:
            # We don't expect incoming messages, but keep the receive loop
            # alive so we notice disconnects promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
