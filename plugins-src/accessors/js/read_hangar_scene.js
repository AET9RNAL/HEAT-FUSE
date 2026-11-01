(function() {
  // Every poll: route and queue flag. Store references are cached on the page, because the fiber walk is not free.
  var r = {};
  try {
    var svc = window.__fuseHangarSvc;
    if (!svc || !svc.RouterStore) {
      svc = __fuseFindContext(function(v) { return v && v.RouterStore && v.ModalStore; });
      if (svc) window.__fuseHangarSvc = svc;
    }
    var ctx = window.__fuseHangarCtx;
    if (!ctx || !ctx.PlatoonStore) {
      ctx = __fuseFindContext(function(v) { return v && v.AccountStore && v.PlatoonStore; });
      if (ctx) window.__fuseHangarCtx = ctx;
    }
    if (svc && svc.RouterStore && svc.RouterStore.pathName != null) r.route = String(svc.RouterStore.pathName);
    // The game's own isMatchmakerQueueActive: the platoon's flag in a platoon, the player's own otherwise.
    if (ctx && ctx.PlatoonStore) {
      var _members = ctx.PlatoonStore.members;
      var _platoon = _members && _members.length > 0;
      var _q = _platoon ? ctx.PlatoonStore.isInMatchmaker : (ctx.UserStore && ctx.UserStore.inMatchmakerQueue);
      r.queued = _q ? 1 : 0;
    }
  } catch (e) {
    r._err = e.message;
  }
  return JSON.stringify(r);
})()
