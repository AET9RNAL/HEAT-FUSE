"""
Shared trajectory replay engine.

Provides reusable functions for replaying mouse trajectories with precise
timing, pre-fire aiming phases, countdowns, and cursor teleportation.

Used by:
  - predictor/auto_overlay.py (QL replay, ML trajectory execution)
  - trainer/training_ql.py    (training-mode QL replay)
  - refiner/trajectory_editor.py (editor replay)
"""

import time
from loguru import logger

from utils.hardware_inject import inject_mouse_movement, inject_mouse_click, set_cursor_pos


def replay_movements(trajectory, abort_event=None):
    """
    Replay a list of timestamped mouse deltas with precise timing.

    Parameters
    ----------
    trajectory : list[dict]
        Each entry: {'t': float, 'dx': number, 'dy': number}
        where t is seconds since start.
    abort_event : threading.Event or None
        If set, replay stops early.

    Returns
    -------
    (injected_dx, injected_dy, elapsed) : tuple
    """
    if not trajectory:
        return 0, 0, 0.0

    start_time = time.perf_counter()
    cumulative_dx = 0.0
    cumulative_dy = 0.0
    injected_dx = 0
    injected_dy = 0

    for pt in trajectory:
        if abort_event and abort_event.is_set():
            break

        target_time = start_time + pt['t']
        now = time.perf_counter()
        sleep_s = target_time - now
        if sleep_s > 0.0005:
            time.sleep(sleep_s)

        cumulative_dx += pt['dx']
        cumulative_dy += pt['dy']
        ix = int(round(cumulative_dx)) - injected_dx
        iy = int(round(cumulative_dy)) - injected_dy

        if ix != 0 or iy != 0:
            try:
                inject_mouse_movement(ix, iy)
                injected_dx += ix
                injected_dy += iy
            except Exception as e:
                logger.warning(f"Mouse injection error: {e}")
                break

    elapsed = time.perf_counter() - start_time
    return injected_dx, injected_dy, elapsed


def replay_full_scenario(
    trajectory,
    pre_trajectory=None,
    cursor_pos=None,
    abort_event=None,
    countdown_s=3,
    status_callback=None,
    fire_click=True,
):
    """
    Full scenario replay: countdown → teleport → pre-fire → click → guidance.

    Parameters
    ----------
    trajectory : list[dict]
        Post-fire guidance trajectory.
    pre_trajectory : list[dict] or None
        Pre-fire aiming trajectory (replayed before the click).
    cursor_pos : tuple(x, y) or None
        Screen position to teleport cursor before replay.
    abort_event : threading.Event or None
        If set, replay stops early.
    countdown_s : int
        Countdown seconds before replay starts.
    status_callback : callable(str) or None
        Called with status messages (e.g. "Replay in 3...", "AIMING...", etc.).
        Must be thread-safe (caller should wrap with root.after if needed).
    fire_click : bool
        Whether to inject a mouse click before the guidance trajectory.

    Returns
    -------
    (injected_dx, injected_dy, elapsed) : tuple
        Guidance trajectory injection stats. Returns (0, 0, 0.0) if aborted.
    """
    def _status(msg):
        if status_callback:
            status_callback(msg)

    # ---- Countdown ----
    for i in range(countdown_s, 0, -1):
        if abort_event and abort_event.is_set():
            return 0, 0, 0.0
        _status(f"Replay in {i}...  [Esc] abort")
        time.sleep(1.0)

    if abort_event and abort_event.is_set():
        return 0, 0, 0.0

    # ---- Teleport cursor ----
    if cursor_pos:
        set_cursor_pos(cursor_pos[0], cursor_pos[1])
        time.sleep(0.05)

    # ---- Pre-fire aiming phase ----
    if pre_trajectory:
        _status("AIMING...")
        pre_dx, pre_dy, pre_elapsed = replay_movements(pre_trajectory, abort_event)
        logger.info(f"Pre-fire aiming complete ({pre_dx}dx {pre_dy}dy)")

    if abort_event and abort_event.is_set():
        return 0, 0, 0.0

    # ---- Fire click + guidance trajectory ----
    _status("REPLAYING...")

    if fire_click:
        inject_mouse_click()

    dx, dy, elapsed = replay_movements(trajectory, abort_event)
    logger.info(f"Replay complete ({elapsed:.2f}s, {dx}dx {dy}dy)")

    return dx, dy, elapsed
