"""
MK8 ATGM Physics Simulator.

Forward-integrates the MK8 missile flight in screen-world space using
confirmed game-extracted physics parameters.

Coordinate system
-----------------
- Lateral (X, Y) : screen pixels relative to target at origin (0, 0)
- Depth   (Z)    : world-space meters along the line of sight from gun
- Positive X = right on screen, positive Y = down on screen

Physics (confirmed from game files)
------------------------------------
  Launch velocity   : 30.0   m/s
  Acceleration      : 289.86 m/s² → caps at 666.67 m/s
  Turn rate         : 72.0   deg/s
  Guidance sens     : 0.72
  SACLOS law        : F = k · φ_err · z_from_muzzle
                      where φ_err is angular error (rad), z_from_muzzle (m),
                      F is angular acceleration command (rad/s²), capped at
                      turn_rate × sensitivity.
"""

import math
from dataclasses import dataclass, field
from typing import List, Tuple, Optional


# ---------------------------------------------------------------------------
#  Data structures
# ---------------------------------------------------------------------------

@dataclass
class SimState:
    """Per-tick snapshot of the full missile + guidance state."""
    t: float              # Elapsed time (s)

    # Missile position (world meters, relative to target plane at z=range_m)
    lat_x_m: float        # Lateral X  (m)
    lat_y_m: float        # Lateral Y  (m)

    # Same in screen pixels (for plotting)
    lat_x_px: float
    lat_y_px: float

    # Missile velocity components (m/s)
    vlat_x: float
    vlat_y: float
    vdepth: float         # Depth velocity toward target

    # Scalar state
    speed: float          # Total speed  (m/s)
    z_from_muzzle: float  # Distance already traveled from gun (m)
    range_remaining: float # Remaining depth to target (m)

    # TORC geometry
    theta: float          # Angle: velocity vs. radial-to-target (rad)
    torc_q: float         # Instantaneous TORC quality = |sin θ|

    # Guidance diagnostics
    turn_authority: float # Effective turn rate at current speed (deg/s)
    err_total_rad: float  # Total angular error commanded this tick (rad)

    # Crosshair state (screen pixels)
    ch_x_px: float
    ch_y_px: float


@dataclass
class SimResult:
    """Outcome of one simulation run."""
    hit: bool
    miss_dist_px: float       # Final lateral distance from target (px)
    miss_dist_m: float        # Same in world metres
    torc_quality: float        # |sin θ| exactly at impact
    impact_theta_deg: float    # θ at impact in degrees  (90° = ideal TORC)
    flight_time: float         # Total simulated flight time  (s)
    peak_torc: float           # Maximum |sin θ| reached during flight
    quiet_phase_end_t: float   # Time when correction input first became nonzero
    states: List[SimState] = field(default_factory=list)

    # Impact position (screen pixels relative to target)
    impact_x_px: float = 0.0
    impact_y_px: float = 0.0


# ---------------------------------------------------------------------------
#  Simulator
# ---------------------------------------------------------------------------

