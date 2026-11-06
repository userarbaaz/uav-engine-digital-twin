"""
Vercel Serverless Function: POST /api/reset
===========================================
Returns a fresh initial engine state so the client can restart the simulation.
"""

import json
from http.server import BaseHTTPRequestHandler

INITIAL_ENGINE_STATE = {
    "ambient_c": 25.0,
    "oil_temp_c": 25.0,
    "cht_c": 25.0,
    "egt_c": 25.0,
    "cumulative_oil_loss": 0.0,
    "rpm": 1400.0,
}


def _cors(h):
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    h.send_header("Access-Control-Allow-Headers", "Content-Type")


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        _cors(self)
        self.end_headers()

    def do_POST(self):
        payload = json.dumps({
            "ok": True,
            "engine_state": INITIAL_ENGINE_STATE,
            "monitor_buffer": [],
            "sim_time_sec": 0.0,
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        _cors(self)
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        pass
