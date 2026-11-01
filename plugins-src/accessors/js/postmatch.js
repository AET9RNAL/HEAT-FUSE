// Shared postmatch normalizer for Accessors reader scripts.
// Composed inside the eval wrapper after common.js; defines __fusePmNormalize.
//
// __fusePmNormalize(results, topPlayers, tactical)
//   results    - postbattleScene.results OR ctx.PostbattleStore.results (same shape)
//   topPlayers - postbattleScene.topPlayers (scene-level sibling), may be null
//   tactical   - tacticalInfoModel for last-live enrichment, may be null
//
// Returns a plain JSON-safe object preserving the full native result tree
// (per-player stats, rewards, entitlements, coefs, per-loadout stats) plus
// convenience fields merged from tactical/playerInfo. Returns null when the
// results object is absent or still the empty initial template.

function __fusePmNormalize(results, topPlayers, tactical) {
  if (!results || typeof results !== "object") return null;
  var common = results.common;
  if (!common || !common.gameMode || !common.teams) return null;

  var num = __fuseNum, arr = __fuseArr, deep = __fuseDeep;

  // Last-live identity keyed by playerId from tacticalInfoModel.
  var idm = {};
  if (tactical && tactical.players) {
    var tps = arr(tactical.players);
    for (var i = 0; i < tps.length; i++) {
      var tp = tps[i];
      if (!tp) continue;
      var ac = tp.account || {};
      idm[tp.playerId] = {
        name: tp.userName || ac.uniqueName || ac.displayName || "",
        // The account id. playerId is a per-battle slot number and means nothing
        // in the next battle, so anything that follows a player uses this.
        // The model carries it top-level as well as on `account`, and reports 0
        // for a bot - which is not an id, and must not be mistaken for one.
        profileId: __fuseAccountId(tp.profileId) || __fuseAccountId(ac.profileId),
        uniqueName: ac.uniqueName || "",
        clanTag: ac.clanTag || "",
        platform: ac.platform != null ? ac.platform : null,
        inputScheme: ac.inputScheme != null ? ac.inputScheme : null,
        role: tp.role != null ? tp.role : null,
        vehicleName: tp.vehicleName != null ? tp.vehicleName : null,
        vehicleId: tp.vehicleId != null ? num(tp.vehicleId) : null,
        agentName: tp.agentName != null ? tp.agentName : null,
        level: tp.level != null ? num(tp.level) : null,
        place: tp.place != null ? num(tp.place) : null,
        isBot: tp.isBot ? 1 : 0,
        isPlayer: tp.isPlayer ? 1 : 0,
        isOffline: tp.isOffline ? 1 : 0,
        kills: num(tp.kills),
        deaths: num(tp.deaths),
        assists: num(tp.assists),
        damage: num(tp.damage),
        killConfirmed: num(tp.killConfirmed),
        killDenied: num(tp.killDenied),
        rolePoints: num(tp.rolePoints),
        platoonNumber: tp.platoonNumber != null ? num(tp.platoonNumber) : 0,
      };
    }
  }

  var players = [];
  var teamScores = {};
  var teams = [];
  var teamList = arr(common.teams);
  for (var t = 0; t < teamList.length; t++) {
    var te = teamList[t];
    if (!te) continue;
    var tps2 = te.players || {};
    var teamNo = null;
    for (var pid in tps2) {
      var pr = tps2[pid];
      if (!pr || typeof pr !== "object") continue;
      var st = pr.stats || {};
      var pi = pr.playerInfo || {};
      var piac = pi.account || {};
      if (pi.team != null) teamNo = num(pi.team);
      var idn = idm[pid] || {};

      // Reward records: {code, initial, amount}. Live-verified semantics:
      // `initial` is the balance/XP before this battle's rewards, `amount` is
      // the earned delta (vehicle XP: 373949 + 2115 = post-battle 376064).
      var curs = arr(pr.currencies);
      var earned = {};
      for (var ci = 0; ci < curs.length; ci++) {
        var cu = curs[ci];
        if (!cu || cu.code == null) continue;
        earned[cu.code] = cu.amount != null ? Number(num(cu.amount)) : 0;
      }
      // Same {code, initial, amount} shape for XP/level/skill-point rewards.
      var entList = arr(pr.entitlements);
      var entEarned = {};
      for (var ei = 0; ei < entList.length; ei++) {
        var en = entList[ei];
        if (!en || en.code == null) continue;
        entEarned[en.code] = en.amount != null ? Number(num(en.amount)) : 0;
      }

      // Loadouts carry per-loadout stats: keep the whole records.
      var los = arr(pr.loadouts);
      var firstLo = los.length ? los[0] : null;

      var rec = {
        playerId: num(pr.playerId != null ? pr.playerId : pi.playerId != null ? pi.playerId : parseInt(pid, 10)),
        team: num(pi.team),
        // Full native records, lossless.
        playerInfo: deep(pi, 8),
        stats: deep(st, 4),
        currencies: deep(curs, 4),
        entitlements: deep(pr.entitlements, 4),
        currenciesCoefs: deep(pr.currenciesCoefs, 4),
        entitlementsCoefs: deep(pr.entitlementsCoefs, 4),
        boosters: deep(pr.boosters, 4),
        tokens: deep(pr.tokens, 4),
        loadouts: deep(los, 8),
        // Convenience fields: tactical last-live first, result-native fallback.
        name: idn.name || piac.displayName || piac.uniqueName || "",
        // playerId above is the battle's own slot number; this is the account.
        // Falsy, not null: the tactical model hands back 0 for anyone it has no
        // account for, and a 0 here would outrank the real id in the results.
        profileId: idn.profileId || __fuseAccountId(piac.profileId),
        uniqueName: idn.uniqueName || piac.uniqueName || "",
        clanTag: idn.clanTag || piac.clanTag || "",
        platform: idn.platform != null ? idn.platform : piac.platform != null ? piac.platform : null,
        inputScheme: idn.inputScheme != null ? idn.inputScheme : piac.inputScheme != null ? piac.inputScheme : null,
        crossplayEnabled:
          piac.crossplayEnabled != null ? (piac.crossplayEnabled ? 1 : 0) : null,
        role: idn.role != null ? idn.role : null,
        vehicleName: idn.vehicleName != null ? idn.vehicleName : null,
        vehicleId:
          idn.vehicleId != null
            ? idn.vehicleId
            : firstLo && firstLo.vehicleId != null
              ? num(firstLo.vehicleId)
              : null,
        agentName: idn.agentName != null ? idn.agentName : null,
        frontmanId: firstLo && firstLo.frontmanId != null ? num(firstLo.frontmanId) : null,
        level: idn.level != null ? idn.level : null,
        place: idn.place != null ? idn.place : null,
        isBot: idn.isBot != null ? idn.isBot : 0,
        isPlayer: idn.isPlayer != null ? idn.isPlayer : 0,
        isOffline: idn.isOffline != null ? idn.isOffline : 0,
        platoonNumber: idn.platoonNumber != null ? idn.platoonNumber : pi.platoonNumber != null ? num(pi.platoonNumber) : 0,
        // Aggregate counters: stats first (authoritative final), tactical as fallback.
        kills: num(st.frags != null ? st.frags : idn.kills),
        deaths: num(st.deaths != null ? st.deaths : idn.deaths),
        assists: num(st.killAssist != null ? st.killAssist : idn.assists),
        damage: num(st.damage != null ? st.damage : idn.damage),
        killConfirmed: num(st.killConfirmed != null ? st.killConfirmed : idn.killConfirmed),
        killDenied: num(st.killDenied != null ? st.killDenied : idn.killDenied),
        rolePoints: num(st.rolePoints != null ? st.rolePoints : idn.rolePoints),
        currenciesEarned: earned,
        entitlementsEarned: entEarned,
      };
      players.push(rec);
    }
    if (teamNo != null) teamScores[teamNo] = num(te.score);
    teams.push({
      team: teamNo,
      score: num(te.score),
      finishReason: te.finishReason != null ? num(te.finishReason) : null,
      finishType: te.finishType != null ? num(te.finishType) : null,
    });
  }

  var bw = String(common.battleWorld || "");
  var mslug = bw.match(/\/worlds\/(.+?)\.world/) || bw.match(/\/worlds\/([^/]+)/);

  // myTeam is a team NUMBER, the same thing every player's `team` holds (1/2).
  // battleTeamIndex is not one: it is a zero-based index into common.teams.
  // Using it directly put the local player on "team 0", which matches no
  // player - every player became an enemy and the local team's score was read
  // as the enemy's, turning a 2000-1325 win into a loss.
  var myPlayerId = results.battlePlayerId != null ? num(results.battlePlayerId) : null;
  var myTeam = null;
  for (var mi = 0; mi < players.length; mi++) {
    if (myPlayerId != null && players[mi].playerId === myPlayerId && players[mi].team != null) {
      myTeam = players[mi].team;
      break;
    }
  }
  if (myTeam == null && results.battleTeamIndex != null) {
    var byIndex = teams[num(results.battleTeamIndex)];
    if (byIndex && byIndex.team != null) myTeam = byIndex.team;
  }
  if (myTeam == null && tactical && tactical.currentPlayer && tactical.currentPlayer.team != null) {
    myTeam = num(tactical.currentPlayer.team);
  }

  // battleId is `plugin_cw_meta_protocol::UUID`, a native handle: no own
  // properties, nothing on its prototype but `constructor`, JSON "{}",
  // String() "[object Object]", and no toJSON/valueOf. The game's own scripts
  // never convert one either - the UI never shows a battle id - so there is
  // nothing to read on the JS side. Emitted only if a build ever makes it a
  // scalar; null meanwhile, which costs nothing: the client keys battles by
  // its own session_id and the server dedupes on content_fingerprint, neither
  // of which touches this. Re-probe only if the engine starts binding it.
  var bid = results.battleId != null ? results.battleId : common.battleId;
  var bidStr =
    typeof bid === "string" ? bid : typeof bid === "number" || typeof bid === "bigint" ? String(num(bid)) : null;

  return {
    battleId: bidStr,
    gameMode: num(common.gameMode),
    gameSource: common.gameSource != null ? num(common.gameSource) : null,
    battleWorld: common.battleWorld != null ? common.battleWorld : null,
    mapSlug: mslug ? mslug[1] : null,
    startedAt: num(common.startedAt),
    finishedAt: num(common.finishedAt),
    myPlayerId: myPlayerId,
    myTeam: myTeam,
    teamScores: teamScores,
    teams: teams,
    topPlayers: deep(arr(topPlayers), 6),
    players: players,
  };
}
