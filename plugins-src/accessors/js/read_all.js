(function() {
  var r = {};
  try {

    // HP - playerHealthModel is written atomically by the C++ engine; no DOM race condition.
    try {
      var _phmt = typeof playerHealthModel;
      r._dbg_phm = _phmt + '/' + (_phmt !== 'undefined' && playerHealthModel ? (playerHealthModel.health !== undefined ? String(playerHealthModel.health) : 'h_undef') : 'absent');
      if (_phmt !== 'undefined' && playerHealthModel) {
        r.health       = playerHealthModel.health        != null ? Math.round(playerHealthModel.health)               : null;
        r.health_regen = playerHealthModel.changePerSecond != null ? playerHealthModel.changePerSecond                : 0;
        r.health_pct   = playerHealthModel.remainHealthPercentage != null ? playerHealthModel.remainHealthPercentage  : null;
      }
    } catch(e) { r._dbg_phm = 'ERR:' + e.message; }

    // Energy (mana) - manaAbilityModel
    try {
      var _mamt = typeof manaAbilityModel;
      r._dbg_mam = _mamt + '/' + (_mamt !== 'undefined' && manaAbilityModel ? (manaAbilityModel.data ? String(manaAbilityModel.data.currentMana) : 'no_data') : 'absent');
      if (_mamt !== 'undefined' && manaAbilityModel && manaAbilityModel.data) {
        var _md = manaAbilityModel.data;
        r.energy       = _md.currentMana     != null ? Math.round(_md.currentMana)  : null;
        r.energy_regen = _md.changePerSecond != null ? _md.changePerSecond          : 0;
      }
    } catch(e) { r._dbg_mam = 'ERR:' + e.message; }

    // Sprint / Boost - manaSprintModel.data.leftManaPrc is 0-100 percentage remaining
    try {
      if (typeof manaSprintModel !== 'undefined' && manaSprintModel && manaSprintModel.data) {
        var _sd = manaSprintModel.data;
        r.boost = _sd.leftManaPrc != null ? Math.round(_sd.leftManaPrc) : null;
        r.boost_active = (manaSprintModel.isSprintBoosted || manaSprintModel.isPressed) ? 1 : 0;
      }
    } catch(e) {}

    // Zoom / First-Person
    // Wrapped in try-catch: getComputedStyle / querySelectorAll inside the custom element
    // can throw in some Cohtml builds, which would abort the outer block.
    try {
      var widget = document.querySelector('zoom-indicator-widget');
      if (widget) {
        var base = widget.querySelector('[class*="ZoomIndicator_base"]');
        if (base) {
          r.is_fp = window.getComputedStyle(base).visibility !== 'hidden' ? 1 : 0;
          var wrappers = base.querySelectorAll('[class*="valueWrapper"]');
          var zooms = [];
          var zoomIdx = 0;
          for (var i = 0; i < wrappers.length; i++) {
            var valEl = wrappers[i].querySelector('[class*="ZoomIndicator_value"]');
            if (valEl) {
              var zm = valEl.textContent.match(/([\d.]+)x/);
              if (zm) zooms.push(parseFloat(zm[1]));
            }
            // "active" class detection is unreliable - see docs/COHTML_CDP_DEBUGGER.md §Limitations #5.
            if (typeof wrappers[i].className === 'string' && wrappers[i].className.indexOf('active') !== -1) zoomIdx = i;
          }
          r.zooms     = zooms;
          r.num_zooms = zooms.length;
          r.zoom_idx  = zoomIdx;
          r.zoom_val  = zooms[zoomIdx] || 0;
        }
      }
    } catch(e) {}

    // Speed
    var speedEl = document.querySelector('[class*="Speedometer_speedValue"]');
    if (speedEl) r.speed = parseInt(speedEl.textContent) || 0;

    // Ability Panel (abilities 1+2, ultimate)
    // All read from abilityPanelModel JS global (keyed abilities only).
    // Regular abilities (F/T):
    //   state: 1=ready, 6=on cooldown, 20=active/deployed.
    //   timeLeft: cooldown seconds remaining (0 when ready). effectReloadPrc always 0.
    //   useReloadingEffects=true → charges: available = seriesEffectsCount - remainingEffectsCount.
    // Conditional ability (R / ultimate, isConditionalAbility=true):
    //   state: 19=charging, other=ready/active.
    //   progressPrc: 0.0–1.0 charge fraction (effectReloadPrc and timeLeft unused).
    try {
      if (typeof abilityPanelModel !== 'undefined' && abilityPanelModel) {
        var _abs = abilityPanelModel.abilities;
        var _keyed = [];
        for (var _i = 0; _i < _abs.length; _i++) {
          if (_abs[_i].keyLabel) _keyed.push(_abs[_i]);
        }
        if (_keyed[0]) {
          r.ab1_state   = _keyed[0].state;
          r.ab1_cd      = _keyed[0].timeLeft > 0 ? parseFloat(_keyed[0].timeLeft.toFixed(2)) : 0;
          r.ab1_charges = _keyed[0].useReloadingEffects
            ? (_keyed[0].seriesEffectsCount - _keyed[0].remainingEffectsCount) : null;
        }
        if (_keyed[1]) {
          r.ab2_state   = _keyed[1].state;
          r.ab2_cd      = _keyed[1].timeLeft > 0 ? parseFloat(_keyed[1].timeLeft.toFixed(2)) : 0;
          r.ab2_charges = _keyed[1].useReloadingEffects
            ? (_keyed[1].seriesEffectsCount - _keyed[1].remainingEffectsCount) : null;
        }
        if (_keyed[2]) {
          r.ult_state      = _keyed[2].state;
          r.ult_charge_pct = Math.round((_keyed[2].progressPrc || 0) * 100);
        }
      }
    } catch(e) {}

    // Rangefinder - distance to crosshair target (battle_hud DOM).
    // Visible only when reticle is on a target; retains stale text when hidden.
    var _rfBase = document.querySelector('[class*="TargetDistance_base"]');
    var _rfEl   = document.querySelector('[class*="TargetDistance_distance"]');
    if (_rfEl) {
      var _rfTxt = (_rfEl.textContent || '').trim().replace(/\s*M$/i, '');
      var _rfVal = parseInt(_rfTxt);
      r.target_dist     = isNaN(_rfVal) ? null : _rfVal;
      r.target_dist_vis = (_rfBase
        ? window.getComputedStyle(_rfBase).visibility
        : window.getComputedStyle(_rfEl).visibility) !== 'hidden' ? 1 : 0;
    }

    // XP log
    // LogXP_xpValue_e3c shows XP gained per action as a transient popup.
    // QuestAction1.points = same value from JS model (null between actions).
    var xpEl = document.querySelector('[class*="LogXP_xpValue"]');
    r.xp_action = xpEl ? (parseInt(xpEl.textContent) || 0) : null;
    try {
      if (typeof QuestAction1 !== 'undefined' && QuestAction1 && QuestAction1.points != null)
        r.xp_action_type = QuestAction1.actionType || null;
    } catch(e) {}

    // Equipment (Q = slot 1, E = slot 2)
    // equipmentPanelModel.abilities[] - indexed array (length=2 = Q and E).
    // state: 1=ready, 6=on cooldown.
    // timeLeft: cooldown seconds remaining (float, 0 when ready).
    // EquipmentEffectCount element is removed from DOM when on cooldown,
    // so DOM queries are unreliable; model is used for all equipment reads.
    try {
      if (typeof equipmentPanelModel !== 'undefined' && equipmentPanelModel) {
        var _eq = equipmentPanelModel.abilities;
        for (var _ei = 0; _ei < Math.min(_eq.length, 2); _ei++) {
          var _eitem = _eq[_ei];
          var _pfx = _ei === 0 ? 'equip1' : 'equip2';
          r[_pfx + '_state']   = _eitem.state;
          r[_pfx + '_cd']      = _eitem.timeLeft > 0 ? Math.round(_eitem.timeLeft) : 0;
          r[_pfx + '_charges'] = _eitem.useReloadingEffects
            ? (_eitem.seriesEffectsCount - _eitem.remainingEffectsCount) : null;
        }
      }
    } catch(e) {}

    // Conditional Trait / Agent Passive
    // traitPanelModel is a global updated by the C++ ECS every tick.
    // state: 0=idle, non-zero=charging or active (game-specific enum).
    // curTime/time: progress ratio for the current state (0.0–time).
    try {
      if (typeof traitPanelModel !== 'undefined' && traitPanelModel) {
        r.trait_state    = traitPanelModel.state    || 0;
        r.trait_cur_time = traitPanelModel.curTime  || 0;
        r.trait_time     = traitPanelModel.time     || 0;
        r.trait_type     = traitPanelModel.traitType || null;
      }
    } catch(e) {}

    // Status Effects
    // Slot container children = active effect icons.  0 = no effects active.
    var efSlot = document.querySelector('[class*="EffectManager_slotContainer"]');
    r.status_effect_count = efSlot ? efSlot.children.length : 0;

    // Battle Info
    try {
      if (typeof battleInfoModel !== 'undefined' && battleInfoModel) {
        r.battle_state     = battleInfoModel.state || 0;
        r.battle_countdown = battleInfoModel.countdownTimer != null
                             ? Math.round(battleInfoModel.countdownTimer) : null;
        r._dbg_bc = (typeof battleInfoModel.countdownTimer) + ':' + JSON.stringify(battleInfoModel.countdownTimer);
      }
    } catch(e) {}

    // Ping / FPS
    // Cohtml rejects :not() with attribute selectors - filter Wrapper elements in JS.
    try {
      var _allPerf = document.querySelectorAll('[class*="PerfInfo_statValue"]');
      var _perfVals = [];
      for (var _pi = 0; _pi < _allPerf.length; _pi++) {
        if (_allPerf[_pi].className.indexOf('Wrapper') === -1) _perfVals.push(_allPerf[_pi]);
      }
      if (_perfVals.length >= 1) r.ping = parseInt(_perfVals[0].textContent) || null;
      if (_perfVals.length >= 2) r.fps  = parseInt(_perfVals[1].textContent) || null;
    } catch(e) {}

    // Game mode / match state / map slug
    try {
      if (typeof gameModeInfo !== 'undefined' && gameModeInfo) {
        r.game_mode   = gameModeInfo.gameModeName  || null;
        r.match_state = gameModeInfo.gameModeState != null ? gameModeInfo.gameModeState : null;
        r._dbg_ms = (typeof gameModeInfo.gameModeState) + ':' + JSON.stringify(gameModeInfo.gameModeState);
      }
    } catch(e) {}
    try {
      if (typeof matchInfoModel !== 'undefined' && matchInfoModel && matchInfoModel.background) {
        var _bgm = matchInfoModel.background.match(/\/worlds\/([^/]+)\//);
        r.map_slug = _bgm ? _bgm[1] : null;
      }
    } catch(e) {}

    // Team scores / zone control
    try {
      if (typeof scoreInfoModel !== 'undefined' && scoreInfoModel) {
        r.ally_score    = scoreInfoModel.ally        != null ? scoreInfoModel.ally        : null;
        r.enemy_score   = scoreInfoModel.enemy       != null ? scoreInfoModel.enemy       : null;
        r.allied_zones  = scoreInfoModel.alliedZones != null ? scoreInfoModel.alliedZones : null;
        r.enemy_zones   = scoreInfoModel.enemyZones  != null ? scoreInfoModel.enemyZones  : null;
        // desired = win target; the match-progress bars fill by score / desired.
        r.desired_score = scoreInfoModel.desired     != null ? scoreInfoModel.desired     : null;
        r.team_leads    = scoreInfoModel.teamLeads   != null ? scoreInfoModel.teamLeads   : null;
      }
    } catch(e) {}

    // Objective progress (Control-style modes) - the game shows an
    // ObjectiveProgress bar driven by objectiveProgressModel<id> (dynamic id, one
    // per objective) with per-team capture % + overtime. Pick the active
    // (unlocked) instance with the most progress.
    try {
      var _bestObj = null;
      for (var _ok in window) {
        if (_ok.indexOf('objectiveProgressModel') !== 0) continue;
        try {
          var _om = window[_ok];
          var _oa = _om && _om.allyProgressBar, _oe = _om && _om.enemyProgressBar;
          if (!_oa || !_oe) continue;
          var _cand = {
            a: _oa, e: _oe,
            locked: !!(_oa.isLocked && _oe.isLocked),
            max: Math.max(_oa.progressPrc || 0, _oe.progressPrc || 0),
          };
          if (!_bestObj || (!_cand.locked && _bestObj.locked) ||
              (_cand.locked === _bestObj.locked && _cand.max > _bestObj.max)) _bestObj = _cand;
        } catch(e) {}
      }
      if (_bestObj) {
        r.obj_active    = 1;
        r.obj_ally_prc  = _bestObj.a.progressPrc  != null ? Math.round(_bestObj.a.progressPrc)  : null;
        r.obj_enemy_prc = _bestObj.e.progressPrc != null ? Math.round(_bestObj.e.progressPrc) : null;
        r.obj_overtime  = (_bestObj.a.isOvertime || _bestObj.e.isOvertime) ? 1 : 0;
      }
    } catch(e) {}

    // Overtime - a separate model, populated only in game modes that have it
    // (e.g. Control). Field names vary, so read a few candidates defensively;
    // absent (null) in modes without overtime.
    try {
      var _ot = (typeof overtimeModel   !== 'undefined' && overtimeModel)   ? overtimeModel
              : (typeof OvertimeModel    !== 'undefined' && OvertimeModel)    ? OvertimeModel
              : null;
      if (_ot) {
        var _otProg = _ot.overtimeProgress   != null ? _ot.overtimeProgress   : _ot.progress;
        var _otTot  = _ot.overtimeTotalTime  != null ? _ot.overtimeTotalTime  : _ot.totalTime;
        var _otAct  = _ot.isOvertime != null ? _ot.isOvertime
                    : _ot.overtimeActive != null ? _ot.overtimeActive
                    : _ot.isActive != null ? _ot.isActive : (_otProg != null);
        r.overtime_active   = _otAct ? 1 : 0;
        r.overtime_progress = _otProg != null ? _otProg : null;
        r.overtime_total    = _otTot != null ? _otTot : null;
      }
    } catch(e) {}

    // Player match stats
    try {
      if (typeof playerInfoModel !== 'undefined' && playerInfoModel) {
        r.player_kills    = playerInfoModel.kill             != null ? playerInfoModel.kill             : null;
        r.player_assists  = playerInfoModel.assist           != null ? playerInfoModel.assist           : null;
        r.player_damage   = playerInfoModel.damage           != null ? playerInfoModel.damage           : null;
        r.player_role_pts = playerInfoModel.currentRolePoints != null ? playerInfoModel.currentRolePoints : null;
        r.player_is_dead  = playerInfoModel.isDead ? 1 : 0;
        var _pi = playerInfoModel.info;
        if (_pi) {
          r.player_role = _pi.role || null;
          r.player_vehicle = _pi.vehicleName ? _pi.vehicleName.split('.')[0] : null;
          var _agm = _pi.agentName ? _pi.agentName.match(/frontmen\.(\d+)\./) : null;
          r.player_agent_id = _agm ? parseInt(_agm[1]) : null;
          r.player_name = _pi.displayName || null;
        }
      }
    } catch(e) {}

    // Live team roster - tacticalInfoModel.players is the FULL 10-player roster
    // (topPlayersModel is only a top-3 leaderboard and lacks isDead), with live
    // alive/dead + health + class role + team, driving the scoreboard strip.
    // NOTE: vehicleName here is a localized DISPLAY callsign ("M1E1"), not the
    // art slug. The art slug ("a02_m1e1_120") only appears in topPlayersModel,
    // joined by vehicleId - harvested below as sb_vehicle_slugs so a consumer can
    // cache vehicleId -> slug across matches. agent_icon = frontmanIcon basename,
    // which maps 1:1 to the agents/ portrait art for every player.
    try {
      if (typeof tacticalInfoModel !== 'undefined' && tacticalInfoModel && tacticalInfoModel.players) {
        var _iconName = function(p) {
          var s = p.frontmanIcon || p.frontmanBig || '';
          var m = String(s).match(/([^/]+)\.png$/i);
          return m ? m[1] : null;
        };
        var _slimWarrior = function(p) {
          return {
            name:         p.userName || (p.account && p.account.uniqueName) || '',
            team:         p.team != null ? p.team : null,
            role:         p.role || '',
            vehicle_id:   p.vehicleId != null ? p.vehicleId : null,
            vehicle_disp: p.vehicleName || null,
            agent_icon:   _iconName(p),
            agent:        p.agentName || null,
            is_dead:      p.isDead ? 1 : 0,
            health_pct:   p.healthPrc != null ? Math.round(p.healthPrc) : null,
            respawning:   p.respawnInProcess ? 1 : 0,
            has_bomb:     p.hasBomb ? 1 : 0,
            place:        p.place != null ? p.place : null,
            is_bot:       p.isBot ? 1 : 0,
            is_player:    p.isPlayer ? 1 : 0,
            level:        p.level != null ? p.level : null,
            // Squad grouping: platoonNumber is per-team (0 = solo), so squad
            // identity is (team, platoon_number). platoon_mate = slot in squad.
            platoon_number: p.platoonNumber != null ? p.platoonNumber : 0,
            platoon_mate:   p.platoonMateNumber != null ? p.platoonMateNumber : 0
          };
        };
        var _warriors = [];
        for (var _wi = 0; _wi < tacticalInfoModel.players.length; _wi++) {
          try { _warriors.push(_slimWarrior(tacticalInfoModel.players[_wi])); } catch(e) {}
        }
        r.sb_warriors = _warriors;
        if (tacticalInfoModel.currentPlayer && tacticalInfoModel.currentPlayer.team != null)
          r.sb_my_team = tacticalInfoModel.currentPlayer.team;

        // Full tactical roster: every field the model exposes, deep-normalized
        // (account.platform / inputScheme / crossplayEnabled, live K/D/A,
        // confirms/denies, damage, role points, respawn/bomb state, platoon
        // grouping). sb_warriors above stays the slim compat view.
        try {
          r.roster = {
            players: __fuseDeep(__fuseArr(tacticalInfoModel.players), 8),
            me: __fuseDeep(tacticalInfoModel.currentPlayer, 8),
            teams: __fuseDeep(__fuseArr(tacticalInfoModel.teams), 6),
            is_free: tacticalInfoModel.isFree ? 1 : 0,
          };
        } catch(e) {}
      }
    } catch(e) {}

    // Harvest vehicleId -> art-slug pairs (topPlayersModel exposes the slug only
    // for its few leaderboard entries); consumers accumulate these over matches.
    try {
      if (typeof topPlayersModel !== 'undefined' && topPlayersModel && topPlayersModel.topPlayers) {
        var _slugs = {};
        for (var _ti = 0; _ti < topPlayersModel.topPlayers.length; _ti++) {
          var _tp = topPlayersModel.topPlayers[_ti];
          if (_tp && _tp.vehicleId != null && _tp.vehicleName) {
            var _slug = String(_tp.vehicleName).split('.')[0];
            if (_slug) _slugs[_tp.vehicleId] = _slug;
          }
        }
        if (Object.keys(_slugs).length) r.sb_vehicle_slugs = _slugs;
      }
    } catch(e) {}

    // Scene signals: the engine's camera slot and the view states the HUD itself switches on.
    try {
      var _vsOf = function(n) { try { var v = window[n]; return v && typeof v === 'object' ? v : null; } catch(e) { return null; } };
      var _cam = '';
      var _camFrom = ['player_panel_view_state', 'battle_info_view_state', 'ability_panel_view_state', 'doll_view_state', 'role_points_view_state', 'shoot_indicator_view_state'];
      for (var _ci = 0; _ci < _camFrom.length && !_cam; _ci++) {
        var _cv = _vsOf(_camFrom[_ci]);
        if (_cv && _cv.activeCameraSlot) _cam = String(_cv.activeCameraSlot);
      }
      var _on = function(n) { var v = _vsOf(n); return v && v.active ? 1 : 0; };
      r.scene_hud = {
        camera:      _cam,
        hud:         _on('player_panel_view_state'),
        map:         _on('tactical_map_view_state'),
        kill_card:   _on('kill_card_view_state'),
        respawn:     (typeof respawnInfoModel !== 'undefined' && respawnInfoModel && respawnInfoModel.active) ? 1 : 0,
        observer:    (typeof observerInfoModel !== 'undefined' && observerInfoModel && observerInfoModel.isActive) ? 1 : 0,
        finished:    (typeof battleInfoModel !== 'undefined' && battleInfoModel && battleInfoModel.isFinished) ? 1 : 0
      };
    } catch(e) {}

    // Radar spotting sectors: 8 world-fixed 45° sectors, index 4 spans 0-45° clockwise from north. The HUD turns them by -camera.
    try {
      if (typeof radarSectorsModel !== 'undefined' && radarSectorsModel && radarSectorsModel.sectors) {
        var _rs = radarSectorsModel.sectors, _sec = [];
        for (var _si = 0; _si < _rs.length; _si++) {
          var _in = _rs[_si].inside || {}, _out = _rs[_si].outside || {};
          _sec.push({
            inside: Number(_in.value) || 0, inside_new: _in.isNew ? 1 : 0,
            outside: Number(_out.value) || 0, outside_new: _out.isNew ? 1 : 0
          });
        }
        var _rd = typeof radarDynamicModel !== 'undefined' && radarDynamicModel ? radarDynamicModel : null;
        var _rst = typeof radarStaticModel !== 'undefined' && radarStaticModel ? radarStaticModel : null;
        var _rm = typeof radarMapModel !== 'undefined' && radarMapModel ? radarMapModel : null;
        // Blips: only what the HUD draws. Hidden entries never leave the page.
        var _obj = [], _ro = typeof radarObjectsModel !== 'undefined' && radarObjectsModel ? radarObjectsModel.objects : null;
        if (_ro) for (var _oi = 0; _oi < _ro.length; _oi++) {
          var _o = _ro[_oi];
          if (!_o || !_o.isVisible) continue;
          _obj.push({ trigger: Number(_o.trigger) || 0, type: Number(_o.type) || 0, aff: Number(_o.affiliation) || 0,
            platoon: Number(_o.platoonMateNumber) || 0, x: Number(_o.toX) || 0, y: Number(_o.toY) || 0, rot: Number(_o.rotation) || 0 });
        }
        var _bas = [], _rb = typeof radarCaptureBaseData !== 'undefined' && radarCaptureBaseData ? radarCaptureBaseData.objects : null;
        if (_rb) for (var _bi = 0; _bi < _rb.length; _bi++) {
          var _b = _rb[_bi];
          if (!_b) continue;
          _bas.push({ id: String(_b.id), sign: String(_b.sign || ''), status: Number(_b.status) || 0,
            progress: Number(_b.progress) || 0, x: Number(_b.toX) || 0, y: Number(_b.toY) || 0,
            icon: String(_b.labelIcon || ''), icon_blink: _b.isLabelIconBlinking ? 1 : 0 });
        }
        var _bp = [];
        if (_rst && _rst.breakpoints) for (var _pi = 0; _pi < _rst.breakpoints.length; _pi++) {
          _bp.push([Number(_rst.breakpoints[_pi].distance) || 0, Number(_rst.breakpoints[_pi].size) || 0]);
        }
        r.radar = {
          visible: (_rst && _rst.isVisible) ? 1 : 0,
          camera:  _rd ? Number(_rd.cameraRotation) || 0 : 0,
          turret:  _rd ? Number(_rd.turretRotation) || 0 : 0,
          sectors: _sec,
          pos:     _rm ? [Number(_rm.mapOffsetX) || 0, Number(_rm.mapOffsetY) || 0] : null,
          // Maps with an old radar image count pos from its corner: world = pos - map_size / 2.
          map_size: _rm && _rm.size ? [Number(_rm.size.x) || 0, Number(_rm.size.y) || 0] : [0, 0],
          circle:  _rst ? Number(_rst.circleRadius) || 0 : 0,
          range:   _rst ? Number(_rst.distanceRadius) || 0 : 0,
          cone:    _rst ? Number(_rst.coneAngle) || 0 : 0,
          breakpoints: _bp,
          objects: _obj,
          bases:   _bas
        };
      }
    } catch(e) {}

    // Damage taken: the engine keeps the last 5 entries and grows `value` in place when hits merge.
    try {
      if (typeof battleDamageLogModel !== 'undefined' && battleDamageLogModel && battleDamageLogModel.logs) {
        var _dl = battleDamageLogModel.logs, _dlo = [];
        for (var _dj = 0; _dj < _dl.length; _dj++) {
          var _de = _dl[_dj];
          if (!_de || _de.id == null) continue;
          _dlo.push({
            id:      Number(_de.id),
            source:  Number(_de.damageSource) || 0,
            effect:  Number(_de.effectKind) || 0,
            value:   Number(_de.value) || 0,
            name:    _de.playerName || '',
            vehicle: _de.vehicleName || ''
          });
        }
        r.dmg_log = _dlo;
      }
      if (typeof deathInfoModel !== 'undefined' && deathInfoModel && deathInfoModel.isKilledBy && deathInfoModel.killedByInfo) {
        var _kb = deathInfoModel.killedByInfo;
        var _kbIcon = String(_kb.frontmanBig || '').match(/([^/]+)\.png$/i);
        r.dmg_killer = {
          unique_name: _kb.uniqueName || '',
          name:        _kb.displayName || '',
          vehicle_id:  _kb.vehicleId != null ? Number(_kb.vehicleId) : null,
          vehicle_key: _kb.vehicleName || '',
          team:        _kb.team != null ? Number(_kb.team) : null,
          role:        _kb.role || '',
          agent_icon:  _kbIcon ? _kbIcon[1] : null
        };
      }
    } catch(e) {}

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
