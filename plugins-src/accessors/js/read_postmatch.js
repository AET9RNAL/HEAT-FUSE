// On-demand postmatch reader for fetchSnapshot("postmatch"). Works on either
// page: prefers battle_app's postbattleScene (with tactical enrichment), falls
// back to the hangar ctx's PostbattleStore, which keeps results after the
// battle page is gone. Requires common.js + postmatch.js composed before it.
(function () {
  try {
    var tm = typeof tacticalInfoModel !== "undefined" ? tacticalInfoModel : null;
    var pb = typeof postbattleScene !== "undefined" ? postbattleScene : null;
    var pm = pb && pb.results ? __fusePmNormalize(pb.results, pb.topPlayers, tm) : null;
    if (!pm) {
      var ctx = __fuseFindContext(function (v) {
        return v.PostbattleStore;
      });
      if (ctx && ctx.PostbattleStore) {
        pm = __fusePmNormalize(ctx.PostbattleStore.results, ctx.PostbattleStore.topPlayers, tm);
      }
    }
    return JSON.stringify(pm);
  } catch (e) {
    return JSON.stringify({ _err: e.message });
  }
})()
