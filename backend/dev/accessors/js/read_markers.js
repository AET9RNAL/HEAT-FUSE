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

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
