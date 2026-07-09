from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from loguru import logger

from fuse.core.api import FusePlugin, FuseContext
from fuse.ui.panel import FusePanel
from fuse.ui.config_schema import ConfigCategory, ConfigEntry

_HMAC_KEY = b"heat_fuse_stats_v1"
_HMAC_EXCLUDE = ("hmac_hex", "type")

PLUGIN_VERSION = "2.0.2"

_MS_FINISH = "ActiveFinish"

_SKIP_GAME_MODES = {"FiringRange"}

# Local player deep post-match stats: MatchSession attr → postbattle stats key.
# Missing keys (mode-dependent) stay None.
_PM_STAT_MAP = {
    "p_shell_hits_damage":    "shellHitsDamage",
    "p_crit_ammo_damage":     "critAmmoDamage",
    "p_crit_fuel_damage":     "critFuelDamage",
    "p_crit_engine_damage":   "critEngineDamage",
    "p_ability_damage_done":  "abilityDamageDone",
    "p_ability_damage_taken": "abilityDamageTaken",
    "p_blocked_damage":       "blockedDamage",
    "p_ramming_damage":       "rammingDamage",
    "p_heal":                 "heal",
    "p_damage_taken":         "damageTaken",
    "p_captured_base":        "capturedBase",
    "p_uncaptured_base":      "uncapturedBase",
    "p_capture_points":       "capturePoints",
    "p_hits_done":            "hitsDone",
    "p_hits_taken":           "hitsTaken",
    "p_shoot_done":           "shootDone",
    "p_crit_hits_done":       "criticalHitsDone",
    "p_crit_hits_taken":      "criticalHitsTaken",
    "p_noncrit_hits_done":    "nonCriticalHitsDone",
    "p_noncrit_hits_taken":   "nonCriticalHitsTaken",
    "p_noncrit_shoot_done":   "nonCriticalShootDone",
    "p_rp_crit_fuel_damage":  "rolePointsCritFuelDamage",
}


@dataclass
class MatchSample:
    t:   int             # elapsed seconds from match start
    hp:  Optional[int]   # vehicle health
    en:  Optional[int]   # ability energy
    bo:  Optional[int]   # boost/sprint energy
    pi:  Optional[int]   # ping ms
    fp:  Optional[int]   # fps
    al:  Optional[int]   # ally score
    es:  Optional[int]   # enemy score
    ki:  Optional[int]   # kills (cumulative)
    de:  Optional[int]   # deaths (cumulative)
    as_: Optional[int]   # assists (cumulative)
    da:  Optional[int]   # damage (cumulative)
    co:  Optional[int]   # confirms (cumulative; KC mode only)
    dn:  Optional[int]   # denies (cumulative; KC mode only)
    sc:  Optional[int]   # player role score (cumulative)
    ms:  Optional[str]   # gameModeState string ("Active", "Intro", "ActiveFinish", ...)
    # Deltas vs previous sample
    dki: int = 0
    dde: int = 0
    das: int = 0
    dda: int = 0
    dal: int = 0         # ally score delta
    des: int = 0         # enemy score delta
    dco: int = 0         # confirms delta
    ddn: int = 0         # denies delta
    dsc: int = 0         # score delta

    def to_dict(self) -> dict:
        return {
            "t":   self.t,
            "hp":  self.hp,
            "en":  self.en,
            "bo":  self.bo,
            "pi":  self.pi,
            "fp":  self.fp,
            "al":  self.al,
            "es":  self.es,
            "ki":  self.ki,
            "de":  self.de,
            "as":  self.as_,
            "da":  self.da,
            "co":  self.co,
            "dn":  self.dn,
            "sc":  self.sc,
            "ms":  self.ms,
            "dki": self.dki,
            "dde": self.dde,
            "das": self.das,
            "dda": self.dda,
            "dal": self.dal,
            "des": self.des,
            "dco": self.dco,
            "ddn": self.ddn,
            "dsc": self.dsc,
        }


