# Adaptive AILOS-TORC: Moving Target Tracking & Lead Prediction

Extends the current fixed-origin AILOS-TORC into a fully adaptive guidance system that tracks target screen-space motion and leads the missile correction to a predicted future intercept point.

---

## Problem Definition

**Current assumption:** `origin_x / origin_y` is a static calibrated pixel — the target never moves.

**What breaks with a moving target:** The displacement vector `v` (overlay center → origin) is computed once at key-release against a stale position. If the target has drifted, the correction aims at where the target *was*, not where it *will be* when the missile arrives.

---

## Feasibility

**High feasibility.** No game API is needed. Everything operates from screen-capture only — the same channel already used by the OCR rangefinder (`mss` + numpy). The two sub-problems map cleanly to available open-source tooling:

| Sub-problem | Approach | Complexity |
|---|---|---|
| Target screen-tracking | OpenCV CSRT tracker on `mss` capture | Low |
| Lead prediction | Velocity × time-of-flight offset | Low |
| Dynamic origin | Replace static `origin_x/y` with tracker output | Trivial |
| ML feature extension | Add vel vector to KNN feature set | Low |

The only genuine risk is tracker robustness: small targets at distance (few pixels), terrain occlusion, and multiple vehicles on screen can confuse visual trackers.

---

## Requirements

### New Dependencies
- `opencv-contrib-python` — CSRT tracker (best balance of speed/accuracy)
  - Fallback: `opencv-python` with KCF (faster, less accurate)
- `mss` — already present for OCR
- `numpy` — already present
- Optional: `filterpy` for Kalman filter, or use a simple EMA (built-in)

### Data Requirements for Adaptive ML
- Current minimum: 3 hit samples (stationary)
- Adaptive minimum: **~15 hit samples** across varied `(disp, range, angle, target_vel)`
- Full coverage (confident across velocity space): **~50 samples**
- Same manual HIT/MISS labeling workflow; `target_vel_x/y` is auto-recorded at fire time

---

## Addressing Key Concerns

### Q1: CSRT — Is it tracking within a bounding box around `hud_designator_predict`?

**Partly — but critically, NOT the moving one.**

`_position_designators()` places `hud_designator_predict_win` at the **current overlay center** (`win_x + img_w/2, win_y + img_h/2`). During tracking, the overlay counter-translates with mouse movement, so this window follows the **missile's LOS**, not the target. Using this as the CSRT seed would track the missile, not the enemy.

The correct CSRT seed is `origin_x / origin_y` — the calibrated target screen position. That point is where the target was when you locked the system. The tracker is seeded there when entering `predict` state and follows the target as it drifts.

**ROI sizing:** The `designatorPredict.png` window is a ~30px crosshair UI element. The CSRT tracker needs a larger capture context — a **96×96 or 128×128px region** centered on `origin_x/origin_y` gives the tracker enough texture to track reliably while staying small. The 30px crosshair is the *display* widget; the tracker input is a separate (larger) screen grab.

**Designator follows the tracker:** In adaptive mode, `_position_designators()` is updated to use `effective_origin_x/y` (tracker output) instead of `win_x + img_w/2`, so the `hud_designator_predict` visually anchors on the tracked target, not the missile.

---

### Q2: Does adaptive enhancement preserve the TORC condition?

**Yes — the TORC condition is fully preserved, and existing training data is 100% compatible.**

TORC — *Tangential Orthogonal Response Control* — requires that the missile's velocity vector approaches perpendicular to the radial vector `SO` (origin to missile), producing θ→90° terminal impact angle. This property lives entirely in the relationship between the displacement vector `(d, n)` and the replay trajectory. The control law doesn't care about absolute screen coordinates; it cares about the *geometry* of the correction.

**Why it transfers to a moving target:**

The KNN lookup finds the trajectory for inputs `(d, n, r)`. That trajectory was recorded by a human who guided the missile to a TORC-compliant intercept of a stationary `origin`. In adaptive mode, `(d, n)` is computed from `overlay_center` to `predicted_target_pos`. The spatial geometry is identical — same displacement magnitude, same approach angle — so the replayed trajectory produces TORC-compliant approach to `predicted_target_pos`.

The TORC property is not anchored to any absolute screen point. It is anchored to **whichever point the displacement vector points at**. Shift that point to the predicted future target position and TORC is preserved at that point.

**The one honest caveat:** If the lead prediction is wrong (target accelerates or turns), the missile arrives at the predicted point but the real target has moved. In that case the approach is TORC-compliant to the *predicted* intercept point, not the *actual* target. This is a prediction error, not a TORC violation. The control law itself remains correct; prediction accuracy is the limiting factor.

