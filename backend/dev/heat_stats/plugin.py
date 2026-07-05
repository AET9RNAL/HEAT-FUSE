from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from fuse.core.api import FusePlugin, FuseContext

_HMAC_KEY = b"heat_fuse_stats_v1"
_HMAC_EXCLUDE = ("hmac_hex", "type")

PLUGIN_VERSION = "1.3.3"

_MS_FINISH = "ActiveFinish"

_SKIP_GAME_MODES = {"FiringRange"}


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

    def __init__(self) -> None:
        self._ctx: Optional[FuseContext] = None
        self._acc = None
        self._state: str = "IDLE"           # IDLE | WAITING | RECORDING
        self._session: Optional[MatchSession] = None
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
        ctx.config.defaults(sample_interval_s=5).load()
        if ctx.events:
            ctx.events.subscribe("accessors.connected",    self._on_connected,    owner=self.name)
            ctx.events.subscribe("accessors.disconnected", self._on_disconnected, owner=self.name)

    def tick(self, dt: float) -> None:
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

    def _poll_deaths(self) -> None:
        """Increment the death counter on each hp>0 → hp==0 transition."""
        hp = self._acc.read("health")
        if hp is None:
            return  # page not ready — keep last known hp, don't reset
        if hp == 0 and self._last_hp not in (None, 0):
            self._hp_death_count += 1
        self._last_hp = hp

    def teardown(self) -> None:
        if self._state == "RECORDING" and self._session:
            self._finalize("end" if self._saw_finish else "abandoned")

    # Accessors event handlers

    def _on_connected(self) -> None:
        if self._state == "IDLE":
            self._state      = "WAITING"
            self._saw_finish = False
            self._debug_ms   = None
            if self._ctx:
                self._ctx.logger.info("heat_stats: CDP connected — waiting for active match")

    def _on_disconnected(self) -> None:
        if self._state == "RECORDING" and self._session:
            # If we already saw ActiveFinish the match ended normally — page just
            # reloaded to the result screen, so finalize as a normal end.
            self._finalize("end" if self._saw_finish else "abandoned")
        elif self._state == "WAITING":
            self._state = "IDLE"
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

        sess.final_kills       = self._snap_ki
        sess.final_deaths      = self._hp_death_count  # authoritative — not snap-gated on match_state
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

        self._session    = None
        self._saw_finish = False
        self._state      = "IDLE"