class MK8Sim:
    """
    Forward simulator for the MK8 ATGM under SACLOS guidance.

    All physics constants are hard-coded from game files; the two
    calibration parameters (pix_per_m, k_angular) are estimated by
    calibrator.py from the existing human hit dataset.

    Parameters
    ----------
    pix_per_m    : Screen pixels per world-metre at the target plane.
                   Determines how a pixel displacement maps to angular error.
    k_angular    : SACLOS guidance proportionality constant.
                   Units: (rad/s) / (rad · m) = 1/(m·s)
    v_init       : Missile speed at simulation start (key-release), m/s.
                   Assumes the missile has already been boosted for ~0.5 s.
    z0           : Muzzle-to-missile distance at key-release (m).
                   Sets initial SACLOS authority multiplier.
    hit_radius_px: Miss-distance threshold for a "hit" (px).
    dt           : Integration timestep (s).  1/60 ≈ one game tick.
    ch_sign      : Sign applied to mouse dx/dy when building crosshair table.
                   +1 or -1; depends on counter-translation direction.
    """

    # ---- Confirmed MK8 constants ----------------------------------------
    V0          = 30.0
    ACCEL       = 289.86
    V_MAX       = 666.67
    TURN_RATE   = 72.0     # deg/s
    SENSITIVITY = 0.72
    # ---------------------------------------------------------------------

    def __init__(
        self,
        pix_per_m: float    = 7.0,
        k_angular: float    = 0.02,
        v_init: float       = 200.0,
        z0: float           = 60.0,
        hit_radius_px: float = 40.0,
        dt: float           = 1 / 60.0,
        ch_sign: float      = 1.0,
    ):
        self.pix_per_m      = pix_per_m
        self.k_angular      = k_angular
        self.v_init         = v_init
        self.z0             = z0
        self.hit_radius_px  = hit_radius_px
        self.dt             = dt
        self.ch_sign        = ch_sign

        self._turn_rate_rad = math.radians(self.TURN_RATE)

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def evaluate(
        self,
        disp_px: float,
        angle_rad: float,
        range_m: float,
        trajectory: List[dict],
    ) -> SimResult:
        """
        Forward-simulate the MK8 given an initial engagement state and a
        correction trajectory, returning the full state history.

        Parameters
        ----------
        disp_px   : Distance from missile to target at key-release (px).
        angle_rad : Screen-space direction from missile to target (atan2).
        range_m   : World-space range to target in metres (OCR value).
        trajectory: Correction stroke — list of {'t': s, 'dx': px, 'dy': px}.
                    t is seconds since key-release; dx/dy are mouse delta events.

        Returns
        -------
        SimResult with full SimState history attached.
        """
        PPM = self.pix_per_m

        # ---- Initial missile position in world metres (lateral) ----------
        # angle_rad points FROM missile TO target, so missile is in the
        # opposite direction from the target.
        lat_x_m = -math.cos(angle_rad) * disp_px / PPM
        lat_y_m = -math.sin(angle_rad) * disp_px / PPM

        # ---- Initial velocity: missile was tracking toward target ---------
        dist3d = math.sqrt(lat_x_m**2 + lat_y_m**2 + range_m**2)
        v0     = self.v_init
        vlat_x = v0 * (-lat_x_m) / dist3d
        vlat_y = v0 * (-lat_y_m) / dist3d
        vdepth = v0 * range_m    / dist3d

        # ---- State scalars -----------------------------------------------
        lat_x  = lat_x_m
        lat_y  = lat_y_m
        depth  = 0.0          # metres traveled toward target since key-release
        speed  = v0
        t_sim  = 0.0

        # ---- Build crosshair interpolation table -------------------------
        ch_table = self._build_crosshair_table(trajectory)

        # Detect end of quiet phase (first tick with nonzero crosshair input)
        quiet_phase_end_t = trajectory[-1]['t'] if trajectory else 0.0
        for pt in trajectory:
            if abs(pt['dx']) > 0.5 or abs(pt['dy']) > 0.5:
                quiet_phase_end_t = pt['t']
                break

        # ---- Integration -------------------------------------------------
        states: List[SimState] = []
        peak_torc  = 0.0
        max_time   = 3.0 * range_m / (v0 * 0.5) + 10.0  # generous timeout

        while depth < range_m and t_sim < max_time:
            # Crosshair position (screen pixels)
            ch_x_px, ch_y_px = self._interp_crosshair(ch_table, t_sim)
            ch_x_m  = ch_x_px / PPM
            ch_y_m  = ch_y_px / PPM

            # Remaining range
            range_rem = max(range_m - depth, 0.01)

            # Angular error (radians) in each lateral axis
            # SACLOS sees angular offset between missile and crosshair direction
            err_x = (ch_x_m - lat_x) / range_rem
            err_y = (ch_y_m - lat_y) / range_rem
            err_total = math.sqrt(err_x**2 + err_y**2)

            # SACLOS commanded angular rate (rad/s)
            z_from_muzzle = self.z0 + depth
            cmd_rate      = self.k_angular * err_total * z_from_muzzle
            eff_cap       = self._turn_rate_rad * self.SENSITIVITY
            cmd_rate      = min(cmd_rate, eff_cap)

            # Lateral acceleration perpendicular to depth axis (toward crosshair)
            if err_total > 1e-9:
                nx, ny = err_x / err_total, err_y / err_total
            else:
                nx, ny = 0.0, 0.0

            vlat_x += cmd_rate * speed * nx * self.dt
            vlat_y += cmd_rate * speed * ny * self.dt

            # Speed update
            speed   = min(speed + self.ACCEL * self.dt, self.V_MAX)

            # Depth velocity (conserve total speed)
            vlat_sq  = vlat_x**2 + vlat_y**2
            vdepth   = math.sqrt(max(speed**2 - vlat_sq, 1e-4))

            # Position update
            lat_x  += vlat_x * self.dt
            lat_y  += vlat_y * self.dt
            depth  += vdepth * self.dt
            t_sim  += self.dt

            # ---- Derived quantities for visualization --------------------
            range_rem2 = max(range_m - depth, 0.01)

            # θ: angle between velocity vector and radial toward target
            rad_len = math.sqrt(lat_x**2 + lat_y**2 + range_rem2**2)
            if rad_len > 1e-9:
                # Dot product of unit-velocity and unit-radial
                dot = (
                    (-lat_x) * vlat_x
                    + (-lat_y) * vlat_y
                    + range_rem2 * vdepth
                ) / (speed * rad_len)
                dot   = max(-1.0, min(1.0, dot))
                theta = math.acos(dot)
            else:
                theta = math.pi / 2.0

            torc_q = abs(math.sin(theta))
            if torc_q > peak_torc:
                peak_torc = torc_q

            turn_auth = self.TURN_RATE * self.SENSITIVITY * (speed / self.V_MAX)

            states.append(SimState(
                t               = round(t_sim, 4),
                lat_x_m         = lat_x,
                lat_y_m         = lat_y,
                lat_x_px        = lat_x * PPM,
                lat_y_px        = lat_y * PPM,
                vlat_x          = vlat_x,
                vlat_y          = vlat_y,
                vdepth          = vdepth,
                speed           = speed,
                z_from_muzzle   = z_from_muzzle,
                range_remaining = range_rem2,
                theta           = theta,
                torc_q          = torc_q,
                turn_authority  = turn_auth,
                err_total_rad   = err_total,
                ch_x_px         = ch_x_px,
                ch_y_px         = ch_y_px,
            ))

        # ---- Impact result -----------------------------------------------
        miss_m  = math.sqrt(lat_x**2 + lat_y**2)
        miss_px = miss_m * PPM

        last = states[-1] if states else None
        theta_impact = last.theta if last else 0.0
        torc_impact  = abs(math.sin(theta_impact))

        return SimResult(
            hit               = miss_px < self.hit_radius_px,
            miss_dist_px      = miss_px,
            miss_dist_m       = miss_m,
            torc_quality      = torc_impact,
            impact_theta_deg  = math.degrees(theta_impact),
            flight_time       = t_sim,
            peak_torc         = peak_torc,
            quiet_phase_end_t = quiet_phase_end_t,
            impact_x_px       = lat_x * PPM,
            impact_y_px       = lat_y * PPM,
            states            = states,
        )

    # ------------------------------------------------------------------
    #  Static physics utilities  (used by other sim modules)
    # ------------------------------------------------------------------

    @staticmethod
    def compute_quiet_phase(
        range_m: float,
        authority_threshold_degs: float = 10.0,
        v0: float = 30.0,
        accel: float = 289.86,
        v_max: float = 666.67,
        turn_rate: float = 72.0,
        sensitivity: float = 0.72,
    ) -> float:
        """
        Time (s) until effective turn authority exceeds a threshold.

        authority(t) = turn_rate * sensitivity * v(t)/v_max
        We solve for v(t) >= v_max * (threshold / (turn_rate * sensitivity))

        This is the physics-motivated quiet-phase duration used as the 5th
        KNN feature in CorrectionLearner.
        """
        eff_full = turn_rate * sensitivity          # max possible authority
        v_needed = v_max * (authority_threshold_degs / eff_full)
        if v_needed <= v0:
            return 0.0
        return (v_needed - v0) / accel

    @staticmethod
    def estimate_pix_per_m(
        range_m: float,
        screen_width: int = 1920,
        fov_h_deg: float = 70.0,
    ) -> float:
        """
        Physics estimate for pix_per_m from game FOV + screen resolution.
        Used as a default when calibrator.py hasn't run yet.
        """
        fov_rad = math.radians(fov_h_deg)
        meters_wide = 2.0 * range_m * math.tan(fov_rad / 2.0)
        return screen_width / meters_wide

    # ------------------------------------------------------------------
    #  Internal helpers
    # ------------------------------------------------------------------

    def _build_crosshair_table(
        self, trajectory: List[dict]
    ) -> List[Tuple[float, float, float]]:
        """
        Accumulate trajectory deltas into a (t, ch_x, ch_y) table.
        ch_sign flips the direction if counter-translation sign is wrong.
        """
        table = [(0.0, 0.0, 0.0)]
        cx, cy = 0.0, 0.0
        for pt in trajectory:
            cx += self.ch_sign * float(pt['dx'])
            cy += self.ch_sign * float(pt['dy'])
            table.append((float(pt['t']), cx, cy))
        return table

    @staticmethod
    def _interp_crosshair(
        table: List[Tuple[float, float, float]], t: float
    ) -> Tuple[float, float]:
        """Linear interpolation of crosshair position from the time table."""
        if not table:
            return 0.0, 0.0
        if t <= table[0][0]:
            return table[0][1], table[0][2]
        if t >= table[-1][0]:
            return table[-1][1], table[-1][2]
        lo, hi = 0, len(table) - 1
        while lo + 1 < hi:
            mid = (lo + hi) // 2
            if table[mid][0] <= t:
                lo = mid
            else:
                hi = mid
        t0, x0, y0 = table[lo]
        t1, x1, y1 = table[hi]
        a = (t - t0) / (t1 - t0 + 1e-12)
        return x0 + a * (x1 - x0), y0 + a * (y1 - y0)


