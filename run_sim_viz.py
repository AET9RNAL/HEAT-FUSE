"""
H.E.A.T. AILOS-TORC Simulation Observatory — Entry Point.

Usage
-----
    # Default view (parametric trajectory, 120px disp, 45°, 200m range)
    python run_sim_viz.py

    # Specific engagement
    python run_sim_viz.py --disp 80 --angle -30 --range 300

    # Pre-load the nearest KNN trajectory from dataset
    python run_sim_viz.py --knn

    # Adjust calibration parameters
    python run_sim_viz.py --ppm 9.5 --k 0.025 --vinit 220

    # Override missile turn rate (default: 72 deg/s, confirmed from game files)
    python run_sim_viz.py --disp 150 --range 180 --quiet 0.4

Controls (interactive window)
------------------------------
    Sliders  : Disp, Angle, Range, Quiet-T, Sweep-Mag, px/m
    [Simulate]: Re-run sim with current slider values
    [Animate] : Animated replay of missile flight
    [Load KNN]: Replace parametric trajectory with KNN prediction from dataset
    [Export]  : Write current sim hit to saclos_ml_data.json as synthetic sample
"""

import argparse
import sys
import os

# ---- Ensure project root is importable ----------------------------------
ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def main():
    parser = argparse.ArgumentParser(
        description='H.E.A.T. AILOS-TORC Simulation Observatory',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Engagement parameters
    parser.add_argument('--disp',   type=float, default=120.0,
                        help='Initial displacement (px)  [default: 120]')
    parser.add_argument('--angle',  type=float, default=45.0,
                        help='Direction to target (degrees) [default: 45]')
    parser.add_argument('--range',  type=float, default=200.0,
                        help='Range to target (m)  [default: 200]')

    # Trajectory parameters
    parser.add_argument('--quiet',  type=float, default=0.30,
                        help='Quiet phase duration (s)  [default: 0.30]')
    parser.add_argument('--sweep',  type=float, default=1.20,
                        help='Sweep magnitude (× disp)  [default: 1.20]')

    # Simulation calibration
    parser.add_argument('--ppm',    type=float, default=7.0,
                        help='Pixels per metre at target plane  [default: 7.0]')
    parser.add_argument('--k',      type=float, default=0.02,
                        help='SACLOS k_angular gain  [default: 0.02]')
    parser.add_argument('--vinit',  type=float, default=200.0,
                        help='Missile speed at key-release (m/s)  [default: 200]')
    parser.add_argument('--z0',     type=float, default=60.0,
                        help='Range already traveled at key-release (m)  [default: 60]')
    parser.add_argument('--hit-r',  type=float, default=40.0,
                        help='Hit radius in screen pixels  [default: 40]')

    # Mode
    parser.add_argument('--knn',    action='store_true',
                        help='Pre-load nearest KNN trajectory from dataset')
    parser.add_argument('--data',   type=str, default='saclos_ml_data.json',
                        help='Path to ML data file  [default: saclos_ml_data.json]')

    args = parser.parse_args()

    # ---- Dependency check -------------------------------------------
    try:
        import matplotlib
    except ImportError:
        print(
            '[run_sim_viz] matplotlib is required but not installed.\n'
            '  Install with:  pip install matplotlib\n'
        )
        sys.exit(1)

    try:
        import numpy  # noqa: F401
    except ImportError:
        print('[run_sim_viz] numpy is required. Install with:  pip install numpy')
        sys.exit(1)

    # ---- Build sim --------------------------------------------------
    from sim.missile_sim import MK8Sim
    sim = MK8Sim(
        pix_per_m    = args.ppm,
        k_angular    = args.k,
        v_init       = args.vinit,
        z0           = args.z0,
        hit_radius_px= args.hit_r,
    )

    # ---- Launch Observatory -----------------------------------------
    from sim.visualizer import SimObservatory

    obs = SimObservatory(data_file=args.data, sim=sim)

    # Override initial slider values with CLI args
    obs._disp_px   = args.disp
    obs._angle_deg = args.angle
    obs._range_m   = args.range
    obs._quiet_t   = args.quiet
    obs._sweep_mag = args.sweep
    obs._pix_per_m = args.ppm
    obs.sl_disp.set_val(args.disp)
    obs.sl_angle.set_val(args.angle)
    obs.sl_range.set_val(args.range)
    obs.sl_quiet.set_val(args.quiet)
    obs.sl_sweep.set_val(args.sweep)
    obs.sl_ppm.set_val(args.ppm)

    if args.knn:
        obs._on_load_knn()
    else:
        obs._on_simulate()

    print('\n=== H.E.A.T. AILOS-TORC Observatory ===')
    print(f'  Disp  : {args.disp:.0f} px   Angle: {args.angle:.0f} deg   Range: {args.range:.0f} m')
    print(f'  px/m  : {args.ppm:.1f}      k_ang: {args.k:.3f}    v_init: {args.vinit:.0f} m/s')
    if obs._result:
        r = obs._result
        tag = 'HIT' if r.hit else 'MISS'
        print(f'  Result: {tag}   '
              f'Miss: {r.miss_dist_px:.1f}px   TORC Q: {r.torc_quality:.3f}')
    print()
    print('  Sliders update simulation in real time.')
    print('  [Animate] shows missile flight. [Load KNN] loads nearest dataset trajectory.')
    print('  [Export] writes a hit to the dataset as a synthetic sample.')
    print()

    obs.show()


if __name__ == '__main__':
    main()
