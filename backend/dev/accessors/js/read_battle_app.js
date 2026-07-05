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

    // Scoreboard rows - always scraped; DOM is rendered even when the scoreboard is
    // visually closed, so the rows are always present.
    var _parseRow = function(rowEl) {
      var _nameEl   = rowEl.querySelector('[class*="CellWrapper_base__player"] [class*="SimpleText_base__colored"]');
      var _scoreEl  = rowEl.querySelector('[class*="CellWrapper_base__score"]');
      var _dmgEl    = rowEl.querySelector('[class*="CellWrapper_base__damage"]');
      var _deathEl  = rowEl.querySelector('[class*="CellWrapper_base__deaths"]');
      var _kcdEl    = rowEl.querySelector('[class*="CellWrapper_base__killConfirm"]');
      return {
        name:   _nameEl   ? (_nameEl.textContent   || '').trim() : '',
        score:  _scoreEl  ? (parseInt((_scoreEl.textContent  || '').replace(/,/g, '')) || 0) : 0,
        damage: _dmgEl    ? (parseInt((_dmgEl.textContent    || '').replace(/,/g, '')) || 0) : 0,
        deaths: _deathEl  ? (parseInt((_deathEl.textContent  || '').trim()) || 0) : 0,
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
    // sb_player_deaths / confirms / denies resolved in Python after this eval
    // returns, by matching player_name (primary) or damage+score (fallback)
    // against sb_ally_rows. See Accessors._match_local_row().

    // ── Post-match results (postbattleScene) — populated only on the results screen.
    // Each player record spreads the FULL deep stats object (~90 fields) and merges
    // identity + assists/confirms/denies/kills/rolePoints from tacticalInfoModel
    // (the stats object lacks those). One assembled roster the plugin can aggregate.
    try {
      var _pb = (typeof postbattleScene !== 'undefined') ? postbattleScene : null;
      var _common = _pb && _pb.results && _pb.results.common;
      if (_common && _common.teams && _common.gameMode) {
        var _num = function(v){ return typeof v === 'bigint' ? Number(v) : v; };
        // Identity/live map from tacticalInfoModel, keyed by playerId.
        var _tm = (typeof tacticalInfoModel !== 'undefined') ? tacticalInfoModel : null;
        var _idm = {};
        if (_tm && _tm.players) {
          for (var _pi2 = 0; _pi2 < _tm.players.length; _pi2++) {
            var _tp = _tm.players[_pi2], _ac = _tp.account || {};
            _idm[_tp.playerId] = {
              name: _tp.userName || (_ac.uniqueName || ''),
              clanTag: _ac.clanTag || '',
              role: _tp.role, vehicleName: _tp.vehicleName, vehicleId: _tp.vehicleId,
              agentName: _tp.agentName, level: _tp.level,
              isBot: _tp.isBot ? 1 : 0, isPlayer: _tp.isPlayer ? 1 : 0,
              assists: _tp.assists, killConfirmed: _tp.killConfirmed,
              killDenied: _tp.killDenied, kills: _tp.kills, rolePoints: _tp.rolePoints
            };
          }
        }
        var _players = [], _teamScores = {};
        for (var _t = 0; _t < _common.teams.length; _t++) {
          var _te = _common.teams[_t], _tps = _te.players || {}, _teamNo = null;
          for (var _pid in _tps) {
            var _pr = _tps[_pid], _st = _pr.stats || {}, _piInfo = _pr.playerInfo || {};
            _teamNo = _piInfo.team;
            var _idn = _idm[_pid] || {};
            var _rec = {};
            for (var _k in _st) _rec[_k] = _num(_st[_k]);        // FULL stats object
            _rec.playerId      = parseInt(_pid);
            _rec.team          = _teamNo;
            _rec.name          = _idn.name || '';
            _rec.clanTag       = _idn.clanTag || '';
            _rec.role          = _idn.role || null;
            _rec.vehicleName   = _idn.vehicleName || null;
            _rec.vehicleId     = _idn.vehicleId != null ? _idn.vehicleId : null;
            _rec.agentName     = _idn.agentName || null;
            _rec.level         = _idn.level != null ? _idn.level : null;
            _rec.isBot         = _idn.isBot != null ? _idn.isBot : 0;
            _rec.isPlayer      = _idn.isPlayer != null ? _idn.isPlayer : 0;
            _rec.assists       = _idn.assists != null ? _idn.assists : (_st.killAssist != null ? _st.killAssist : null);
            _rec.killConfirmed = _idn.killConfirmed != null ? _idn.killConfirmed : (_st.killConfirmed != null ? _st.killConfirmed : null);
            _rec.killDenied    = _idn.killDenied != null ? _idn.killDenied : (_st.killDenied != null ? _st.killDenied : null);
            _rec.kills         = _st.frags != null ? _st.frags : (_idn.kills != null ? _idn.kills : null);
            _rec.rolePoints    = _idn.rolePoints != null ? _idn.rolePoints : (_st.rolePoints != null ? _st.rolePoints : null);
            _players.push(_rec);
          }
          if (_teamNo != null) _teamScores[_teamNo] = _num(_te.score);
        }
        r.pm_available    = 1;
        r.pm_game_mode    = _common.gameMode;
        r.pm_map_slug     = (String(_common.battleWorld || '').match(/\/worlds\/(.+?)\.world/) || [])[1] || null;
        r.pm_started_at   = _num(_common.startedAt);
        r.pm_finished_at  = _num(_common.finishedAt);
        r.pm_my_player_id = _pb.results.battlePlayerId != null ? _num(_pb.results.battlePlayerId) : null;
        r.pm_my_team      = (_tm && _tm.currentPlayer) ? _tm.currentPlayer.team : null;
        r.pm_team_scores  = _teamScores;
        r.pm_players      = _players;
      } else {
        r.pm_available = 0;
      }
    } catch(e) { r.pm_err = e.message; }

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
