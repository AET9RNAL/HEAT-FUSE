/*
 * Leaderboard Fix - page-side script for the meta page (coui://ui/build/meta/index.html).
 *
 * Makes the leaderboard column headers clickable: click to sort, click again to flip.
 * POSITION restores the server order.
 *
 * LeaderboardStore.allItems is a non-configurable MobX computed, so it can't be patched.
 * The sort happens one layer down, on the plain-Array deep copy the ModelExtension holds
 * (internalLeaderboard.internalValue.records); invalidate() then bumps internalIter and the
 * computed chain -> VM -> DOM re-renders. Rank is `index + 1` inside makeLeaderboardItem, so
 * the POSITION column renumbers with the sort.
 *
 * The arrow SVGs arrive as window.__fuseLbCfg (written by the plugin in the same evaluate);
 * the page can only load coui:// URLs, so the markup is inlined rather than fetched.
 *
 * Sizes are in rem, which in this UI is a 1080p design pixel.
 */
(function () {
  var CFG = window.__fuseLbCfg || {};
  var TAG = "__fuseLbFix";
  if (window[TAG] && window[TAG].dispose) window[TAG].dispose();

  function findCtx() {
    var roots = [document.querySelector('[class*="HangarView_view"]'), document.body];
    var test = function (o) { return o && typeof o === "object" && o.MetaServerDataStore && o.PlayModesStore; };
    var scan = function (o) {
      if (!o || typeof o !== "object") return null;
      try { if (test(o)) return o; } catch (e) {}
      var keys = Object.keys(o);
      for (var i = 0; i < keys.length; i++) {
        try { var v = o[keys[i]]; if (v && typeof v === "object" && test(v)) return v; } catch (e) {}
      }
      return null;
    };
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root) continue;
      var key = Object.keys(root).find(function (k) {
        return k.indexOf("__reactFiber$") === 0 || k.indexOf("__reactContainer$") === 0;
      });
      if (!key) continue;
      var f = root[key], hops = 0;
      while (f && hops < 300) {
        var hit = scan(f.memoizedProps) || scan(f.stateNode);
        var h = f.memoizedState, i = 0;
        while (h && i < 80 && !hit) { hit = scan(h.memoizedState); h = h.next; i++; }
        if (hit) return hit;
        f = f.return; hops++;
      }
    }
    return null;
  }

  var ctx = findCtx();
  if (!ctx || !ctx.LeaderboardStore) return "no-ctx";
  var store = ctx.LeaderboardStore;

  // Comparator keys mirror makeLeaderboardItem() so sorting matches the displayed values.
  var KEYS = {
    rank: null, // baseline (server) order
    account: function (r) { return r.account ? String(r.account.uniqueName || "").toLowerCase() : ""; },
    rating_token: function (r) { return +r.record.ratingToken || 0; },
    winRate: function (r) { return r.record.wins / (r.record.games || 1); },
    games: function (r) { return +r.record.games || 0; },
    killDeathRatio: function (r) { return r.record.frags / (r.record.deaths || 1); },
  };
  var DEFAULT_DIR = { rank: 1, account: 1, rating_token: -1, winRate: -1, games: -1, killDeathRatio: -1 };
  var HDR = "LeaderboardTableHeader_cell";
  var IND = "fuse-lbfix-ind";
  var STYLE_ID = "__fuse_lbfix__";

  var SVG = { "-1": String(CFG.downSvg || ""), "1": String(CFG.upSvg || "") };
  var ARROW = "rgba(248, 247, 246, 1)";
  var GAP = 8; // label -> arrow
  var LIFT = 12; // how far the active cell (label + decor frame) rises

  // Opens on the server order; the sort survives refetches and mode switches.
  var state = { col: "rank", dir: 1, baseline: [], lastValue: null };

  function records() {
    var v = store.internalLeaderboard && store.internalLeaderboard.internalValue;
    return v && Array.isArray(v.records) ? v.records : null;
  }
  function pid(r) { return r && r.account ? r.account.profileId : undefined; }

  function apply() {
    var rec = records();
    if (!rec || rec.length < 2) return;
    if (state.col === "rank") {
      var idx = new Map(state.baseline.map(function (id, i) { return [id, i]; }));
      var at = function (r) { var i = idx.get(pid(r)); return i === undefined ? 1e9 : i; };
      rec.sort(function (a, b) { return at(a) - at(b); });
      if (state.dir === -1) rec.reverse();
    } else {
      var k = KEYS[state.col];
      rec.sort(function (a, b) {
        var x = k(a), y = k(b);
        var c = typeof x === "string" ? (x < y ? -1 : x > y ? 1 : 0) : x - y;
        return state.dir < 0 ? -c : c;
      });
    }
    store.internalLeaderboard.invalidate();
  }

  // The label sits in SimpleText_container (flex row); the arrow is appended there so it
  // lands beside the text, not under it (LeaderboardTableHeader_text is flex column).
  var css =
    '[class*="' + HDR + '"] { cursor: pointer; }\n' +
    // Box metrics are set inline in paint(); Cohtml drops margin-left from this rule.
    "." + IND + " svg { width: 100%; height: 100%; display: block; }\n" +
    "." + IND + " path { fill: " + ARROW + " !important; }\n" +
    // Lift the whole active cell: the label and the decor frame ride along. The label
    // element itself can't be transformed - the engine rewrites its transform each tick.
    '[class*="' + HDR + '"][data-lbfix="1"] { transform: translateY(-' + LIFT + "rem) !important; }\n" +
    '[class*="' + HDR + '"][data-lbfix="1"] [class*="LeaderboardTableHeader_text"] { color: ' + ARROW + " !important; }\n";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function colOf(el) {
    var cn = typeof el.className === "string" ? el.className : "";
    var m = cn.match(/LeaderboardTableHeader_cell__(.+?)_[0-9a-f]{3,}(?:\s|$)/);
    return m ? m[1] : null;
  }

  function paint() {
    var cells = document.querySelectorAll('[class*="' + HDR + '"]');
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var col = colOf(cell);
      if (!col) continue;
      var sortable = KEYS.hasOwnProperty(col);
      cell.style.cursor = sortable ? "pointer" : "default";
      var active = sortable && col === state.col;
      cell.setAttribute("data-lbfix", active ? "1" : "0");
      var ind = cell.querySelector("." + IND);
      if (!active) {
        if (ind) ind.parentElement.removeChild(ind);
        continue;
      }
      if (!ind) {
        ind = document.createElement("div");
        ind.className = IND;
        // !important throughout: the page's reset beats plain inline styles here.
        ind.style.setProperty("flex", "0 0 auto", "important");
        ind.style.setProperty("align-self", "center", "important");
        ind.style.setProperty("width", "9rem", "important");
        ind.style.setProperty("height", "6rem", "important");
        ind.style.setProperty("margin-left", GAP + "rem", "important");
        // SimpleText_container is the flex row holding the label; the header text element
        // itself is a flex column, which is what put the arrow underneath the label.
        var host =
          cell.querySelector('[class*="SimpleText_container"]') ||
          cell.querySelector('[class*="LeaderboardTableHeader_text"]') ||
          cell;
        host.appendChild(ind);
      }
      var d = String(state.dir);
      if (ind.getAttribute("data-d") !== d || !ind.firstChild) {
        ind.setAttribute("data-d", d);
        ind.innerHTML = SVG[d] || "";
      }
    }
  }

  // Cohtml has no Element.closest(); climb by hand.
  function closestHeader(el) {
    while (el && el !== document) {
      var cn = typeof el.className === "string" ? el.className : "";
      if (cn.indexOf(HDR) >= 0) return el;
      el = el.parentElement;
    }
    return null;
  }

  function onClick(e) {
    var cell = closestHeader(e.target);
    if (!cell) return;
    var col = colOf(cell);
    if (!col || !KEYS.hasOwnProperty(col)) return;
    if (state.col === col) state.dir = -state.dir;
    else { state.col = col; state.dir = DEFAULT_DIR[col]; }
    apply();
    paint();
  }

  function tick() {
    var v = store.internalLeaderboard && store.internalLeaderboard.internalValue;
    if (v !== state.lastValue) {
      // New dataset: mode switch, refetch, or first run. It arrives in server order.
      state.lastValue = v;
      var rec = records();
      state.baseline = rec ? rec.map(pid) : [];
      if (state.col !== "rank" || state.dir !== 1) apply(); // re-apply the active sort
    }
    if (document.querySelector('[class*="' + HDR + '"]')) { installStyle(); paint(); }
  }

  document.addEventListener("click", onClick, true);
  var timer = window.setInterval(tick, 500);
  tick();

  window[TAG] = {
    sig: String(CFG.sig || ""),
    state: state,
    sort: function (col, dir) {
      if (!KEYS.hasOwnProperty(col)) return "unknown column: " + col;
      state.col = col;
      state.dir = dir === undefined ? DEFAULT_DIR[col] : dir;
      apply();
      paint();
      return state.col + " " + (state.dir < 0 ? "desc" : "asc");
    },
    dispose: function () {
      window.clearInterval(timer);
      document.removeEventListener("click", onClick, true);
      state.col = "rank";
      state.dir = 1;
      apply();
      var inds = document.querySelectorAll("." + IND);
      for (var i = 0; i < inds.length; i++) inds[i].parentElement.removeChild(inds[i]);
      var cells = document.querySelectorAll('[class*="' + HDR + '"]');
      for (var j = 0; j < cells.length; j++) {
        cells[j].removeAttribute("data-lbfix");
        cells[j].style.cursor = "";
      }
      var s = document.getElementById(STYLE_ID);
      if (s) s.parentElement.removeChild(s);
      window[TAG] = null;
    },
  };
  return "installed:" + (records() || []).length;
})();
