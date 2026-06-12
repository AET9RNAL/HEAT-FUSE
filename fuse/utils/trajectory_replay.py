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

from fuse.utils.hardware_inject_router import inject_mouse_movement, inject_mouse_click, set_cursor_pos