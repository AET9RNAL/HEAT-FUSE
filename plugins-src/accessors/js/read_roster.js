// On-demand tactical roster reader for fetchSnapshot("roster"). Works on
// battle_app or battle_hud - both expose tacticalInfoModel. Requires common.js.
(function () {
  try {
    var tm = typeof tacticalInfoModel !== "undefined" ? tacticalInfoModel : null;
    if (!tm || !tm.players) return JSON.stringify(null);
    return JSON.stringify({
      players: __fuseDeep(__fuseArr(tm.players), 8),
      me: __fuseDeep(tm.currentPlayer, 8),
      teams: __fuseDeep(__fuseArr(tm.teams), 6),
      is_free: tm.isFree ? 1 : 0,
    });
  } catch (e) {
    return JSON.stringify({ _err: e.message });
  }
})()
