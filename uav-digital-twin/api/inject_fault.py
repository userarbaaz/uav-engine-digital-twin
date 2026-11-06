"""
Vercel Serverless Function: POST /api/inject_fault
==================================================
Validates fault type and confirms fault injection.
"""

import json
from http.server import BaseHTTPRequestHandler

VALID_FAULTS = {
    "none",
    "oil_leak",
    "piston_ring_wear",
    "fuel_system_degradation",
    "sensor_drift",
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
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        fault = body.get("fault_type", "none")

        if fault not in VALID_FAULTS:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            _cors(self)
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Invalid fault: {fault}"}).encode())
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        _cors(self)
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "fault_type": fault}).encode())

    def log_message(self, fmt, *args):
        pass
