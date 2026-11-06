import joblib
import pandas as pd
import numpy as np
from collections import deque

class LiveEngineMonitor:
    def __init__(self, model_dir='.'):
        self.iso_forest = joblib.load(f'{model_dir}/isolation_forest.pkl')
        self.rf_clf = joblib.load(f'{model_dir}/fault_classifier.pkl')
        self.scaler = joblib.load(f'{model_dir}/scaler.pkl')
        self.feature_cols = joblib.load(f'{model_dir}/feature_cols.pkl')
        self.scaler_iso = joblib.load(f'{model_dir}/scaler_iso.pkl')
        self.core_features = joblib.load(f'{model_dir}/core_features.pkl')

        self.sensor_cols = ['rpm', 'cht_c', 'egt_c', 'oil_temp_c', 'oil_pressure_bar',
                             'vibration_level', 'fuel_pressure_bar', 'coolant_temp_c']
        self.buffer = deque(maxlen=30)

        self.LIMITS = {
            'cht_c': (None, 135), 'oil_temp_c': (None, 130),
            'oil_pressure_bar': (0.8, 7.0), 'egt_c': (None, 950),
            'vibration_level': (None, 8.0)
        }
        self.WEIGHTS = {'cht_c': 0.3, 'oil_pressure_bar': 0.3, 'egt_c': 0.2,
                         'oil_temp_c': 0.1, 'vibration_level': 0.1}

    def _compute_features(self, reading):
        self.buffer.append(reading)
        buf_df = pd.DataFrame(self.buffer)
        row = {}
        for col in self.sensor_cols:
            row[col] = reading[col]
            row[f'{col}_roll_mean'] = buf_df[col].rolling(10, min_periods=1).mean().iloc[-1]
            row[f'{col}_roll_std']  = buf_df[col].rolling(10, min_periods=1).std().fillna(0).iloc[-1]
            row[f'{col}_rate'] = buf_df[col].diff().fillna(0).iloc[-1]
        if len(buf_df) >= 30:
            row['oil_pressure_bar_drop_30'] = buf_df['oil_pressure_bar'].iloc[-1] - buf_df['oil_pressure_bar'].iloc[0]
        else:
            row['oil_pressure_bar_drop_30'] = 0
        # Preserve context fields
        row['active_faults'] = reading.get('active_faults', {})
        row['health_score'] = reading.get('health_score', None)
        return row

    def _health_score(self, row):
        score = 100.0

        # 1. Sensor telemetry penalty curves — scaled for 30-60 min flight lifecycle.
        #    Sensors degrade slowly (FAULT_RAMP_SECONDS=300) so these penalties
        #    accumulate gradually rather than all at once.
        oil_p = row.get('oil_pressure_bar', 4.0)
        if oil_p < 2.5:
            # Ramps from 0 at 2.5 bar to 15 pts at 0.8 bar
            score -= max(0.0, min(15.0, ((2.5 - oil_p) / 1.7) * 15.0))
        elif oil_p > 6.5:
            score -= max(0.0, min(6.0, ((oil_p - 6.5) / 1.0) * 6.0))

        cht = row.get('cht_c', 70.0)
        if cht > 105.0:
            # Ramps from 0 at 105°C to 12 pts at 135°C
            score -= max(0.0, min(12.0, ((cht - 105.0) / 30.0) * 12.0))
        elif cht <= 1.0 and row.get('rpm', 0) > 400:
            score -= 8.0  # Dead CHT sensor

        oil_t = row.get('oil_temp_c', 85.0)
        if oil_t > 105.0:
            # Ramps from 0 at 105°C to 10 pts at 130°C
            score -= max(0.0, min(10.0, ((oil_t - 105.0) / 25.0) * 10.0))

        egt = row.get('egt_c', 600.0)
        if egt > 800.0:
            score -= max(0.0, min(10.0, ((egt - 800.0) / 150.0) * 10.0))

        vib = row.get('vibration_level', 1.0)
        if vib > 2.2:
            # Ramps from 0 at 2.2 to 12 pts at 6.0
            score -= max(0.0, min(12.0, ((vib - 2.2) / 3.8) * 12.0))

        fuel_p = row.get('fuel_pressure_bar', 0.3)
        if fuel_p < 0.24:
            # Ramps from 0 at 0.24 to 12 pts at 0.08
            score -= max(0.0, min(12.0, ((0.24 - fuel_p) / 0.16) * 12.0))

        # 2. Direct fault-awareness penalties — kept small since sensors are the
        #    primary health signal. These represent structural damage beyond sensors.
        active_faults = row.get('active_faults', {})
        fault_penalties = {
            'oil_leak':          6.0,
            'overheat':          5.0,
            'misfire':           4.0,
            'low_fuel_pressure': 4.0,
            'sensor_failure':    3.0,
        }
        total_fault_penalty = 0.0
        active_count = 0
        for fmode, fsev in active_faults.items():
            if fsev > 0.0 and fmode in fault_penalties:
                active_count += 1
                total_fault_penalty += fault_penalties[fmode] * float(fsev)

        # Multi-fault compounding: each additional simultaneous fault adds 30%
        if active_count > 1:
            total_fault_penalty *= (1.0 + 0.30 * (active_count - 1))

        score -= total_fault_penalty
        instant_health = max(12.0, min(100.0, score))

        # 3. Persistent wear: engine health only decreases during a flight.
        #    Health is only restored when the user presses Reset Flight.
        prev_health = row.get('health_score')
        if prev_health is not None and prev_health > 0:
            instant_health = min(float(prev_health), instant_health)

        return round(instant_health, 1)

    def _estimate_rul(self, row, pred='none'):
        """
        Estimates Remaining Useful Life (seconds) until critical engine failure.

        Piecewise health-based curve calibrated for a 30-60 minute flight lifecycle:
            100% health → 3600 s (1 h 00 m)
             90%        → 2700 s (45 min)
             70%        → 1800 s (30 min)
             50%        →  900 s (15 min)
             30%        →  300 s (5 min)
             10%        →   60 s (1 min)
              0%        →    0 s
        """
        health = row.get('health_score')
        if health is None:
            health = 100.0
        h = max(0.0, min(100.0, float(health)))

        if h >= 90.0:
            rul = 2700.0 + ((h - 90.0) / 10.0) * 900.0   # 2700 – 3600 s
        elif h >= 70.0:
            rul = 1800.0 + ((h - 70.0) / 20.0) * 900.0   # 1800 – 2700 s
        elif h >= 50.0:
            rul = 900.0  + ((h - 50.0) / 20.0) * 900.0   #  900 – 1800 s
        elif h >= 30.0:
            rul = 300.0  + ((h - 30.0) / 20.0) * 600.0   #  300 –  900 s
        elif h >= 10.0:
            rul = 60.0   + ((h - 10.0) / 20.0) * 240.0   #   60 –  300 s
        else:
            rul = (h / 10.0) * 60.0                        #    0 –   60 s

        return round(max(0.0, rul), 1)

    def predict(self, reading):
        feat_dict = self._compute_features(reading)

        X_live = pd.DataFrame([feat_dict])[self.feature_cols]
        X_live_scaled = self.scaler.transform(X_live)
        pred = self.rf_clf.predict(X_live_scaled)[0]
        probs = self.rf_clf.predict_proba(X_live_scaled)[0]
        confidence = dict(zip(self.rf_clf.classes_, probs))[pred]

        X_live_core = pd.DataFrame([feat_dict])[self.core_features]
        X_live_core_scaled = self.scaler_iso.transform(X_live_core)
        anomaly_flag = self.iso_forest.predict(X_live_core_scaled)[0] == -1

        health = self._health_score(feat_dict)
        # Write the freshly computed health back so _estimate_rul uses the current value
        feat_dict['health_score'] = health
        rul = self._estimate_rul(feat_dict, pred)

        return self._generate_message(pred, confidence, anomaly_flag, feat_dict, health, rul)

    def _generate_message(self, pred, confidence, anomaly_flag, row, health, rul):
        active_faults = row.get('active_faults', {})
        messages = {
            'none': ("Engine Normal", "All systems nominal.", "normal"),
            'oil_leak': ("Oil Pressure Loss Detected",
                         f"Oil pressure has fallen (currently {row.get('oil_pressure_bar', 0):.2f} bar). Critical lubrication risk.", "warning"),
            'overheat': ("Engine Overheating", f"CHT at {row.get('cht_c', 0):.0f}°C, approaching limit.", "critical"),
            'misfire': ("Misfire Detected", f"Abnormal vibration ({row.get('vibration_level', 0):.2f}) detected.", "warning"),
            'low_fuel_pressure': ("Low Fuel Pressure",
                                  f"Fuel pressure at {row.get('fuel_pressure_bar', 0):.2f} bar, below expected.", "warning"),
        }
        if len(active_faults) > 1:
            fault_names = ", ".join(f.replace("_", " ").title() for f in active_faults)
            label = f"Multiple Critical Faults ({len(active_faults)})"
            msg = f"Simultaneous failures active: {fault_names}. Severe engine degradation."
            severity = "critical"
        elif "sensor_failure" in active_faults:
            label = "Sensor Telemetry Lost"
            msg = "CHT sensor signal failure (reading 0°C). Flight computer fallback active."
            severity = "critical"
        elif len(active_faults) == 1 and pred == 'none':
            single_fault = list(active_faults.keys())[0]
            if single_fault in messages:
                label, msg, severity = messages[single_fault]
            else:
                label, msg, severity = ("Fault Active", f"{single_fault.replace('_', ' ').title()} active.", "warning")
        elif pred in messages:
            label, msg, severity = messages[pred]
        else:
            label, msg, severity = ("Engine Warning", "Abnormal engine telemetry detected.", "warning")

        if health < 40.0:
            severity = "critical"
        elif health < 70.0 and severity == "normal":
            severity = "warning"

        result = {
            'label': label, 'message': msg, 'severity': severity,
            'confidence': f"{confidence:.0%}", 'anomaly_flag': bool(anomaly_flag),
            'health_score': health
        }
        if rul is not None:
            mins = int(rul // 60)
            secs = int(rul % 60)
            time_str = f"{mins}m {secs:02d}s" if mins > 0 else f"{secs}s"
            result['message'] += f" Estimated {time_str} until critical."
            result['rul_seconds'] = rul
        return result
