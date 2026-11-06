# UAV Engine Digital Twin — Dashboard

**SIH26054** — AI-Enabled Real-Time Digital Twin for Health Monitoring, Fault
Prediction and Mission Reliability Enhancement of Aero Piston Engines used in
MALE UAVs.

Full-stack app around the pre-trained ML pipeline: a FastAPI backend runs the
physics simulation + model inference and streams it over a WebSocket, and a
React dashboard displays it with live fault-injection controls for demos.

```
backend/    FastAPI server — simulation loop, WebSocket, fault-injection API
frontend/   React dashboard — gauges, diagnosis panel, trend chart, controls
```

The ML files (`engine_model.py`, `live_monitor.py`, and the six `.pkl`
files) are copied from the handoff package as-is and are **not modified**.

---

## 1. Run the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

You should see `Digital twin simulation loop started (dt=2.0s)` in the logs.
Leave this running. Quick sanity check in another terminal:

```bash
curl http://localhost:8000/
curl http://localhost:8000/telemetry/latest
```

**Note:** `requirements.txt` pins `scikit-learn==1.9.0` to match the version
the `.pkl` files were trained with. If that exact version isn't available for
your platform, a nearby 1.x version will still work — you'll just see a
harmless `InconsistentVersionWarning` in the logs.

## 2. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL it prints (default **http://localhost:5173**). The dashboard
connects to the backend at `http://localhost:8000` by default. If your
backend runs somewhere else, set `VITE_API_BASE` before starting, e.g.:

```bash
VITE_API_BASE=http://localhost:9000 npm run dev
```

## 3. Using it

- Gauges, the diagnosis panel, the health score, and the trend chart update
  automatically as telemetry streams in over the WebSocket, once every 2s.
- Use the **Fault Injection** buttons to trigger `oil_leak`, `overheat`,
  `misfire`, or `low_fuel_pressure` live — severity ramps up progressively
  over ~40 seconds rather than snapping instantly, so the health score and
  RUL countdown (when applicable) have something to show during a demo.
- **Clear Fault** stops the active fault and lets the engine recover.
- **Reset Flight** restarts the simulated flight from t=0 with a clean
  engine state and monitor buffer.
- If the backend goes down or the connection drops, the dashboard shows a
  clear "LINK LOST — RETRYING" state and reconnects automatically — it never
  silently freezes on stale numbers.

## 4. API reference

| Endpoint | Method | Description |
|---|---|---|
| `/ws/telemetry` | WS | Streams one JSON packet (telemetry + diagnosis) every 2s |
| `/telemetry/latest` | GET | Snapshot of the most recent packet |
| `/inject-fault` | POST | Body: `{"fault_type": "oil_leak" \| "overheat" \| "misfire" \| "low_fuel_pressure"}` |
| `/clear-fault` | POST | Stops the active fault |
| `/reset` | POST | Restarts the simulation from t=0 |

## 5. Known limitations (inherited from the ML pipeline)

- The Isolation Forest (anomaly detector) is weaker than the Random Forest
  (fault classifier) — the Random Forest is the primary, reliable signal.
- Very early-stage faults are harder to catch than fully-developed ones.
- The model was trained on one physics-based flight profile (climb → cruise
  → descent); very different profiles may need retraining.
- The simulator and model both assume `dt=2.0s` — don't change the backend's
  tick rate without retraining.

If you need to retrain or touch `engine_model.py`, check with whoever built
the ML pipeline first — the model, simulator, and feature engineering all
have to stay in sync.
