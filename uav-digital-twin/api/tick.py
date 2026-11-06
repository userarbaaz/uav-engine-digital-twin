"""
Vercel Serverless Function: POST /api/tick
==========================================
Accepts the current simulation state from the client, advances the
Rotax 912 physics simulation by one 2-second tick, runs ML inference,
and returns the new telemetry + diagnosis + updated state.

The client owns the state between calls — no server-side persistence needed.
Actual tick-advance logic lives in lib/tick_logic.py, shared with the local
FastAPI dev server (backend/main.py) so the two deployment paths never drift.
"""

import sys
import os
import json
import traceback

from http.server import BaseHTTPRequestHandler

# ── add api/lib to path so engine_model + live_monitor + tick_logic are importable ─
LIB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib")
sys.path.insert(0, LIB_DIR)

from live_monitor import LiveEngineMonitor  # noqa: E402
from tick_logic import run_tick  # noqa: E402


def _cors(h):
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")


_monitor = None

def get_monitor():
    global _monitor
    if _monitor is None:
        _monitor = LiveEngineMonitor(model_dir=LIB_DIR)
    return _monitor


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        _cors(self)
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            result = run_tick(body, get_monitor())

            payload = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            _cors(self)
            self.end_headers()
            self.wfile.write(payload)

        except Exception as exc:
            error_payload = json.dumps({
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(error_payload)))
            _cors(self)
            self.end_headers()
            self.wfile.write(error_payload)

    def log_message(self, fmt, *args):  # suppress access logs on Vercel
        pass