**Existing dataset:** Every current HIT sample encodes a TORC-satisfying trajectory. These samples are fully usable in adaptive mode because the feature vector `(d, n, r)` is simply recomputed against the new effective origin. No re-labeling or re-recording is required for stationary-target engagements.

---

## Target Mode & Correction Mode Matrix

Two orthogonal choices exposed to the user:

| | **Static target** | **Dynamic target** |
|---|---|---|
| **TORC correction** | Current behavior (unchanged) | Prediction-at-fire → KNN → discrete replay |
| **Smooth correction** | N/A (static targets don't drift) | Continuous proportional tracker nudge |

CLI / HUD toggle:
```
Target mode:     [S]tatic  /  [D]ynamic       (Ctrl+D)
Correction mode: [T]ORC    /  [M]ooth         (Ctrl+M, only active in Dynamic)
```

### k=1 scope — Static vs Adaptive

k=1 is **mandatory only in adaptive mode** to preserve impulsive TORC strokes. In static mode, k-blending remains the default (it improves interpolation for the fixed-origin case). However, `static_nn_k` is now a configurable hyperparameter:

| Mode | k behaviour | Config key |
|---|---|---|
| Static | configurable, default 3 | `static_nn_k` |
| Dynamic/TORC | hard k=1, not overridable | — |
| Dynamic/Smooth | k irrelevant (no KNN) | — |

### Dynamic/TORC mode
- Prediction-at-fire-time → KNN → discrete trajectory replay (as described throughout this plan)
- **Emergency trajectory injection** (not abort): if `vel_dir_change > 45°` mid-playback, the monitor thread does **not** stop the correction thread. Instead:
  1. Monitor computes new KNN query using `(current_cursor_pos → new_predicted_pos)` as geometry
  2. New trajectory placed into `_pending_trajectory` shared slot (thread-safe)
  3. Running correction thread checks `_pending_trajectory` at each inner-loop step
  4. On detection: swaps to new trajectory at current cursor position, resets timing, continues
  - No mouse movement gap — cursor continues moving through the transition
  - The new trajectory origin is the cursor's actual position at swap time, so displacement is well-defined
  - **This is uncharted territory.** The missile has momentum from the partial first stroke; no training data models this transition. Empirical testing required.

### OCR Range Spike Filtering — Consumer-side, Tracking-active Only

**`utils/ocr_reader.py` is not modified.** The gate must not live in the OCR reader because a user aiming at a new target at a completely different range would produce a legitimate large jump — the reader has no way to distinguish that from an artifact.

The gate is valid only when **locked onto a specific target** (designation active + correction running). In that state, the tracked target's range can only change slowly (ground vehicle at ~5–20 m/s). A `TrackedRangeGate` is a small stateful object instantiated by the tracking subsystem:

```python
class TrackedRangeGate:
    def __init__(self, max_rate_m_s):
        self._last = None
        self._last_t = None
        self._max_rate = max_rate_m_s

    def feed(self, raw, now):
        if raw is None:
            return self._last
        if self._last is not None and self._last_t is not None:
            dt = now - self._last_t
            if dt > 0 and abs(raw - self._last) / dt > self._max_rate:
                return self._last  # reject, hold
        self._last = raw
        self._last_t = now
        return raw

    def reset(self):
        self._last = None; self._last_t = None
```

**Lifecycle:** `reset()` on designation start (anchors to first valid read), `feed()` on every OCR tick during active tracking/correction, `reset()` again on tracking stop.

- `utils/ocr_reader.py` unchanged
- Config: `ocr_range_max_rate_m_s` (default: 25, range 10–115), persisted in `saclos_config.json`
- Applies to both TORC and Smooth modes during active tracking only
- Transparent to all other callers (static mode, training, predictor) — they read OCR directly

### Dynamic/Smooth mode
- No KNN, no discrete trajectory, no TORC geometry guarantee
- A correction thread runs at ~50ms intervals while the missile is in flight
- Each tick:
  ```
  t_remaining = range_current / missile_avg_velocity(range_current)   # OCR range is live
  predicted_pos = tracker_pos + vel × t_remaining
  delta = predicted_pos - overlay_center
  mouse_move = clamp(gain × delta, max_smooth_velocity_px_s)
  ```
- Using `t_remaining` (not fixed `t_flight`) is critical: as the missile closes, the lead offset shrinks toward zero and `predicted_pos` **converges onto the actual target position at impact**. This self-corrects for lead estimation errors accumulated during flight — even if the target changed direction mid-flight, the terminal geometry converges to the real target regardless of how accurate the earlier lead was.
- Practically: accumulated tracking error concentrates into a larger `delta` spike near impact, which the P-controller resolves as a sharp final correction → higher hit probability than aiming at static `tracker_pos`
- `range_current` is already read by the OCR continuously, no new instrumentation needed
- Configurable: `smooth_correction_gain` (0.1–1.0), `smooth_max_vel_px_s`
- More robust to target direction changes — no abort needed, the controller naturally repoints as `predicted_pos` evolves
- Tradeoff: no TORC arc; terminal approach angle is uncontrolled

### Why offer both
TORC mode may produce superior terminal geometry on well-conditioned engagements (range ≥150m, target velocity stable). Smooth mode may outperform TORC on short-range or erratic-target engagements where the abort-replay transition is unpredictable. The user is the most reliable judge of which performs better in practice. Both modes share the same tracker infrastructure; the only difference is what happens after `predicted_pos` is computed at fire time.

---

## Architecture

### 1. Target Designation UI
**Trigger:** Right-click on the overlay while in `locked` state (before tracking begins).

- Captures a ~64×64px thumbnail of the screen region under the cursor as the tracker template
- Stores designation screen-coordinates `(designate_x, designate_y)`
- HUD indicator shows "TARGET DESIGNATED" vs "NO TARGET"
- Reset on `Ctrl+L` toggle or explicit right-click elsewhere

### 2. `utils/target_tracker.py` — Screen Tracker Module
Background thread (daemon, ~30 fps):

```
mss grab (target_roi) → OpenCV CSRT.update() → (cx, cy, confidence)
```

Public interface:
- `TargetTracker.start(screen_x, screen_y, template_img)` — initializes tracker
- `TargetTracker.get_position()` → `(x, y, confidence, vel_px_s_x, vel_px_s_y)`
- `TargetTracker.stop()`

Velocity estimation: rolling 5-frame window of `(t, x, y)` → linear regression slope → `vel_x_px_s`, `vel_y_px_s`. EMA-smoothed with α=0.4.

Confidence fallback: if `confidence < 0.4`, hold last known position and flag as "lost". If lost for >2s, clear designation.

### 3. Adaptive Mode Tracking Lifecycle

```
[PRE-FIRE]
Tracker thread running continuously @ ~30fps
  → updates (tracker_x, tracker_y, vel_x, vel_y) via rolling 5-frame EMA
  → hud_designator_predict_win follows tracker_x/y on screen
  → no correction geometry committed yet

[FIRE TIME — key-release]
Snapshot: predicted_pos = tracker_pos + vel × t_flight
Compute (disp, angle) from overlay_center → predicted_pos
KNN query with (disp/300, range/500, sin(angle), cos(angle)), k=1
→ trajectory locked; correction thread starts

[DURING PLAYBACK]
Tracker thread continues running (geometry is NOT re-computed mid-stroke)
Playback monitor polls tracker at ~10fps:
  if vel_dir_change > 45°:
    abort correction thread
    re-enter FIRE TIME with fresh tracker snapshot → new KNN query
    start new correction thread (emergency recalculation)
  else:
    playback continues uninterrupted

[AFTER PLAYBACK]
Tracker continues running
If a second shot is fired, re-enters FIRE TIME with latest tracker state
Tracker stops on Ctrl+L or on confidence < threshold for >2s
```

**Key distinction:** this is *prediction-at-fire-time embedded in query* — not continuous real-time mouse adjustment. The trajectory is played back verbatim (scaled + rotated). Smooth in-flight adjustment would destroy the TORC stroke shape. Emergency recalculation is a discrete abort-and-restart event, not interpolation.

---

### 4. Dynamic Origin in `BaseSACLOSOverlay`
`origin_x/origin_y` remains the calibration anchor for the stationary case. A new pair `effective_origin_x/y` is introduced:
- If no tracker active: `effective_origin = origin` (current behavior unchanged)
- If tracker active: `effective_origin = tracker.get_position()[:2]`
- All displacement computations (`_stop_tracking`, training capture) use `effective_origin`

### 5. Lead Prediction
Computed at fire time (key-release moment), before the correction vector is generated:

```python
t_flight = target_range_m / missile_avg_velocity(target_range_m)
# missile_avg_velocity uses existing physics: v0=14.7, a=307.2
predicted_x = tracker_x + vel_x * t_flight
predicted_y = tracker_y + vel_y * t_flight
```

`predicted_x/y` replaces `effective_origin_x/y` as the correction target point.

### 6. ML Usage in Adaptive Mode — No Feature Extension Required

Velocity is **not** a KNN feature. It is used exclusively at query time to compute the lead point. Once `predicted_pos` is known, the query collapses back to the standard 4-dim vector:

```python
(disp_to_lead / 300, range / 500, sin(angle_to_lead), cos(angle_to_lead))
```

This means:
- **No schema changes** to `saclos_ml_data.json`
- **No changes to `CorrectionLearner`** except enforcing k=1 for adaptive queries
- **All existing hit samples are immediately usable** in adaptive mode — zero re-recording required
- Velocity is computed and discarded after lead point offset is applied

The range + effective displacement together determine `t_actuation` selection (the core timing insight). Range takes precedence: shorter range → less quiet phase, sweep sooner; longer range → more quiet phase allowed, better TORC arc achievable. Velocity shifts the displacement target but does not change this relationship.

---

## Implementation Plan

### Phase 1 — Target Designation + Screen Tracker
1. Create `utils/target_tracker.py` with CSRT tracker + velocity estimator
2. Add right-click designation gesture to `BaseSACLOSOverlay`
3. Add `effective_origin` logic replacing raw `origin_x/y` in displacement calc
4. Add HUD indicator for tracker state (designated / tracking / lost)

### Phase 2 — Lead Prediction
5. Add `missile_avg_velocity(range_m)` helper (uses existing physics constants)
6. Integrate lead-offset into `_stop_tracking` displacement calculation
7. `AutoOverlay._start_auto_correction` receives `predicted_origin` instead of static origin

### Phase 3 — Adaptive Query + Emergency Recalculation
8. In `AutoOverlay._start_auto_correction`: if adaptive mode, compute `predicted_pos` before calling `learner.predict`; pass `(disp_to_lead, angle_to_lead, range)` unchanged
9. Force `k=1` in `CorrectionLearner.predict` when called from adaptive context (pass `adaptive=True` flag → skip blend/nudge/exploration)
10. Add mid-execution abort path: if tracker detects velocity direction change >45° during correction thread execution, abort thread and re-query with updated `predicted_pos` → this handles emergency overcompensation/smoothing scenarios

### Phase 4 — Config & Flags
11. Add `--adaptive` CLI flag (enables tracker subsystem)
12. Persist `adaptive_enabled`, `tracker_confidence_threshold` in `saclos_config.json`

---

## TORC Stroke Preservation — Critical Design Requirement

### The Blending Problem

The existing `CorrectionLearner.predict` does three things that are **destructive to impulsive TORC strokes**:

1. **k-weighted temporal average (lines 179–190):** Each sample is transformed (scaled + rotated) and its `dx/dy` values are averaged point-by-point onto the nearest neighbor's timing skeleton. If two sharp strokes peaked at different time indices, their energy lands on mismatched slots → the impulse spreads across time → sharpness is lost.

2. **Miss nudge (lines 220–223):** Adds a correction vector distributed **uniformly across all trajectory points**. Even a small nudge dilutes the peak by adding constant offsets everywhere.

3. **Exploration fallback (lines 271–277):** Same problem — uniform random perturbation spread across all points.

A sharp TORC stroke looks like `[{t:0, dx:0}, {t:50, dx:48}, {t:100, dx:0}]`. After blending even two similar-but-offset strokes, the peak shrinks and widens — the missile no longer receives the impulsive angular correction needed to establish the asymptotic approach angle. Once that window is missed, no downstream correction can recover the 90° terminal angle.

### Physical TORC Model (Corrected Definition)

TORC is **not** a hard 90° constraint. It is a rate law:

```
θ̇ = k(r) · sin(90° - θ)
```

The system drives the approach angle *toward* 90° asymptotically, subject to the missile's actual turn capability. Enforcing θ=90° exactly would require instantaneous velocity vector rotation — infinite lateral force, zero turn radius, impossible in-game.

In practice TORC is realised as a curved arc:
- **Short arc (green):** missile sweeps immediately after fire, limited angle achieved before impact
- **Long arc (red):** more flight distance available, better asymptotic angle achieved
- **Moving target (black):** missile flies straight along initial LOS (zero correction, quiet period), then a single sharp sweep toward the predicted lead point. The straight phase is deliberate — it allows range to close and geometry to evolve so the subsequent sharp sweep produces a well-conditioned TORC arc to the lead point. Sweeping immediately would produce a shallow arc that misses the required geometry entirely.

### `t_actuation` — Timing is as Critical as Direction

The **actuation point** is when the mouse sweep begins relative to fire time. It is:
- Implicit in the trajectory timestamps (the `t` field of each `{t, dx, dy}` point)
- **NOT the same as fire time** for adaptive/moving-target shots
- Correlated with `range`: longer range → more wait before sweep; shorter range → sweep sooner
- Possibly also correlated with `vel_mag`: fast-moving target may require a different delay to allow geometry to develop

`_transform_traj` preserves all `t` values unchanged. With k=1, the exact actuation timing from the recorded trajectory is replayed faithfully. This is the second reason k=1 is mandatory for adaptive mode: blending k>1 trajectories with different `t_actuation` offsets would smear the quiet phase into low-amplitude drift and destroy the setup geometry.

---

### The Solution: `k=1` with Shape-Preserving Scaling for Adaptive Mode

For adaptive trajectories, use **k=1 nearest neighbor** — no blending, no nudge, no exploration fallback:

```python
if adaptive_mode:
    best_idx = hit_dists[0][1]
    trajectory = self._transform_traj(hits[best_idx], displacement_px, angle_rad)
    return trajectory, confidence
    # No blend, no nudge, no exploration
```

`_transform_traj` already handles the two safe operations:
- **Scale** — multiplies `dx/dy` uniformly by `query_disp / base_disp`. This changes magnitude but preserves the temporal distribution. Peak stays at the same index, peak amplitude scales proportionally. Sharpness intact.
- **Rotate** — rotates all `dx/dy` by `query_angle - sample_angle`. Pure direction change. Sharpness intact.

Neither operation smooths the trajectory. The impulsive profile is exactly preserved.

Because velocity is pre-consumed by the lead-point computation, the KNN query geometry in adaptive mode is as well-conditioned as stationary — same 4-dim feature vector, same distance metric. The nearest neighbor is selected from the existing pool with no blending.

### Adaptive Training Workflow

In adaptive mode, `TrainingOverlay` operates identically to stationary mode except:

1. Tracker is running — system computes `predicted_pos = tracker_pos + vel × t_flight` at fire time
2. `displacement` and `angle` are recorded against `predicted_pos`, not current target pos
3. Trajectory is the human sharp stroke aimed at that lead point
4. Label: HIT/MISS as before

The recorded sample schema is **unchanged**:
```json
{ "disp": 87.4, "angle": -0.31, "range": 220, "traj": [...], "hit": true }
```

The `disp`/`angle` values already encode the lead point geometry — velocity is baked into the displacement at record time. No velocity fields are stored. The KNN finds the right neighbor because range + lead-displacement are sufficient.

**Emergency recalculation mid-stroke:** If the tracker detects a velocity direction change >45° while the correction thread is executing, the thread is aborted and the correction re-triggers with an updated `predicted_pos`. This matches the human behavior you described (sharp overcompensation or smoothing out when target direction changes) — the system mimics it by replaying the nearest-neighbor trajectory for the new geometry.

**Minimum adaptive samples before ML engages:** 5 (k=1 needs one good match per scenario bucket, not a blending pool).

---

## ML & Training Overhead Summary

| Dimension | Current (Stationary) | Adaptive |
|---|---|---|
| KNN feature dims | 4 | 4 (unchanged) |
| Minimum hit samples | 3 | 5 (k=1, no blending pool needed) |
| Full-coverage samples | ~20 | ~20 (existing data reused) |
| Inference latency | <1ms | <1ms |
| Model size (RAM) | ~KB per sample | +24 bytes/sample |
| Training sessions | ~5-10 guided runs | ~15-25 guided runs |
| Screen capture overhead | OCR only (~15ms/frame) | +tracker ~15ms/frame @ 30fps |
| CPU overhead (tracker) | None | ~5-8% single core (CSRT) |

The ML model itself does **not change in kind** — KNN is still the right tool. The main cost is human training time: you need to record ~50 samples covering `(stationary, slow-cross, fast-cross, closing, retreating)` target motions across the range envelope.

No offline training pipeline is needed. The existing online HIT/MISS labeling loop handles it.

---

## Known Constraints & Mitigations

- **Small targets at range:** CSRT needs a reasonable ROI size. At 500m a tank can be 4×4px — template matching will fail. Mitigation: require designation only when target is ≥20×20px; warn user otherwise.
- **Occlusion:** Tracker holds last known velocity on confidence drop. Lead prediction uses extrapolated position. Acceptable for typical engagement durations (<3s occlusion).
- **Multiple vehicles:** Designation is manual (right-click), so user selects the intended target. No disambiguation needed.
- **World velocity ≠ Screen velocity:** Screen-space velocity is what matters for overlay compensation; no coordinate transform needed since the correction is also applied in screen space.
- **Target velocity during missile flight:** Assumes constant velocity over `t_flight`. For typical engagement ranges (70-350m, flight time 0.1-0.5s) this is accurate enough. Acceleration modeling is out of scope.
