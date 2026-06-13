"""
TORC Quality Estimator — measures tangential orthogonal response quality.

Q = |sin(theta)| where theta is the angle between the terminal velocity
vector and the radial vector to the target.
  - Q = 1.0 → perfect 90° tangential impact (ideal TORC)
  - Q = 0.0 → perfectly radial approach (zero TORC)
"""

import math


def estimate_torc_quality(trajectory, angle_rad, n_terminal=5):
    """
    Estimate TORC quality from a trajectory and the engagement angle.

    Parameters
    ----------
    trajectory : list of {'t': float, 'dx': float/int, 'dy': float/int}
    angle_rad  : float — radial direction from launch point to target
    n_terminal : int   — number of trailing points to average for terminal vector

    Returns
    -------
    float in [0, 1]  — TORC quality score
    """
    if not trajectory or len(trajectory) < 2:
        return 0.0

    # Terminal velocity vector: average of last N trajectory deltas
    tail = trajectory[-n_terminal:]
    vx = sum(p['dx'] for p in tail) / len(tail)
    vy = sum(p['dy'] for p in tail) / len(tail)

    v_mag = math.sqrt(vx * vx + vy * vy)
    if v_mag < 1e-9:
        return 0.0

    # Radial unit vector (direction from launch toward target)
    rx = math.cos(angle_rad)
    ry = math.sin(angle_rad)

    # sin(theta) = |cross product| / (|v| * |r|)  — |r| = 1
    cross = vx * ry - vy * rx
    sin_theta = abs(cross) / v_mag

    return min(1.0, sin_theta)


def batch_compute_quality(samples, n_terminal=5):
    """
    Retroactively compute TORC quality for a list of samples.

    Parameters
    ----------
    samples : list of dicts with 'traj' and 'angle' fields

    Returns
    -------
    list of float — quality scores, one per sample
    """
    results = []
    for s in samples:
        traj = s.get('traj')
        angle = s.get('angle', 0.0)
        if traj:
            results.append(estimate_torc_quality(traj, angle, n_terminal))
        else:
            results.append(0.0)
    return results
