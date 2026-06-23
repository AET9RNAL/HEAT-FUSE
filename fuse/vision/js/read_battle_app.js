(function() {
  var r = {};
  try {

    // Scoreboard visibility
    var _sb = document.querySelector('[class*="ScoreBoard_base"]');
    r.sb_open = (_sb && window.getComputedStyle(_sb).display !== 'none') ? 1 : 0;

    // Map display name + game mode display name
    // BattleInfo_mapName is a flex div whose SimpleText_track children hold both strings.
    var _bi = document.querySelector('[class*="BattleInfo_mapName"]');
    if (_bi) {
      var _tracks = _bi.querySelectorAll('[class*="SimpleText_track"]');
      if (_tracks.length >= 1) r.sb_map_name       = (_tracks[0].textContent || '').trim() || null;
      if (_tracks.length >= 2) r.sb_game_mode_name  = (_tracks[1].textContent || '').trim() || null;
    }

    // Team scores from JS model (available even when scoreboard closed)
    try {
      if (typeof scoreInfoModel !== 'undefined' && scoreInfoModel) {
        r.ally_score  = scoreInfoModel.ally  != null ? scoreInfoModel.ally  : null;
        r.enemy_score = scoreInfoModel.enemy != null ? scoreInfoModel.enemy : null;
      }
    } catch(e) {}

    // Scoreboard rows — only scrape when visible (expensive DOM walk)
    if (r.sb_open) {
      var _parseRow = function(rowEl) {
        var _nameEl = rowEl.querySelector('[class*="CellWrapper_base__player"] [class*="SimpleText_base__colored"]');
        var _scoreEl  = rowEl.querySelector('[class*="CellWrapper_base__score"]');
        var _dmgEl    = rowEl.querySelector('[class*="CellWrapper_base__damage"]');
        var _kcdEl    = rowEl.querySelector('[class*="CellWrapper_base__killConfirm"]');
        return {
          name:   _nameEl   ? (_nameEl.textContent   || '').trim() : '',
          score:  _scoreEl  ? (parseInt((_scoreEl.textContent  || '').replace(/,/g, '')) || 0) : 0,
          damage: _dmgEl    ? (parseInt((_dmgEl.textContent    || '').replace(/,/g, '')) || 0) : 0,
          kcd:    _kcdEl    ? (_kcdEl.textContent || '').trim() : '',
        };
      };
      var _allySect  = document.querySelector('[class*="ScoreTable_allies"]');
      var _enemySect = document.querySelector('[class*="ScoreTable_enemies"]');
      var _allyRows  = []; var _enemyRows = [];
      if (_allySect) {
        var _ar = _allySect.querySelectorAll('[class*="PlayerRow_base"]');
        for (var _i = 0; _i < _ar.length; _i++) _allyRows.push(_parseRow(_ar[_i]));
      }
      if (_enemySect) {
        var _er = _enemySect.querySelectorAll('[class*="PlayerRow_base"]');
        for (var _j = 0; _j < _er.length; _j++) _enemyRows.push(_parseRow(_er[_j]));
      }
      r.sb_ally_rows  = _allyRows;
      r.sb_enemy_rows = _enemyRows;
    }

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
