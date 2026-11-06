"""
Rotax 912 S/ULS - Physics-Based Engine Model & Digital Twin Core
================================================================
SIH26054 - AI-Enabled Real-Time Digital Twin for Health Monitoring
of Aero Piston Engines in MALE UAVs

Upgrades included:
1. ISA Atmosphere & Altitude De-rating (Air Density, Manifold & Power drop with altitude)
2. Advanced Fault Injection (Overheat, Oil Leak, Fuel Starvation, Sensor Failure, Cylinder Misfire)
3. Progressive Fault Severity (0.0 to 1.0)
4. Dynamic Thermal Inertia & Fluid Mechanics

Author: Random Six - Group 1 (Digital Twin & Simulation)
"""

import numpy as np
from scipy.interpolate import interp1d

# =============================================================================
# 1. BASELINE DATA (Rotax 912 S/ULS Operator Manual OM-912)
# =============================================================================

# Sea-Level Wide Open Throttle / Baseline Performance Points
RPM_POINTS       = np.array([1400, 4300, 4800, 5000, 5500, 5800])
POWER_KW_POINTS  = np.array([0.0,  38.0, 44.6, 51.0, 69.0, 73.5])
TORQUE_NM_POINTS = np.array([58.0, 84.3, 88.7, 97.4, 119.8, 121.0])
MANIFOLD_POINTS  = np.array([15.0, 24.0, 26.0, 26.0, 27.0, 27.5])   # in.Hg at Sea Level

FUEL_RPM_POINTS  = np.array([1400, 4300, 5000, 5500, 5800])
FUEL_LH_POINTS   = np.array([4.0,  18.5, 18.5, 25.0, 27.0])  # Litres/hour

LIMITS = {
    "rpm":                    {"idle": 1400, "max_continuous": 5500, "max_takeoff": 5800},
    "oil_pressure_bar":       {"min": 0.8, "normal_low": 2.0, "normal_high": 5.0, "max": 7.0},
    "oil_temp_c":             {"min": 50, "normal_low": 90, "normal_high": 110, "max": 130},
    "cht_c":                  {"normal_max": 110, "max": 135},
    "egt_c":                  {"normal_max": 750, "max": 880},
    "fuel_pressure_bar":      {"min": 0.15, "normal": 0.3, "max": 0.4},
    "manifold_pressure_inhg": {"max": 27.5},
}

FAULT_MODES = ["none", "overheat", "oil_leak", "low_fuel_pressure", "sensor_failure", "misfire"]

# RPM governor / load-response tuning
RPM_IDLE = 1400.0
RPM_MAX = 5800.0
RPM_LOAD_SAG = 550.0   # max RPM sag from full dynamometer/prop load at full throttle
TAU_RPM = 2.5          # seconds — engine speed doesn't snap to a new target instantly

# Interpolation functions (Sea-Level Baseline)
_power_interp    = interp1d(RPM_POINTS, POWER_KW_POINTS, kind="linear", fill_value="extrapolate")
_torque_interp   = interp1d(RPM_POINTS, TORQUE_NM_POINTS, kind="linear", fill_value="extrapolate")
_manifold_interp = interp1d(RPM_POINTS, MANIFOLD_POINTS, kind="linear", fill_value="extrapolate")
_fuel_interp     = interp1d(FUEL_RPM_POINTS, FUEL_LH_POINTS, kind="linear", fill_value="extrapolate")


# =============================================================================
# 2. ATMOSPHERIC MODEL (ISA - International Standard Atmosphere)
# =============================================================================

