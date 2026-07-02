(function() {
  var r = {};
  try {

    // HP — playerHealthModel is written atomically by the C++ engine; no DOM race condition.
    try {
      var _phmt = typeof playerHealthModel;
      r._dbg_phm = _phmt + '/' + (_phmt !== 'undefined' && playerHealthModel ? (playerHealthModel.health !== undefined ? String(playerHealthModel.health) : 'h_undef') : 'absent');
      if (_phmt !== 'undefined' && playerHealthModel) {
        r.health       = playerHealthModel.health        != null ? Math.round(playerHealthModel.health)               : null;
        r.health_regen = playerHealthModel.changePerSecond != null ? playerHealthModel.changePerSecond                : 0;
        r.health_pct   = playerHealthModel.remainHealthPercentage != null ? playerHealthModel.remainHealthPercentage  : null;
      }
    } catch(e) { r._dbg_phm = 'ERR:' + e.message; }

    // Energy (mana) — manaAbilityModel
    try {
      var _mamt = typeof manaAbilityModel;
      r._dbg_mam = _mamt + '/' + (_mamt !== 'undefined' && manaAbilityModel ? (manaAbilityModel.data ? String(manaAbilityModel.data.currentMana) : 'no_data') : 'absent');
      if (_mamt !== 'undefined' && manaAbilityModel && manaAbilityModel.data) {
        var _md = manaAbilityModel.data;
        r.energy       = _md.currentMana     != null ? Math.round(_md.currentMana)  : null;
        r.energy_regen = _md.changePerSecond != null ? _md.changePerSecond          : 0;
      }
    } catch(e) { r._dbg_mam = 'ERR:' + e.message; }

    // Sprint / Boost — manaSprintModel.data.leftManaPrc is 0-100 percentage remaining
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

    // Rangefinder — distance to crosshair target (battle_hud DOM).
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
    // Cohtml rejects :not() with attribute selectors — filter Wrapper elements in JS.
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
        r.ally_score   = scoreInfoModel.ally        != null ? scoreInfoModel.ally        : null;
        r.enemy_score  = scoreInfoModel.enemy       != null ? scoreInfoModel.enemy       : null;
        r.allied_zones = scoreInfoModel.alliedZones != null ? scoreInfoModel.alliedZones : null;
        r.enemy_zones  = scoreInfoModel.enemyZones  != null ? scoreInfoModel.enemyZones  : null;
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
    try {
      if (typeof deathInfoModel !== 'undefined' && deathInfoModel) {
        r.player_deaths = deathInfoModel.deadCount != null ? deathInfoModel.deadCount : null;
      }
    } catch(e) {}

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
