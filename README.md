# UAV Engine Digital Twin — Quick Start & Setup Guide

**SIH26054** — AI-Enabled Real-Time Digital Twin for Health Monitoring, Fault Prediction, and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs.

This repository contains the complete full-stack Digital Twin system:
- **Backend (`uav-digital-twin/backend`)**: FastAPI server running the engine physics simulation, machine learning inference pipeline (Random Forest fault classifier, Isolation Forest anomaly detector), and WebSocket telemetry streaming.
- **Frontend (`uav-digital-twin/frontend`)**: Responsive React dashboard with real-time gauges, trend charts, confidence breakdown, health score display, and live fault-injection controls.

---

## Currently Running Services

The application has been started for you:

| Service | Local URL | Description |
|---|---|---|
| **Frontend Dashboard** | [http://localhost:5173](http://localhost:5173) | Live React control panel & dashboard |
| **Backend API** | [http://localhost:8000](http://localhost:8000) | FastAPI server & REST API |
| **API Documentation** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive Swagger UI API docs |
| **WebSocket Stream** | `ws://localhost:8000/ws/telemetry` | Real-time 2.0s interval telemetry feed |

---

## How to Run the Project Manually

If you need to start the project manually or run it on another machine, follow the instructions below.

### Prerequisites

- **Python**: 3.10 or higher
- **Node.js**: 18.x or higher (with `npm`)

---

### Step 1: Run the Backend Server

Open a terminal window and execute:

```bash
# Navigate to the backend directory
cd uav-digital-twin/backend

# (Optional) Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Start the FastAPI backend server
uvicorn main:app --reload --port 8000
```

> **Verification**: Visit [http://localhost:8000/](http://localhost:8000/) in your browser or run `curl http://localhost:8000/telemetry/latest`. You should receive a JSON response confirming the backend is running.

---

### Step 2: Run the Frontend Dashboard

Open a second terminal window and execute:

```bash
# Navigate to the frontend directory
cd uav-digital-twin/frontend

# Install Node.js dependencies
npm install

# Start the Vite development server
npm run dev
```

> **Access the App**: Open [http://localhost:5173](http://localhost:5173) in your web browser.

---

## System Architecture & Features

```
uav-digital-twin/
├── backend/
│   ├── main.py                  # FastAPI app & WebSocket stream endpoint
│   ├── engine_model.py          # Physics-based engine simulation model
│   ├── live_monitor.py          # Live feature extraction & windowing
│   ├── requirements.txt         # Python dependencies (FastAPI, Scikit-learn, Pandas)
│   └── *.pkl                    # Pre-trained ML models & scalers
└── frontend/
    ├── src/                     # React components, dashboard UI & WebSocket hooks
    ├── package.json             # NPM dependencies (React, Recharts, Vite)
    └── vite.config.js           # Vite dev server configuration
```

### Key Features & Demo Operations

1. **Real-time Telemetry Dashboard**: Displays RPM, Exhaust Gas Temperature (EGT), Oil Pressure, Fuel Flow, Manifold Pressure, and Vibration in real-time (2-second updates).
2. **Health Score & Remaining Useful Life (RUL)**: Live engine health degradation index and predictive time-to-failure metric.
3. **Live Fault Injection**:
   - Use the UI buttons to inject simulated anomalies: `Oil Leak`, `Overheat`, `Engine Misfire`, `Low Fuel Pressure`, or `Sensor Failure`.
   - Fault severity builds up dynamically over ~40 seconds for realistic demo visualization.
4. **Clear Fault & Reset Flight**:
   - **Clear Fault**: Stops active fault injection and allows engine parameters to recover.
   - **Reset Flight**: Restarts simulation state to $t = 0$ with a pristine engine state.

---

## API Reference Summary

| Endpoint | Method | Description |
|---|---|---|
| `GET /` | GET | Server health check |
| `GET /telemetry/latest` | GET | Most recent telemetry & ML diagnosis frame |
| `POST /inject-fault` | POST | Inject fault `{"fault_type": "oil_leak" \| "overheat" \| "misfire" \| "low_fuel_pressure"}` |
| `POST /clear-fault` | POST | Clear active fault state |
| `POST /reset` | POST | Reset flight simulation to $t = 0$ |
| `WS /ws/telemetry` | WebSocket | Live streaming telemetry data packet every 2.0 seconds |

---

## Troubleshooting

- **Port in Use**: If port 8000 or 5173 is already in use, you can run uvicorn on another port (e.g. `--port 8001`) and specify `VITE_API_BASE=http://localhost:8001 npm run dev` when launching the frontend.
- **Scikit-learn Warning**: A warning regarding `scikit-learn` version mismatch (1.9.0 vs system version) is harmless and does not affect model inference.