def get_atmospheric_properties(altitude_m: float):
    """
    Computes ISA temperature, pressure (inHg), and relative air density (sigma)
    at given altitude in meters (Crucial for MALE UAV flight conditions).
    """
    T0 = 288.15     # Sea level temperature (K)
    P0 = 101325.0   # Sea level pressure (Pa)
    L  = 0.0065     # Temperature lapse rate (K/m)
    g  = 9.80665    # Gravity (m/s^2)
    R  = 287.05     # Specific gas constant (J/(kg*K))

    if altitude_m < 11000:
        T = T0 - L * altitude_m
        P = P0 * (1.0 - (L * altitude_m) / T0) ** (g / (R * L))
    else:
        # Tropopause (above 11,000m)
        T11 = T0 - L * 11000.0
        P11 = P0 * (1.0 - (L * 11000.0) / T0) ** (g / (R * L))
        T = T11
        P = P11 * np.exp(-g * (altitude_m - 11000.0) / (R * T11))

    # Density ratio sigma = rho / rho_0
    rho_0 = P0 / (R * T0)
    rho = P / (R * T)
    sigma = float(rho / rho_0)
    
    # Ambient pressure in in.Hg (1 Pa = 0.0002953 inHg)
    ambient_pressure_inhg = float(P * 0.0002953)
    ambient_temp_c = float(T - 273.15)
    
    return ambient_temp_c, ambient_pressure_inhg, sigma


# =============================================================================
# 3. ENGINE STATE & SIMULATION CORE
# =============================================================================

