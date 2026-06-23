(function() {
  var r = {};
  try {

    //  HP 
    var hpEl = document.querySelector('[class*="HpBar_base"]');
    if (hpEl) {
      var m = hpEl.textContent.match(/^(\d+)([+\-])(\d+)/);
      if (m) {
        r.health = parseInt(m[1]);
        r.health_regen = parseInt(m[3]) * (m[2] === '+' ? 1 : -1);
      }
      var prog = document.querySelector('[class*="HpBar"] [class*="ProgressBar_progress"]');
      if (prog) {
        var pm = prog.style.transform.match(/translateX\((-?[\d.]+)%\)/);
        if (pm) r.health_pct = parseFloat(pm[1]);
      }
    }

    //  Mana / Ability Energy 
    var manaEl = document.querySelector('[class*="ManaBar_base"]');
    if (manaEl) {
      var mm = manaEl.textContent.match(/^(\d+(?:\.\d+)?)([+\-])(\d+(?:\.\d+)?)/);
      if (mm) {
        r.energy = Math.round(parseFloat(mm[1]));
        r.energy_regen = parseFloat(mm[3]) * (mm[2] === '+' ? 1 : -1);
      }
    }

    // Sprint / Boost
    var spEl = document.querySelector('[class*="SprintDrain_drainProgress"]');
    if (spEl) {
      var sm = spEl.style.transform.match(/translateX\((-?[\d.]+)%\)/);
      if (sm) {
        // translateX(0%) = full, translateX(-100%) = empty.
        // 100 + raw gives energy-remaining in [0, 100].
        var raw = parseFloat(sm[1]);
        r.boost = Math.round(Math.max(0, Math.min(100, 100 + raw)));
      }
    }
    var glowEl = document.querySelector('[class*="SprintDrain_glow"]');
    if (glowEl) {
      r.boost_active = (glowEl.style.visibility !== 'hidden') ? 1 : 0;
    }

    // Zoom / First-Person
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
          if (wrappers[i].className.indexOf('active') !== -1) zoomIdx = i;
        }
        r.zooms     = zooms;
        r.num_zooms = zooms.length;
        r.zoom_idx  = zoomIdx;
        r.zoom_val  = zooms[zoomIdx] || 0;
      }
    }

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
      }
    } catch(e) {}

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
