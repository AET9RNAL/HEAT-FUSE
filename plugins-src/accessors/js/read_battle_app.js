(function() {
  var r = {};
  try {

    // Scoreboard visibility
    var _sb = document.querySelector('[class*="ScoreBoard_base"]');
    r.sb_open = (_sb && window.getComputedStyle(_sb).display !== 'none') ? 1 : 0;

    // SPA route (deploy, vehicle swap, menus, results). The store reference is cached: the fiber walk is not free.
    try {
      var _rs = window.__fuseRouterStore;
      if (!_rs) {
        var _rctx = __fuseFindContext(function(v) { return v && v.RouterStore; });
        _rs = _rctx ? _rctx.RouterStore : null;
        if (_rs) window.__fuseRouterStore = _rs;
      }
      if (_rs && _rs.pathName != null) r.scene_route = String(_rs.pathName);
    } catch(e) {}

    // Map display name + game mode display name
    // BattleInfo_mapName is a flex div whose SimpleText_track children hold both strings.
    var _bi = document.querySelector('[class*="BattleInfo_mapName"]');
    if (_bi) {
      var _tracks = _bi.querySelectorAll('[class*="SimpleText_track"]');
      if (_tracks.length >= 1) r.sb_map_name       = (_tracks[0].textContent || '').trim() || null;
      if (_tracks.length >= 2) r.sb_game_mode_name  = (_tracks[1].textContent || '').trim() || null;
    }

    // Map slug: matchInfoModel lives on battle_app in this build (2026-10-15), not on battle_hud.
    try {
      if (typeof matchInfoModel !== 'undefined' && matchInfoModel && matchInfoModel.background) {
        var _bgm = String(matchInfoModel.background).match(/\/worlds\/([^/]+)\//);
        if (_bgm) r.map_slug = _bgm[1];
      }
    } catch(e) {}

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
    // __fusePmNormalize (composed from postmatch.js) preserves the FULL native
    // record: per-player stats, currencies/rewards, entitlements, coefs,
    // boosters, tokens and per-loadout stats, merged with tactical identity.
    // pm_players stays a flattened compat view; pm_result is the complete tree,
    // sent only on polls where the wrapper sets __FUSE_WANT_PM (first capture).
    try {
      var _pbs = (typeof postbattleScene !== 'undefined') ? postbattleScene : null;
      var _tm = (typeof tacticalInfoModel !== 'undefined') ? tacticalInfoModel : null;
      var _pm = __fusePmNormalize(_pbs && _pbs.results, _pbs && _pbs.topPlayers, _tm);
      if (_pm) {
        r.pm_available    = 1;
        r.pm_game_mode    = _pm.gameMode;
        r.pm_map_slug     = _pm.mapSlug;
        r.pm_started_at   = _pm.startedAt;
        r.pm_finished_at  = _pm.finishedAt;
        r.pm_battle_id    = _pm.battleId;
        r.pm_game_source  = _pm.gameSource;
        r.pm_my_player_id = _pm.myPlayerId;
        r.pm_my_team      = _pm.myTeam;
        r.pm_team_scores  = _pm.teamScores;
        r.pm_fingerprint  = String(_pm.battleId) + ':' + String(_pm.finishedAt);
        r.pm_players      = _pm.players.map(function(p) {
          var o = {};
          for (var k in (p.stats || {})) o[k] = p.stats[k];
          // playerId is the battle's slot number; profileId is the account, and
          // the only one of the two worth keeping past this battle.
          o.playerId = p.playerId; o.profileId = p.profileId; o.team = p.team;
          o.name = p.name; o.uniqueName = p.uniqueName; o.clanTag = p.clanTag;
          o.platform = p.platform; o.inputScheme = p.inputScheme;
          o.role = p.role; o.vehicleName = p.vehicleName; o.vehicleId = p.vehicleId;
          o.agentName = p.agentName; o.frontmanId = p.frontmanId; o.level = p.level;
          o.place = p.place;
          o.isBot = p.isBot; o.isPlayer = p.isPlayer;
          o.kills = p.kills; o.deaths = p.deaths; o.assists = p.assists;
          o.damage = p.damage; o.rolePoints = p.rolePoints;
          o.killConfirmed = p.killConfirmed; o.killDenied = p.killDenied;
          o.currenciesEarned = p.currenciesEarned;
          // {code: amount} for the battle's XP, level and skill-point rewards.
          o.entitlementsEarned = p.entitlementsEarned;
          // Which loadouts were played, ids only: the id is agent.vehicle.slot,
          // so vehicleId and frontmanId alone cannot name the slot. Per-loadout
          // stats stay in pm_result - this view is re-sent on every poll.
          o.loadouts = (p.loadouts || []).map(function(l) {
            return { loadoutId: l && l.loadoutId != null ? String(l.loadoutId) : null,
                     vehicleId: l && l.vehicleId != null ? l.vehicleId : null,
                     frontmanId: l && l.frontmanId != null ? l.frontmanId : null };
          });
          return o;
        });
        var _wantPm = (typeof __FUSE_WANT_PM === 'undefined') ? true : !!__FUSE_WANT_PM;
        if (_wantPm) r.pm_result = _pm;
      } else {
        r.pm_available = 0;
      }
    } catch(e) { r.pm_err = e.message; }

  } catch(e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