class EngineState:
    """
    Stateful Digital Twin model for Rotax 912 S/ULS engine.
    Carries forward thermal inertia, cumulative wear, and dynamic conditions.
    """

    def __init__(self, ambient_c: float = 25.0, rpm: float = RPM_IDLE):
        self.ambient_c = ambient_c
        self.oil_temp_c = ambient_c
        self.cht_c = ambient_c
        self.egt_c = ambient_c
        self.cumulative_oil_loss = 0.0  # Tracks progressive oil leak
        self.health_score = 100.0       # Tracks persistent engine health (irreversible in-flight)
        self.rpm = float(rpm)           # Carries engine-speed inertia between ticks

    def compute_rpm_response(self, throttle_pct: float, load_pct: float, dt_sec: float) -> float:
        """
        Couples commanded throttle with dynamometer/propeller load to produce a
        physically-motivated RPM response: more load at a given throttle setting
        bogs the engine down (lower RPM), and RPM approaches its new target with
        first-order lag rather than snapping instantly (turbine/crank inertia).
        """
        throttle_frac = float(np.clip(throttle_pct / 100.0, 0.0, 1.0))
        load_frac = float(np.clip(load_pct / 100.0, 0.0, 1.0))

        commanded_rpm = RPM_IDLE + throttle_frac * (RPM_MAX - RPM_IDLE)
        load_drop = load_frac * throttle_frac * RPM_LOAD_SAG
        target_rpm = max(RPM_IDLE * 0.35, commanded_rpm - load_drop)

        self.rpm += (target_rpm - self.rpm) * (1.0 - np.exp(-dt_sec / TAU_RPM))
        return float(self.rpm)

    def step(self,
             rpm: float,
             dt_sec: float,
             altitude_m: float = 0.0,
             active_faults: dict | None = None,
             fault_mode: str = "none",
             fault_severity: float = 1.0) -> dict:
        """
        Advance engine simulation by dt_sec under given RPM, altitude, and fault state.

        Parameters:
            rpm: Engine speed (1400 - 5800)
            dt_sec: Time step interval in seconds
            altitude_m: Current UAV altitude in meters
            active_faults: dict of {fault_id: severity(0..1)} for simultaneous faults.
                Takes precedence over fault_mode/fault_severity when provided.
            fault_mode: (legacy, single-fault) One of FAULT_MODES
            fault_severity: (legacy, single-fault) 0.0 (healthy) to 1.0 (full failure)
        """
        if active_faults is None:
            active_faults = {}
            if fault_mode and fault_mode != "none" and fault_severity > 0:
                active_faults = {fault_mode: float(np.clip(fault_severity, 0.0, 1.0))}

        for fmode in active_faults:
            if fmode not in FAULT_MODES or fmode == "none":
                raise ValueError(f"Unknown fault_mode '{fmode}'. Must be one of {FAULT_MODES}")
        active_faults = {k: float(np.clip(v, 0.0, 1.0)) for k, v in active_faults.items()}

        # 1. Atmospheric calculations
        amb_temp, amb_pressure_inhg, sigma = get_atmospheric_properties(altitude_m)
        effective_ambient = amb_temp if altitude_m > 0 else self.ambient_c

        # 2. Naturally Aspirated Power & Manifold De-rating with Altitude
        # Gagg-Farrar power de-rating formula for piston aero-engines
        altitude_power_factor = max(0.2, (sigma - 0.117) / 0.883)
        
        base_power_kw = float(np.clip(_power_interp(rpm), 0, 80))
        power_kw = base_power_kw * altitude_power_factor
        
        # Manifold pressure cannot exceed ambient barometric pressure
        base_map = float(np.clip(_manifold_interp(rpm), 15, 27.5))
        manifold_pressure = min(base_map, amb_pressure_inhg)
        
        torque_nm = float(np.clip(_torque_interp(rpm) * altitude_power_factor, 0, 125))
        fuel_flow = float(np.clip(_fuel_interp(rpm) * altitude_power_factor, 3.5, 28))

        # 3. Dynamic Thermal Lag Response (1st-order differential response)
        power_frac = power_kw / 73.5  # 0.0 to 1.0

        # CHT: thermal settling ~ 110-120C at max power
        steady_cht = effective_ambient + power_frac * 95.0
        tau_cht = 60.0
        self.cht_c += (steady_cht - self.cht_c) * (1.0 - np.exp(-dt_sec / tau_cht))

        # EGT: settles ~ 700-780C at max power (fast response)
        steady_egt = effective_ambient + power_frac * 680.0
        tau_egt = 20.0
        self.egt_c += (steady_egt - self.egt_c) * (1.0 - np.exp(-dt_sec / tau_egt))

        # Oil Temp: settles ~ 95-110C (very high thermal mass)
        steady_oil = effective_ambient + 60.0 + power_frac * 40.0
        tau_oil = 180.0
        self.oil_temp_c += (steady_oil - self.oil_temp_c) * (1.0 - np.exp(-dt_sec / tau_oil))

        # 4. Oil Pressure Model (viscosity + pump speed)
        base_oil_p = 2.0 + (rpm / 5500.0) * 3.0
        cold_oil_boost = max(0.0, (50.0 - self.oil_temp_c) * 0.05)
        oil_pressure = base_oil_p + cold_oil_boost

        # 5. Baseline Vibration Model (RPM^2 centrifugal imbalance + noise)
        base_vib = 1.0 + 3.0 * (rpm / 5800.0) ** 2
        vibration = base_vib + np.random.normal(0, 0.05)

        # Baseline Fuel Pressure
        fuel_pressure = 0.30 + np.random.normal(0, 0.01)

        # Output Readings
        cht_out = self.cht_c
        egt_out = self.egt_c
        oil_temp_out = self.oil_temp_c
        oil_p_out = oil_pressure
        fuel_flow_out = fuel_flow
        fuel_p_out = fuel_pressure
        vib_out = vibration
        rpm_out = rpm

        # =====================================================================
        # 6. ADVANCED FAULT INJECTION (stacks — any number of faults may be
        #    simultaneously active; each contributes its own effect additively
        #    so combined failures compound realistically)
        # =====================================================================
        oil_leak_severity = active_faults.get("oil_leak", 0.0)
        if oil_leak_severity <= 0.0:
            # Oil recovers (drained loss resets) once the leak fault is cleared
            self.cumulative_oil_loss = max(0.0, self.cumulative_oil_loss - 0.02 * dt_sec)

        for fmode, fsev in active_faults.items():
            if fmode == "overheat":
                # Coolant circuit blockage / radiator shutter failure
                cht_out += (35.0 * fsev)
                egt_out += (45.0 * fsev)
                oil_temp_out += (25.0 * fsev)

            elif fmode == "oil_leak":
                # Progressive oil loss drops pressure, increases friction and vibration
                self.cumulative_oil_loss += (0.02 * fsev * dt_sec)
                leak_impact = min(1.0, self.cumulative_oil_loss / 1.5)
                # Immediate drop on leak onset + dynamic drop as oil drains
                oil_p_drop = (1.8 * fsev) + (2.0 * leak_impact)
                oil_p_out -= oil_p_drop
                oil_temp_out += (35.0 * max(fsev * 0.5, leak_impact))
                vib_out += (1.5 * max(fsev * 0.4, leak_impact))

            elif fmode == "low_fuel_pressure":
                # Fuel pump diaphragm degradation or vapor lock
                fuel_p_out -= (0.18 * fsev)
                fuel_flow_out *= (1.0 - 0.4 * fsev)
                # Lean mixture causes higher EGT initially, followed by power drop
                egt_out += (50.0 * fsev)
                power_kw *= (1.0 - 0.25 * fsev)

            elif fmode == "sensor_failure":
                # Dead sensor (reads 0) or erratic erratic spikes
                cht_out = 0.0

            elif fmode == "misfire":
                # Cylinder misfire: torque drop, heavy vibration harmonics, unburnt fuel
                power_kw *= (1.0 - 0.28 * fsev)
                torque_nm *= (1.0 - 0.28 * fsev)
                vib_out += np.random.uniform(2.5, 4.5) * fsev  # High vibration spike
                egt_out -= (120.0 * fsev)  # Cool unburnt fuel drop
                rpm_out += np.random.normal(0, 45.0 * fsev)   # RPM jitter

        reading = {
            "rpm": float(np.clip(rpm_out, 0, 6000)),
            "power_kw": float(max(0.0, power_kw)),
            "torque_nm": float(max(0.0, torque_nm)),
            "manifold_pressure_inhg": float(np.clip(manifold_pressure, 10, 30)),
            "fuel_flow_lph": float(max(0.0, fuel_flow_out)),
            "fuel_pressure_bar": float(np.clip(fuel_p_out, 0.0, 0.5)),
            "oil_pressure_bar": float(np.clip(oil_p_out, 0.0, 7.5)),
            "oil_temp_c": float(oil_temp_out),
            "cht_c": float(cht_out),
            "egt_c": float(egt_out),
            "coolant_temp_c": float(cht_out - 8.0),
            "vibration_level": float(max(0.0, vib_out)),
            "altitude_m": float(altitude_m),
            "active_faults": dict(active_faults),
            "fault_mode": ",".join(active_faults.keys()) if active_faults else "none",
            "fault_severity": float(max(active_faults.values())) if active_faults else 0.0,
            "health_score": float(self.health_score),
        }
        return reading


# =============================================================================
# QUICK TEST
# =============================================================================
if __name__ == "__main__":
    print("Testing Updated Rotax 912 S/ULS Digital Twin Engine...")
    engine = EngineState(ambient_c=25.0)

    # Test Altitude effect (Sea level vs 3000m / ~10,000 ft)
    r_sl = engine.step(rpm=5000, dt_sec=10.0, altitude_m=0.0)
    r_alt = engine.step(rpm=5000, dt_sec=10.0, altitude_m=3000.0)

    print(f"\n[Sea Level] Power: {r_sl['power_kw']:.1f} kW | MAP: {r_sl['manifold_pressure_inhg']:.1f} inHg")
    print(f"[3000m Alt] Power: {r_alt['power_kw']:.1f} kW | MAP: {r_alt['manifold_pressure_inhg']:.1f} inHg")

    # Test Misfire
    r_misfire = engine.step(rpm=5000, dt_sec=1.0, fault_mode="misfire", fault_severity=0.8)
    print(f"\n[Misfire Test] Vibration: {r_misfire['vibration_level']:.2f} a.u. (High!) | EGT: {r_misfire['egt_c']:.1f} C")
    print("\n✅ Upgraded Engine Model is Ready!")