@dataclass
class MatchSession:
    session_id:        str
    started_at:        float
    ended_at:          float         = 0.0
    duration_s:        float         = 0.0
    outcome:           str           = "abandoned"
    map_slug:          Optional[str] = None
    map_name:          Optional[str] = None
    game_mode:         Optional[str] = None
    player_name:       Optional[str] = None
    player_vehicle:    Optional[str] = None
    player_role:       Optional[str] = None
    player_agent_id:   Optional[int] = None
    final_kills:       int           = 0
    final_deaths:      int           = 0
    final_assists:     Optional[int] = None
    final_damage:      int           = 0
    final_confirms:    Optional[int] = None
    final_denies:      Optional[int] = None
    final_score:       int           = 0
    final_ally_score:  int           = 0
    final_enemy_score: int           = 0
    peak_ping:         int           = 0
    avg_ping:          float         = 0.0
    avg_fps:           float         = 0.0
    sample_count:      int           = 0
    # Local player deep post-match stats (results screen; None if not captured).
    p_shell_hits_damage:   Optional[int] = None
    p_crit_ammo_damage:    Optional[int] = None
    p_crit_fuel_damage:    Optional[int] = None
    p_crit_engine_damage:  Optional[int] = None
    p_ability_damage_done: Optional[int] = None
    p_ability_damage_taken:Optional[int] = None
    p_blocked_damage:      Optional[int] = None
    p_ramming_damage:      Optional[int] = None
    p_heal:                Optional[int] = None
    p_damage_taken:        Optional[int] = None
    p_captured_base:       Optional[int] = None
    p_uncaptured_base:     Optional[int] = None
    p_capture_points:      Optional[int] = None
    p_hits_done:           Optional[int] = None
    p_hits_taken:          Optional[int] = None
    p_shoot_done:          Optional[int] = None
    p_crit_hits_done:      Optional[int] = None
    p_crit_hits_taken:     Optional[int] = None
    p_noncrit_hits_done:   Optional[int] = None
    p_noncrit_hits_taken:  Optional[int] = None
    p_noncrit_shoot_done:  Optional[int] = None
    p_rp_crit_fuel_damage: Optional[int] = None
    # Per-team summaries (results screen; None if not captured).
    ally_kills:     Optional[int] = None
    ally_deaths:    Optional[int] = None
    ally_assists:   Optional[int] = None
    ally_damage:    Optional[int] = None
    ally_captures:  Optional[int] = None
    ally_confirms:  Optional[int] = None
    ally_denies:    Optional[int] = None
    enemy_kills:    Optional[int] = None
    enemy_deaths:   Optional[int] = None
    enemy_assists:  Optional[int] = None
    enemy_damage:   Optional[int] = None
    enemy_captures: Optional[int] = None
    enemy_confirms: Optional[int] = None
    enemy_denies:   Optional[int] = None
    samples:           list          = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "session_id":        self.session_id,
            "started_at":        self.started_at,
            "ended_at":          self.ended_at,
            "duration_s":        self.duration_s,
            "outcome":           self.outcome,
            "map_slug":          self.map_slug,
            "map_name":          self.map_name,
            "game_mode":         self.game_mode,
            "player_name":       self.player_name,
            "player_vehicle":    self.player_vehicle,
            "player_role":       self.player_role,
            "player_agent_id":   self.player_agent_id,
            "final_kills":       self.final_kills,
            "final_deaths":      self.final_deaths,
            "final_assists":     self.final_assists,
            "final_damage":      self.final_damage,
            "final_confirms":    self.final_confirms,
            "final_denies":      self.final_denies,
            "final_score":       self.final_score,
            "final_ally_score":  self.final_ally_score,
            "final_enemy_score": self.final_enemy_score,
            "peak_ping":         self.peak_ping,
            "avg_ping":          round(self.avg_ping, 1),
            "avg_fps":           round(self.avg_fps, 1),
            "sample_count":      self.sample_count,
            "client_version":    PLUGIN_VERSION,
            # local player deep post-match stats
            "p_shell_hits_damage":    self.p_shell_hits_damage,
            "p_crit_ammo_damage":     self.p_crit_ammo_damage,
            "p_crit_fuel_damage":     self.p_crit_fuel_damage,
            "p_crit_engine_damage":   self.p_crit_engine_damage,
            "p_ability_damage_done":  self.p_ability_damage_done,
            "p_ability_damage_taken": self.p_ability_damage_taken,
            "p_blocked_damage":       self.p_blocked_damage,
            "p_ramming_damage":       self.p_ramming_damage,
            "p_heal":                 self.p_heal,
            "p_damage_taken":         self.p_damage_taken,
            "p_captured_base":        self.p_captured_base,
            "p_uncaptured_base":      self.p_uncaptured_base,
            "p_capture_points":       self.p_capture_points,
            "p_hits_done":            self.p_hits_done,
            "p_hits_taken":           self.p_hits_taken,
            "p_shoot_done":           self.p_shoot_done,
            "p_crit_hits_done":       self.p_crit_hits_done,
            "p_crit_hits_taken":      self.p_crit_hits_taken,
            "p_noncrit_hits_done":    self.p_noncrit_hits_done,
            "p_noncrit_hits_taken":   self.p_noncrit_hits_taken,
            "p_noncrit_shoot_done":   self.p_noncrit_shoot_done,
            "p_rp_crit_fuel_damage":  self.p_rp_crit_fuel_damage,
            # per-team summaries
            "ally_kills":     self.ally_kills,
            "ally_deaths":    self.ally_deaths,
            "ally_assists":   self.ally_assists,
            "ally_damage":    self.ally_damage,
            "ally_captures":  self.ally_captures,
            "ally_confirms":  self.ally_confirms,
            "ally_denies":    self.ally_denies,
            "enemy_kills":    self.enemy_kills,
            "enemy_deaths":   self.enemy_deaths,
            "enemy_assists":  self.enemy_assists,
            "enemy_damage":   self.enemy_damage,
            "enemy_captures": self.enemy_captures,
            "enemy_confirms": self.enemy_confirms,
            "enemy_denies":   self.enemy_denies,
            "samples":           [s.to_dict() for s in self.samples],
        }