# ---------------------------------------------------------------------------
#  Trajectory generation utilities (used by visualizer + optimizer)
# ---------------------------------------------------------------------------

def generate_trajectory(
    disp_px: float,
    angle_rad: float,
    quiet_t: float   = 0.30,
    sweep_mag: float = 1.20,
    sweep_peak: float = 0.35,
    sweep_sigma: float = 0.18,
    total_dur: float = 1.20,
    hz: int          = 60,
) -> List[dict]:
    """
    Generate a parameterized TORC-structured correction trajectory.

    The correction profile is a Gaussian pulse:
        ch_x(t) = sweep_dx * G(t - quiet_t)
        ch_y(t) = sweep_dy * G(t - quiet_t)

    where G(u) = exp(-((u - sweep_peak)² / (2 * sweep_sigma²)))

    dx at each tick = ch_x(t) - ch_x(t-dt)   (delta encoding)

    Parameters
    ----------
    disp_px    : Initial displacement (determines sweep scale).
    angle_rad  : Direction from missile to target — sweep is along this axis.
    quiet_t    : Quiet-phase duration (0 input) before sweep begins.
    sweep_mag  : Amplitude in units of disp_px (1.0 = exact displacement).
    sweep_peak : Time after quiet_t at which sweep peaks (s).
    sweep_sigma: Width (std-dev) of the Gaussian sweep pulse (s).
    total_dur  : Total trajectory duration (s).
    hz         : Tick rate.

    Returns
    -------
    list of {'t': float, 'dx': float, 'dy': float}
    """
    dt    = 1.0 / hz
    A     = sweep_mag * disp_px                 # amplitude (px)
    sweep_cos = math.cos(angle_rad)             # toward target X
    sweep_sin = math.sin(angle_rad)             # toward target Y

    traj    = []
    G_prev  = 0.0
    n_ticks = int(total_dur * hz) + 1

    for i in range(n_ticks):
        t = round(i * dt, 5)

        if t < quiet_t:
            G_curr = 0.0
        else:
            u      = t - quiet_t - sweep_peak
            G_curr = math.exp(-(u * u) / (2.0 * sweep_sigma ** 2))

        dG = G_curr - G_prev
        G_prev = G_curr

        traj.append({
            't':  t,
            'dx': A * sweep_cos * dG,
            'dy': A * sweep_sin * dG,
        })

    return traj
