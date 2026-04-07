"""
TrainingQuickLabelMixin — Quick modify-and-replay for Training mode.

Provides the same keyboard-driven trajectory tweaking that the predictor's
online learning mode has, but applied to **recorded** trajectories instead
of ML predictions.

Flow:
    Record trajectory → Quick-label prompt → Tweak biases → Replay → Save/Discard

Reuses:
    - predictor.ql_hud.QuickLabelHudMixin  for HUD overlays
    - utils.trajectory_replay              for replay engine
    - trainer.correction_session           for bias management
"""

import copy
import threading
from loguru import logger


class TrainingQuickLabelMixin:
    """Mixin that adds quick-label modify-and-replay to TrainingOverlay.

    Expects the host class to also inherit from QuickLabelHudMixin and
    BaseSACLOSOverlay (provides self.root, self.learner, etc.).
    """

    def _init_training_ql(self):
        """Initialize training QL state. Call from __init__."""
        self._tql_active = False
        self._tql_state = None       # 'prompt' | 'hit' | 'miss' | 'rollback_select'
        self._tql_context = None     # capture dict
        self._tql_torc_quality = None
        self._tql_rollback_digits = ""
        self._tql_prev_state = None
        self._tql_replay_thread = None
        self._tql_replay_abort = threading.Event()
        self._tql_session = None     # temporary CorrectionSession for this capture

    # ----------------------------------------------------------------
    #  Entry / exit
    # ----------------------------------------------------------------

    def _tql_enter(self, capture):
        """Enter quick-label mode for a recorded training capture.

        Parameters
        ----------
        capture : dict
            Keys: displacement_px, angle_rad, range_m, trajectory,
                  pre_trajectory (optional).
        """
        from trainer.correction_session import CorrectionSession

        self._tql_active = True
        self._tql_state = 'prompt'
        self._tql_context = capture
        self._tql_torc_quality = None
        self._tql_rollback_digits = ""

        # Create a fresh temporary session (does NOT use global bias file)
        self._tql_session = CorrectionSession(bias_file=None)
        self._tql_session.get_bias(
            capture['displacement_px'],
            capture['angle_rad'],
            capture['range_m'],
        )

        # Show HUD overlays
        self._ql_show_all()
        self._ql_update_prompt(
            "[H] HIT  [M] MISS  [5] Replay  [E] Editor  [Esc] Discard"
        )
        self._ql_update_all_overlays(
            self._tql_session, capture.get('trajectory'),
            attentioner=None,
            pre_trajectory=capture.get('pre_trajectory'),
            context=capture,
        )
        logger.info("Training QL: [H]it / [M]iss / [5] Replay / [E]ditor / [Esc]")

    def _tql_exit(self):
        """Exit training quick-label mode."""
        if self._tql_replay_thread and self._tql_replay_thread.is_alive():
            self._tql_replay_abort.set()
            self._tql_replay_thread.join(timeout=2)

        self._tql_active = False
        self._tql_state = None
        self._tql_context = None
        self._tql_torc_quality = None
        self._tql_rollback_digits = ""
        self._tql_session = None

        self._ql_hide_all()
        logger.info("Training QL exited")

    # ----------------------------------------------------------------
    #  Keyboard handling
    # ----------------------------------------------------------------

    def _tql_handle_key(self, char):
        """Handle a character key press in training quick-label mode."""
        if self._tql_state == 'prompt':
            if char == 'h':
                self._tql_on_hit()
            elif char == 'm':
                self._tql_on_miss()
            elif char == '5':
                self._tql_start_replay()
            elif char == 'e':
                self._tql_open_editor()
            return

        if self._tql_state == 'hit':
            if char == 's':
                self._tql_save_to_dataset(hit=True)
            elif char == '5':
                self._tql_start_replay()
            elif char in ('1', '2', '3', '4', '6', '7'):
                self._tql_apply_correction({
                    '1': 'premature', '2': 'late',
                    '3': 'undershoot', '4': 'overshoot',
                    '6': 'delay', '7': 'advance',
                }[char])
            elif char == 'r':
                self._tql_prev_state = 'hit'
                self._tql_state = 'rollback_select'
                self._tql_rollback_digits = ""
                self._ql_update_prompt(
                    "ROLLBACK: type checkpoint # then [Enter]\n"
                    "[Esc] cancel"
                )
            return

        if self._tql_state == 'miss':
            if char == 's':
                self._tql_save_to_dataset(hit=False)
            elif char == '5':
                self._tql_start_replay()
            elif char in ('1', '2', '3', '4', '6', '7'):
                self._tql_apply_correction({
                    '1': 'premature', '2': 'late',
                    '3': 'undershoot', '4': 'overshoot',
                    '6': 'delay', '7': 'advance',
                }[char])
            elif char == 'r':
                self._tql_prev_state = 'miss'
                self._tql_state = 'rollback_select'
                self._tql_rollback_digits = ""
                self._ql_update_prompt(
                    "ROLLBACK: type checkpoint # then [Enter]\n"
                    "[Esc] cancel"
                )
            return

        if self._tql_state == 'rollback_select':
            if char.isdigit():
                self._tql_rollback_digits += char
                self._ql_update_prompt(
                    f"ROLLBACK: #{self._tql_rollback_digits}_\n"
                    f"[Enter] confirm  [Esc] cancel"
                )

    def _tql_handle_special(self, name):
        """Handle special keys (Enter, Esc, PgUp, PgDn)."""
        if name == 'esc':
            if self._tql_replay_thread and self._tql_replay_thread.is_alive():
                self._tql_replay_abort.set()
                return
            if self._tql_state == 'rollback_select':
                prev = self._tql_prev_state or 'prompt'
                self._tql_state = prev
                self._tql_refresh_prompt()
            else:
                self._tql_exit()
            return

        if name in ('enter', 'return'):
            if self._tql_state == 'rollback_select' and self._tql_rollback_digits:
                idx = int(self._tql_rollback_digits)
                self._tql_do_rollback(idx)
                return
            if self._tql_state in ('hit', 'miss'):
                self._tql_exit()
            return

        if self._tql_state in ('hit', 'miss') and self._tql_session:
            if name == 'page_up':
                self._tql_session.adjust_steps(0.02)
                self._tql_refresh_overlays()
                entry = self._tql_session.get_active_entry()
                if entry:
                    logger.info(f"Step size increased: T={entry.get('timing_step', 0):.3f} "
                                f"M={entry.get('magnitude_step', 0):.3f} "
                                f"S={entry.get('time_shift_step', 0.02):.4f}")
            elif name == 'page_down':
                self._tql_session.adjust_steps(-0.02)
                self._tql_refresh_overlays()
                entry = self._tql_session.get_active_entry()
                if entry:
                    logger.info(f"Step size decreased: T={entry.get('timing_step', 0):.3f} "
                                f"M={entry.get('magnitude_step', 0):.3f} "
                                f"S={entry.get('time_shift_step', 0.02):.4f}")

    # ----------------------------------------------------------------
    #  HIT / MISS handlers
    # ----------------------------------------------------------------

    def _tql_on_hit(self):
        """Handle HIT label."""
        self._tql_state = 'hit'

        traj = self._tql_context.get('trajectory')
        angle = self._tql_context.get('angle_rad', 0)
        if traj:
            from trainer.torc_quality import estimate_torc_quality
            self._tql_torc_quality = estimate_torc_quality(traj, angle)
        else:
            self._tql_torc_quality = 0.0

        self._tql_session.record_hit(self._tql_torc_quality)

        self._ql_update_prompt(
            f"HIT!  TORC Q: {self._tql_torc_quality:.3f}\n"
            f"[1-4] Correct  [6] Delay  [7] Advance  [5] Replay\n"
            f"[PgUp/Dn] step  [R] Rollback  [S] Save  [Enter] Done  [Esc] Discard"
        )
        self._tql_refresh_overlays()
        logger.info(f"Training QL: HIT | TORC Q: {self._tql_torc_quality:.3f}")

    def _tql_on_miss(self):
        """Handle MISS label."""
        self._tql_state = 'miss'
        self._tql_show_miss_prompt()
        self._tql_refresh_overlays()
        logger.info("Training QL: MISS — apply corrections")

    def _tql_show_miss_prompt(self):
        """Show the MISS state prompt with current step sizes."""
        entry = self._tql_session.get_active_entry() if self._tql_session else None
        ts = entry.get('timing_step', 0.15) if entry else 0.15
        ms = entry.get('magnitude_step', 0.15) if entry else 0.15
        ss = entry.get('time_shift_step', 0.02) if entry else 0.02
        self._ql_update_prompt(
            f"MISS — Correct:  step T={ts:.2f} M={ms:.2f} S={ss:.3f}\n"
            f"[1] Premature  [2] Late  [3] Under  [4] Over  [6] Delay  [7] Advance\n"
            f"[5] Replay  [PgUp/Dn] step  [R] Rollback  [S] Save  [Enter] Done  [Esc] Discard"
        )

    def _tql_refresh_prompt(self):
        """Refresh the prompt for the current state."""
        if self._tql_state == 'hit':
            q = self._tql_torc_quality or 0.0
            self._ql_update_prompt(
                f"HIT!  TORC Q: {q:.3f}\n"
                f"[1-4] Correct  [6] Delay  [7] Advance  [5] Replay\n"
                f"[PgUp/Dn] step  [R] Rollback  [S] Save  [Enter] Done  [Esc] Discard"
            )
        elif self._tql_state == 'miss':
            self._tql_show_miss_prompt()
        elif self._tql_state == 'prompt':
            self._ql_update_prompt(
                "[H] HIT  [M] MISS  [5] Replay  [E] Editor  [Esc] Discard"
            )

    # ----------------------------------------------------------------
    #  Corrections
    # ----------------------------------------------------------------

    def _tql_apply_correction(self, kind):
        """Apply a correction and refresh overlays."""
        method = {
            'premature': self._tql_session.apply_premature,
            'late': self._tql_session.apply_late,
            'undershoot': self._tql_session.apply_undershoot,
            'overshoot': self._tql_session.apply_overshoot,
            'delay': self._tql_session.apply_delay,
            'advance': self._tql_session.apply_advance,
        }.get(kind)
        if method:
            method()

        entry = self._tql_session.get_active_entry()
        if entry:
            logger.info(f"Training correction [{kind}]: T={entry['timing_factor']:.3f} "
                        f"M={entry['magnitude_factor']:.3f} "
                        f"S={entry.get('time_shift', 0.0):+.3f}")

        if self._tql_state == 'miss':
            self._tql_show_miss_prompt()
        self._tql_refresh_overlays()

    def _tql_do_rollback(self, checkpoint_index):
        """Rollback to a checkpoint and refresh."""
        success = self._tql_session.rollback(checkpoint_index)
        if success:
            entry = self._tql_session.get_active_entry()
            if entry:
                logger.info(f"Training rollback to #{checkpoint_index}: "
                            f"T={entry['timing_factor']:.3f} "
                            f"M={entry['magnitude_factor']:.3f} "
                            f"S={entry.get('time_shift', 0.0):+.3f}")
        else:
            logger.warning(f"Training rollback failed: invalid #{checkpoint_index}")

        prev = self._tql_prev_state or 'prompt'
        self._tql_state = prev
        self._tql_refresh_prompt()
        self._tql_refresh_overlays()

    def _tql_refresh_overlays(self):
        """Refresh all HUD overlays with current state."""
        traj = self._tql_context.get('trajectory') if self._tql_context else None
        pre_traj = self._tql_context.get('pre_trajectory') if self._tql_context else None
        self._ql_update_all_overlays(
            self._tql_session, traj, attentioner=None,
            pre_trajectory=pre_traj, context=self._tql_context,
        )

    # ----------------------------------------------------------------
    #  Save
    # ----------------------------------------------------------------

    def _tql_save_to_dataset(self, hit=True):
        """Save the (optionally biased) recorded trajectory to the dataset."""
        if not hasattr(self, 'learner') or self.learner is None:
            logger.warning("No learner available — cannot save")
            self._tql_exit()
            return

        ctx = self._tql_context
        if ctx is None:
            self._tql_exit()
            return

        traj = copy.deepcopy(ctx.get('trajectory', []))

        # Apply accumulated bias
        entry = self._tql_session.get_active_entry() if self._tql_session else None
        if entry:
            from trainer.correction_session import CorrectionSession
            tf = entry['timing_factor']
            mf = entry['magnitude_factor']
            ts = entry.get('time_shift', 0.0)
            if tf != 1.0 or mf != 1.0 or ts != 0.0:
                CorrectionSession.apply_bias_to_trajectory(traj, tf, mf, ts)
                logger.info(f"Applied bias before save: T={tf:.3f} M={mf:.3f} S={ts:+.3f}")

        label = "HIT" if hit else "MISS"
        self.learner.add_sample(
            displacement_px=ctx['displacement_px'],
            angle_rad=ctx['angle_rad'],
            range_m=ctx['range_m'],
            trajectory=traj,
            hit=hit,
        )
        stats = self.learner.get_stats()
        logger.info(f"Training QL: saved as {label} | "
                    f"Data: {stats['total']} samples ({stats['hits']} hits)")

        self._tql_exit()

    # ----------------------------------------------------------------
    #  Editor escape hatch
    # ----------------------------------------------------------------

    def _tql_open_editor(self):
        """Exit QL and open the full visual trajectory editor."""
        ctx = self._tql_context
        self._tql_exit()
        if ctx:
            self.root.after(50, lambda c=ctx: self._open_refiner(c))

    # ----------------------------------------------------------------
    #  Replay
    # ----------------------------------------------------------------

    def _tql_start_replay(self):
        """Start replaying the recorded trajectory with current bias."""
        if self._tql_context is None:
            return
        if self._tql_replay_thread and self._tql_replay_thread.is_alive():
            self._tql_replay_abort.set()
            self._tql_replay_thread.join(timeout=2)

        self._tql_replay_abort.clear()
        pre_state = self._tql_state

        # Hide graph overlays during replay
        for win in [self._ql_graph_factors_win, self._ql_graph_lr_win,
                     self._ql_sim_win, self._ql_checkpoint_win]:
            if win:
                win.withdraw()

        self._tql_replay_thread = threading.Thread(
            target=self._tql_replay_thread_func,
            args=(pre_state,),
            daemon=True,
        )
        self._tql_replay_thread.start()

    def _tql_replay_thread_func(self, return_state):
        """Replay: countdown → teleport → pre-fire → click → biased trajectory."""
        from utils.trajectory_replay import replay_full_scenario
        from trainer.correction_session import CorrectionSession

        ctx = self._tql_context
        if ctx is None:
            self.root.after(0, lambda: self._tql_replay_done(return_state))
            return

        # Build biased trajectory
        traj = copy.deepcopy(ctx.get('trajectory', []))
        entry = self._tql_session.get_active_entry() if self._tql_session else None
        if entry:
            tf = entry['timing_factor']
            mf = entry['magnitude_factor']
            ts = entry.get('time_shift', 0.0)
            if tf != 1.0 or mf != 1.0 or ts != 0.0:
                CorrectionSession.apply_bias_to_trajectory(traj, tf, mf, ts)

        def _status(msg):
            self.root.after(0, lambda m=msg: self._ql_update_prompt(m))

        dx, dy, elapsed = replay_full_scenario(
            trajectory=traj,
            pre_trajectory=ctx.get('pre_trajectory'),
            cursor_pos=ctx.get('cursor_start_pos'),
            abort_event=self._tql_replay_abort,
            countdown_s=3,
            status_callback=_status,
            fire_click=True,
        )

        self.root.after(0, lambda: self._ql_update_prompt(
            f"Replay done ({dx}dx {dy}dy)"))
        import time
        time.sleep(1.5)
        self.root.after(0, lambda: self._tql_replay_done(return_state))

    def _tql_replay_done(self, return_state):
        """Return to QL state after replay completes."""
        self._ql_show_all()
        self._tql_state = return_state or 'prompt'
        self._tql_refresh_prompt()
        self._tql_refresh_overlays()