def _normalize(obj):
    """Convert integer-valued floats to int so json.dumps produces '0' not '0.0'.

    Python serializes float(0.0) as '0.0'; after JSON round-trip through the
    frontend, JS sees 0 and JSON.stringify produces '0'. Without this step the
    HMAC computed here would never match the Edge Function's re-serialization.
    """
    if isinstance(obj, float) and obj == int(obj) and abs(obj) < 1e15:
        return int(obj)
    if isinstance(obj, dict):
        return {k: _normalize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize(v) for v in obj]
    return obj


def _sign(payload: dict) -> str:
    body = json.dumps(
        _normalize({k: v for k, v in payload.items() if k not in _HMAC_EXCLUDE}),
        sort_keys=True,
        separators=(',', ':'),
    ).encode()
    return _hmac.new(_HMAC_KEY, body, hashlib.sha256).hexdigest()


class HeatStatsPlugin(FusePlugin):

    requires_calibration = True
    calibration_stages = 1

    def __init__(self) -> None:
        self._ctx: Optional[FuseContext] = None
        self._acc = None
        self._state: str = "IDLE"           # IDLE | WAITING | RECORDING | SUMMARIZING
        self._session: Optional[MatchSession] = None
        # Rive overlay
        self._anim  = None
        self._panel: Optional[FusePanel] = None
        self._in_focus: bool = True
        # Overlay phase drives the VMStats booleans:
        #   idle | waiting | recording | summarizing | finalizing
        self._phase: str = "idle"
        self._summarize_timer: float = 0.0
        # Previous-sample cumulative values for delta computation
        self._prev_ki: int = 0
        self._prev_de: int = 0
        self._prev_as: Optional[int] = None
        self._prev_da: int = 0
        self._prev_al: int = 0
        self._prev_es: int = 0
        self._prev_co: Optional[int] = None
        self._prev_dn: Optional[int] = None
        self._prev_sc: int           = 0
        # Last-known cumulative values while models were live.
        # Used for final summary to survive model-wipe on match end.
        self._snap_ki: int = 0
        self._snap_de: int = 0
        self._snap_as: Optional[int] = None
        self._snap_da: int = 0
        self._snap_al: int = 0
        self._snap_es: int = 0
        self._snap_co: Optional[int] = None
        self._snap_dn: Optional[int] = None
        self._snap_sc: int           = 0
        # Death detection: count hp>0 → hp==0 transitions, polled every tick()
        # (not every sample) so fast respawns between 5s samples are still caught.
        # The in-battle scoreboard death counter is unreliable — it only increments
        # on respawn and misses the final death when the match ends while dead.
        self._hp_death_count: int           = 0
        self._last_hp:        Optional[int] = None
        # Post-match capture (results screen)
        self._pm_captured: bool          = False
        self._roster:      Optional[list] = None
        # Timers and running aggregates
        self._sample_timer: float = 0.0
        self._elapsed:      float = 0.0
        self._ping_sum:     float = 0.0
        self._fps_sum:      float = 0.0
        self._perf_count:   int   = 0
        # Match detection state
        self._saw_finish: bool   = False  # True once "ActiveFinish" observed this session
        self._debug_ms:   object = None   # deduplicate match_state probe log

    # Plugin lifecycle

    def setup(self, ctx: FuseContext) -> None:
        self._ctx = ctx
        self._acc = ctx.services.get("accessors")
        ctx.config.defaults(
            sample_interval_s=5,
            summarize_hold_s=5.0,
            overlay_pos=None,
            anim_width=300,
            anim_height=300,
        ).load()

        ctx.config.schema([
            ConfigCategory("Recording", [
                ConfigEntry("sample_interval_s", "Sample Interval (s)", type="int",   min=1,   max=30),
                ConfigEntry("summarize_hold_s",  "Summary Hold (s)",    type="float", min=0.0, max=20.0,
                            description="How long the summary overlay shows before uploading"),
            ]),
            ConfigCategory("Animation", [
                ConfigEntry("anim_width",  "Render Width",  type="int", min=10, max=3000),
                ConfigEntry("anim_height", "Render Height", type="int", min=10, max=3000),
            ]),
            ConfigCategory("Position", [
                ConfigEntry("overlay_pos", "Overlay Position", type="position"),
            ]),
        ])

        if ctx.events:
            ctx.events.subscribe("accessors.connected",    self._on_connected,    owner=self.name)
            ctx.events.subscribe("accessors.disconnected", self._on_disconnected, owner=self.name)

        self._setup_overlay(ctx)

    def _setup_overlay(self, ctx: FuseContext) -> None:
        w = int(ctx.config.get("anim_width")  or 300)
        h = int(ctx.config.get("anim_height") or 300)

        svc = ctx.services.get("rive_animation")
        if svc is not None:
            try:
                self._anim = svc.create(w, h)
                if not self._anim.load_bytes(ctx.assets.read("stats.riv")):
                    logger.error("heat_stats: failed to load stats.riv")
                    self._anim = None
                else:
                    self._anim.set_artboard("STATSBOARD")
                    self._anim.set_state_machine("cruiseEngine")
                    self._anim.vm_bind("VMStats")
                    self._anim.vm_set_bool("isSetupComplete", False)
                    self._push_overlay()
                    self._anim.advance(0)
            except Exception as e:
                logger.error(f"heat_stats: could not load Rive asset: {e}")
                self._anim = None
        else:
            logger.warning("heat_stats: 'rive_animation' service not available - no overlay")

        sw = ctx.tk_root.winfo_screenwidth()
        sh = ctx.tk_root.winfo_screenheight()
        default_x = (sw - w) // 2
        default_y = int(sh * 0.3) - h // 2

        self._panel = FusePanel(
            "HEAT Stats", "overlay_pos", ctx.config,
            default_x=default_x, default_y=default_y,
        )
        if self._anim is not None:
            self._panel.create(self._anim.get_image())
        else:
            from PIL import Image
            self._panel.create(Image.new("RGBA", (w, h), (0, 0, 0, 0)))
        self._panel.show()

    def _push_overlay(self) -> None:
        """Drive the VMStats booleans from the current overlay phase."""
        if not self._anim:
            return
        self._anim.vm_set_bool("isWaiting",     self._phase == "waiting")
        self._anim.vm_set_bool("isRecording",   self._phase == "recording")
        self._anim.vm_set_bool("isSummarizing", self._phase == "summarizing")
        self._anim.vm_set_bool("isFinalizing",  self._phase == "finalizing")

    def _render_overlay(self, dt: float) -> None:
        """Advance the Rive animation and blit — runs in every host state."""
        if not (self._anim and self._panel):
            return
        self._push_overlay()
        self._anim.advance(dt)
        self._panel.update(self._anim.get_image())

    # Calibration / focus lifecycle

    def enter_calibrate(self, stage: int = 1) -> None:
        if self._panel:
            self._panel.enter_calibrate(stage)
        if self._anim:
            self._anim.vm_set_bool("isSetupComplete", False)

    def enter_locked(self) -> None:
        if self._panel:
            self._panel.enter_locked()
        if self._anim:
            self._anim.vm_set_bool("isSetupComplete", True)

    def set_overlay_visible(self, visible: bool) -> None:
        self._in_focus = visible
        if self._ctx and self._ctx.state == "calibrate":
            return
        if self._panel:
            self._panel.show() if visible else self._panel.hide()

    def tick(self, dt: float) -> None:
        if self._ctx:
            self._ctx.config.check_reload()

        # Overlay renders in every host state (calibrate + locked).
        self._render_overlay(dt)

        if not self._ctx or self._ctx.state != "locked" or self._acc is None:
            return

        # Recovery: if plugin went IDLE while accessors is still live (e.g. after
        # a false match-end), re-enter the right state without waiting for a
        # reconnect event.
        if self._state == "IDLE":
            ms_now = self._acc.read("match_state")
            bs_now = self._acc.read("battle_state")
            if bs_now == 8 and ms_now != _MS_FINISH:
                self._debug_ms = None
                self._ctx.logger.info("heat_stats: mid-match recovery — ms={!r} bs={!r}", ms_now, bs_now)
                self._begin_session()

        if self._state == "WAITING":
            self._check_match_start()
        elif self._state == "RECORDING":
            self._elapsed += dt
            # Results screen appeared — capture authoritative post-match summary
            # (deep stats + team totals), then show the summary before uploading.
            if not self._pm_captured and self._acc.read("pm_available") == 1:
                if self._capture_postmatch():
                    self._pm_captured = True
                    self._state = "SUMMARIZING"
                    self._phase = "summarizing"
                    self._summarize_timer = 0.0
                    return
            # Poll deaths every tick — the accessors cache refreshes hp every
            # ~0.1s, so a death window (seconds) is always observed, even between
            # the 5s stat samples where a fast respawn could otherwise hide it.
            self._poll_deaths()
            self._sample_timer += dt
            interval = float(self._ctx.config.get("sample_interval_s"))
            if self._sample_timer >= interval:
                self._sample_timer -= interval
                self._take_sample()
            self._check_match_end()
        elif self._state == "SUMMARIZING":
            # Data already captured; hold the summary overlay, then upload.
            self._summarize_timer += dt
            if self._summarize_timer >= float(self._ctx.config.get("summarize_hold_s")):
                self._phase = "finalizing"
                self._finalize("end")

    def _poll_deaths(self) -> None:
        """Increment the death counter on each hp>0 → hp==0 transition."""
        hp = self._acc.read("health")
        if hp is None:
            return  # page not ready — keep last known hp, don't reset
        if hp == 0 and self._last_hp not in (None, 0):
            self._hp_death_count += 1
        self._last_hp = hp

    def teardown(self) -> None:
        if self._session and self._state in ("RECORDING", "SUMMARIZING"):
            # SUMMARIZING already has authoritative data captured → finalize it.
            self._finalize("end" if (self._saw_finish or self._pm_captured) else "abandoned")
        if self._panel:
            try:
                self._panel.persist_position()
            except Exception:
                pass
            try:
                self._panel.destroy()
            except Exception:
                pass
        if self._anim:
            try:
                self._anim.close()
            except Exception:
                pass

    # Accessors event handlers

    def _on_connected(self) -> None:
        if self._state == "IDLE":
            self._state      = "WAITING"
            self._phase      = "waiting"
            self._saw_finish = False
            self._debug_ms   = None
            if self._ctx:
                self._ctx.logger.info("heat_stats: CDP connected — waiting for active match")

    def _on_disconnected(self) -> None:
        if self._session and self._state in ("RECORDING", "SUMMARIZING"):
            # If we already saw ActiveFinish (or captured the results screen) the
            # match ended normally — the page just reloaded to results/hangar.
            self._finalize("end" if (self._saw_finish or self._pm_captured) else "abandoned")
        elif self._state == "WAITING":
            self._state = "IDLE"
            self._phase = "idle"
            if self._ctx:
                self._ctx.logger.info("heat_stats: CDP disconnected before match started")

    # Match state machine

    def _check_match_start(self) -> None:
        ms = self._acc.read("match_state")
        bs = self._acc.read("battle_state")

        if ms != self._debug_ms:
            self._debug_ms = ms
            if self._ctx:
                self._ctx.logger.info("heat_stats: waiting — ms={!r} bs={!r}", ms, bs)

        # battle_state==8 = battle active (cross-mode signal).
        # Domination: ms="Intro"/bs=4 during countdown → ms="Active"/bs=8 when battle starts.
        # Kill Confirm: ms="Intro"/bs=8 for the entire battle.
        # Guard against ActiveFinish phase which may still have bs=8.
        if bs == 8 and ms != _MS_FINISH:
            if self._acc.read("game_mode") in _SKIP_GAME_MODES:
                return
            self._begin_session()

    def _check_match_end(self) -> None:
        ms = self._acc.read("match_state")
        if ms == _MS_FINISH:
            self._saw_finish = True
        # End on None: ws drops when result page loads (after ActiveFinish phase)
        if ms is None:
            self._finalize("end")

    def _begin_session(self) -> None:
        acc = self._acc
        self._session = MatchSession(
            session_id      = str(uuid.uuid4()),
            started_at      = time.time(),
            map_slug        = acc.read("map_slug"),
            map_name        = acc.read("sb_map_name"),
            game_mode       = acc.read("game_mode"),
            player_name     = acc.read("player_name"),
            player_vehicle  = acc.read("player_vehicle"),
            player_role     = acc.read("player_role"),
            player_agent_id = acc.read("player_agent_id"),
        )
        self._hp_death_count = 0
        self._last_hp        = acc.read("health")
        self._pm_captured    = False
        self._roster         = None
        self._prev_ki = acc.read("player_kills")      or 0
        self._prev_de = 0
        self._prev_as = acc.read("player_assists")
        self._prev_da = acc.read("player_damage")     or 0
        self._prev_al = acc.read("ally_score")        or 0
        self._prev_es = acc.read("enemy_score")       or 0
        self._prev_co = acc.read("sb_player_confirms")
        self._prev_dn = acc.read("sb_player_denies")
        self._prev_sc = acc.read("player_role_pts")    or 0
        self._snap_ki = self._prev_ki
        self._snap_de = 0
        self._snap_as = self._prev_as
        self._snap_da = self._prev_da
        self._snap_al = self._prev_al
        self._snap_es = self._prev_es
        self._snap_co = self._prev_co
        self._snap_dn = self._prev_dn
        self._snap_sc = self._prev_sc
        self._elapsed      = 0.0
        self._sample_timer = 0.0
        self._ping_sum     = 0.0
        self._fps_sum      = 0.0
        self._perf_count   = 0
        self._state = "RECORDING"
        self._phase = "recording"
        self._ctx.logger.info(
            "heat_stats: match started — {} on {}",
            self._session.game_mode or "?",
            self._session.map_slug  or "?",
        )
        self._take_sample()

    # Sampling

    def _take_sample(self) -> None:
        if not self._session:
            return
        acc = self._acc

        hp_now = acc.read("health")

        ki  = acc.read("player_kills")       or 0
        de  = self._hp_death_count           # hp-transition counter — always valid
        as_ = acc.read("player_assists")
        da  = acc.read("player_damage")      or 0
        al  = acc.read("ally_score")         or 0
        es  = acc.read("enemy_score")        or 0
        co  = acc.read("sb_player_confirms")
        dn  = acc.read("sb_player_denies")
        sc  = acc.read("player_role_pts")      or 0
        pi  = acc.read("ping")
        fp  = acc.read("fps")

        if pi is not None:
            self._ping_sum   += pi
            self._perf_count += 1
            if pi > self._session.peak_ping:
                self._session.peak_ping = pi
        if fp is not None:
            self._fps_sum += fp

        dki  = max(0, ki - self._prev_ki)
        dde  = max(0, de - self._prev_de)
        das  = max(0, (as_ or 0) - (self._prev_as or 0)) if as_ is not None else 0
        dda  = max(0, da - self._prev_da)
        dal  = al - self._prev_al
        des_ = es - self._prev_es
        dco  = max(0, (co or 0) - (self._prev_co or 0)) if co is not None else 0
        ddn  = max(0, (dn or 0) - (self._prev_dn or 0)) if dn is not None else 0
        dsc  = max(0, sc - self._prev_sc)

        self._session.samples.append(MatchSample(
            t   = int(round(self._elapsed)),
            hp  = hp_now,
            en  = acc.read("energy"),
            bo  = acc.read("boost"),
            pi  = pi,
            fp  = fp,
            al  = al,
            es  = es,
            ki  = ki,
            de  = de,
            as_ = as_,
            da  = da,
            co  = co,
            dn  = dn,
            sc  = sc,
            ms  = acc.read("match_state"),
            dki = dki,
            dde = dde,
            das = das,
            dda = dda,
            dal = dal,
            des = des_,
            dco = dco,
            ddn = ddn,
            dsc = dsc,
        ))
        self._session.sample_count += 1

        self._prev_ki = ki
        self._prev_de = de
        self._prev_as = as_
        self._prev_da = da
        self._prev_al = al
        self._prev_es = es
        self._prev_co = co
        self._prev_dn = dn
        self._prev_sc = sc

        if acc.read("match_state") is not None:
            self._snap_ki = ki
            self._snap_de = de   # hp_death_count — always valid
            self._snap_as = as_
            self._snap_da = da
            self._snap_al = al
            self._snap_es = es
            self._snap_co = co
            self._snap_dn = dn
            self._snap_sc = sc

    # Post-match capture (results screen)

    def _capture_postmatch(self) -> bool:
        """Capture the local player's deep stats + per-team summaries from the
        results screen (postbattleScene). Returns True on success."""
        acc     = self._acc
        players = acc.read("pm_players")
        if not players:
            return False
        sess   = self._session
        my_id  = acc.read("pm_my_player_id")
        my_team = acc.read("pm_my_team")
        me = next((p for p in players if p.get("playerId") == my_id), None)
        if my_team is None and me is not None:
            my_team = me.get("team")

        if me is not None:
            for col, key in _PM_STAT_MAP.items():
                setattr(sess, col, me.get(key))
            # Authoritative finals straight from the results screen.
            if me.get("kills")         is not None: sess.final_kills    = me["kills"]
            if me.get("deaths")        is not None: sess.final_deaths   = me["deaths"]
            if me.get("assists")       is not None: sess.final_assists  = me["assists"]
            if me.get("damage")        is not None: sess.final_damage   = me["damage"]
            if me.get("killConfirmed") is not None: sess.final_confirms = me["killConfirmed"]
            if me.get("killDenied")    is not None: sess.final_denies   = me["killDenied"]
            if me.get("rolePoints")    is not None: sess.final_score    = me["rolePoints"]

        def _sum(rows, key):
            return sum((p.get(key) or 0) for p in rows)

        ally  = [p for p in players if p.get("team") == my_team]
        enemy = [p for p in players if p.get("team") != my_team]
        sess.ally_kills     = _sum(ally, "kills")
        sess.ally_deaths    = _sum(ally, "deaths")
        sess.ally_assists   = _sum(ally, "assists")
        sess.ally_damage    = _sum(ally, "damage")
        sess.ally_captures  = _sum(ally, "capturedBase")
        sess.ally_confirms  = _sum(ally, "killConfirmed")
        sess.ally_denies    = _sum(ally, "killDenied")
        sess.enemy_kills    = _sum(enemy, "kills")
        sess.enemy_deaths   = _sum(enemy, "deaths")
        sess.enemy_assists  = _sum(enemy, "assists")
        sess.enemy_damage   = _sum(enemy, "damage")
        sess.enemy_captures = _sum(enemy, "capturedBase")
        sess.enemy_confirms = _sum(enemy, "killConfirmed")
        sess.enemy_denies   = _sum(enemy, "killDenied")

        # Team objective scores (authoritative) from postbattleScene.
        scores = acc.read("pm_team_scores") or {}
        if my_team is not None and scores:
            def _score_for(team):
                return scores.get(team, scores.get(str(team)))
            a = _score_for(my_team)
            if a is not None:
                sess.final_ally_score = a
            others = [v for k, v in scores.items() if str(k) != str(my_team)]
            if others and others[0] is not None:
                sess.final_enemy_score = others[0]

        # Stored roster = team composition only (identity, no stats — those live in
        # the team summaries + local player columns). One slim record per player.
        def _slim(p):
            return {
                "name":  p.get("name"),
                "agent": p.get("agentName"),
                "tank":  p.get("vehicleName"),
                "role":  p.get("role"),
            }
        self._roster = {
            "ally":  [_slim(p) for p in ally],
            "enemy": [_slim(p) for p in enemy],
        }
        return True

    # Session finalization

    def _finalize(self, reason: str) -> None:
        if not self._session:
            self._state = "IDLE"
            return

        if self._acc and self._acc.read("match_state") is not None:
            self._take_sample()

        sess = self._session
        now = time.time()
        sess.ended_at   = now
        sess.duration_s = round(now - sess.started_at, 2)

        # When the results screen was captured, _capture_postmatch already set the
        # authoritative finals + team summaries. Otherwise (abandoned, no results
        # screen) fall back to the live snapshots + hp death counter.
        if not self._pm_captured:
            sess.final_kills       = self._snap_ki
            sess.final_deaths      = self._hp_death_count  # not snap-gated on match_state
            sess.final_assists     = self._snap_as
            sess.final_damage      = self._snap_da
            sess.final_ally_score  = self._snap_al
            sess.final_enemy_score = self._snap_es
            sess.final_confirms    = self._snap_co
            sess.final_denies      = self._snap_dn
            sess.final_score       = self._snap_sc

        if self._perf_count > 0:
            sess.avg_ping = round(self._ping_sum / self._perf_count, 1)
            sess.avg_fps  = round(self._fps_sum  / self._perf_count, 1)

        if reason == "abandoned":
            sess.outcome = "abandoned"
        elif sess.final_ally_score > sess.final_enemy_score:
            sess.outcome = "win"
        elif sess.final_ally_score < sess.final_enemy_score:
            sess.outcome = "loss"
        else:
            sess.outcome = "draw"

        payload = sess.to_dict()
        # Team composition {ally:[{name,agent,tank,role}], enemy:[...]} for team
        # metrics. Stored in match_samples_blob alongside the sample timeline.
        payload["roster"] = self._roster if self._roster is not None else {}
        payload["hmac_hex"] = _sign(payload)
        payload["type"]     = "heat_stats.session_complete"

        self._ctx.logger.info(
            "heat_stats: match ended — {} | K{} D{} A{} dmg{} | {} samples",
            sess.outcome,
            sess.final_kills,
            sess.final_deaths,
            sess.final_assists if sess.final_assists is not None else "?",
            sess.final_damage,
            sess.sample_count,
        )

        server = self._ctx.host._server
        if server is not None:
            server._schedule_broadcast(json.dumps(payload))

        self._session      = None
        self._saw_finish   = False
        self._pm_captured  = False
        self._roster       = None
        self._state        = "IDLE"
        # If CDP is still live, we're back to waiting for the next match.
        connected = bool(self._acc and self._acc.connected)
        self._phase = "waiting" if connected else "idle"
