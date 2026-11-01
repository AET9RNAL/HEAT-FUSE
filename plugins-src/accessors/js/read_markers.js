(function() {
  var r = {};
  try {

    // Player status effects (playerEffectBar)
    // debuffs/buffs arrays contain per-stack records; active:true = currently applied.
    // Unique tags of active entries are the current effect set.
    if (typeof playerEffectBar !== 'undefined' && playerEffectBar) {
      var _collectTags = function(arr) {
        var tags = [];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].active) {
            var tag = arr[i].tag || '';
            if (tag && tags.indexOf(tag) === -1) tags.push(tag);
          }
        }
        return tags;
      };
      var _dTags = _collectTags(playerEffectBar.debuffs);
      var _bTags = _collectTags(playerEffectBar.buffs);
      r.debuff_tags  = _dTags;
      r.debuff_count = _dTags.length;
      r.buff_tags    = _bTags;
      r.buff_count   = _bTags.length;
      r.on_fire      = _dTags.indexOf('burning') !== -1 ? 1 : 0;
    }

    // Guided missile marker - distance from player to missile in flight.
    // GuidedMissileMarker_distanceValue element present + visible only while missile is airborne.
    var _gmEl = document.querySelector('[class*="GuidedMissileMarker_distanceValue"]');
    if (_gmEl && window.getComputedStyle(_gmEl).visibility !== 'hidden') {
      var _gmTxt = (_gmEl.textContent || '').trim().replace(/m$/i, '');
      var _gmVal = parseInt(_gmTxt);
      r.missile_dist         = isNaN(_gmVal) ? null : _gmVal;
      r.missile_in_flight    = 1;
    } else {
      r.missile_dist         = null;
      r.missile_in_flight    = 0;
    }

    // Major effects (fire animation, visual CC, etc.)
    // majorEffectModel<id> globals - one per effect type. isActive = visible now.
    var _major = [];
    for (var _k in window) {
      if (_k.indexOf('majorEffectModel') !== 0) continue;
      try {
        var _m = window[_k];
        if (_m && _m.isActive) _major.push(_k);
      } catch(e) {}
    }
    r.major_effect_count = _major.length;

    // Damage dealt from the on-target hit numbers; counts FiringRange dummies, which player_damage skips.
    var _dd = window.__fuseDealtDamage || (window.__fuseDealtDamage = { total: 0, hits: 0, seen: {}, maxId: 0 });
    for (var _dk in window) {
      if (_dk.indexOf('damageDealtAction') !== 0) continue;
      try {
        var _dm = window[_dk];
        if (!_dm || typeof _dm.clearDamages !== 'function' || _dm.clearDamages.__fuseDealt) continue;
        (function(model, orig) {
          var wrapped = function() {
            try {
              var acts = model.damageActions || [];
              for (var i = 0; i < acts.length; i++) {
                var a = acts[i];
                if (!a || a.id == null) continue;
                // A far lower id is a new battle's counter on the same page.
                if (a.id < _dd.maxId - 1000) { _dd.seen = {}; _dd.maxId = 0; }
                if (_dd.seen[a.id]) continue;
                _dd.seen[a.id] = 1;
                _dd.total += Number(a.value) || 0;
                _dd.hits += 1;
                if (a.id > _dd.maxId) _dd.maxId = a.id;
              }
            } catch(e) {}
            return orig.apply(this, arguments);
          };
          wrapped.__fuseDealt = 1;
          model.clearDamages = wrapped;
        })(_dm, _dm.clearDamages);
      } catch(e) {}
    }
    // Models clear within frames, so an id far below the newest never comes back.
    if (_dd.hits - (_dd.pruned || 0) >= 200) {
      _dd.pruned = _dd.hits;
      for (var _sid in _dd.seen) if (+_sid < _dd.maxId - 500) delete _dd.seen[_sid];
    }
    r.dealt_damage = _dd.total;
    r.dealt_hits   = _dd.hits;

    // Vehicle markers: class and distance from the player. An enemy has no role until the game spots it.
    if (typeof vehicleMarkerEntries !== 'undefined' && vehicleMarkerEntries && vehicleMarkerEntries.ids) {
      var _veh = [], _vids = vehicleMarkerEntries.ids;
      for (var _vi = 0; _vi < _vids.length; _vi++) {
        var _vid = _vids[_vi];
        var _vp = window['vehiclePlayerInfoPrefix' + _vid], _vo = window['vehicleMarkerOrientationPrefix' + _vid];
        var _vd = window['vehicleMarkerDefaultViewPrefix' + _vid];
        if (!_vp || !_vo || (_vd && _vd.isFree) || !_vp.role) continue;
        var _va = Number(_vp.affiliation) || 0;
        if (_va !== 2 && _va !== 4) continue;
        _veh.push({ id: Number(_vid), aff: _va, role: String(_vp.role), name: String(_vp.userName || ''),
          dist: Number(_vo.distance) || 0, squad: Number(_vp.squadMateNumber) || 0 });
      }
      r.vehicles = _veh;
    }

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
