// Shared in-page helpers for Accessors reader scripts.
// These are `var`/`function` declarations concatenated INSIDE the composed eval
// wrapper by Accessors.compose(), so every reader shares this scope and nothing
// is left behind on window. They are not valid standalone - always composed.

// Coerce Gameface BigInt and proxy numbers to plain JSON-safe values.
// BigInt beyond the safe-integer range becomes a lossless decimal STRING so
// opaque 64-bit IDs (gameSource, profileId, ...) are never silently truncated.
var __fuseNum = function (v) {
  if (typeof v === "bigint") {
    var n = Number(v);
    return n <= Number.MAX_SAFE_INTEGER && n >= -Number.MAX_SAFE_INTEGER ? n : String(v);
  }
  return v;
};

// An account id, or null. The game reports 0 for a bot and for any record it
// has no account behind; stored as 0 it would read as one shared identity for
// every one of them, which is what a tag would then follow.
var __fuseAccountId = function (v) {
  if (v == null) return null;
  var n = __fuseNum(v);
  if (n === 0 || n === "0" || n === "") return null;
  return n;
};

// Gameface native arrays are often proxy objects: .length works and numeric
// indexing works, but Array.isArray() is false. Detect those too.
var __fuseIsArr = function (v) {
  return (
    !!v &&
    typeof v === "object" &&
    typeof v.length === "number" &&
    (Array.isArray(v) || typeof v.filter === "function" || typeof v.item === "function")
  );
};

// Copy a native/JS array-like into a real Array so JSON.stringify sees elements.
var __fuseArr = function (v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.slice();
  if (typeof v.length === "number") {
    var out = [];
    for (var i = 0; i < v.length; i++) {
      try {
        out.push(v[i]);
      } catch (e) {
        out.push(null);
      }
    }
    return out;
  }
  return [];
};

// Deep-copy a native model into plain JSON-safe data: BigInt -> Number,
// array-likes -> Array, proxies -> plain objects, functions dropped,
// getters that throw -> {"__error": msg}, circular refs -> null.
// Values under keys matching sensitive patterns are dropped entirely.
var __fuseDenied = /password|secret|credential|authorization|accessToken|refreshToken|sessionToken|authToken/i;
var __fuseDeep = function deep(v, depth, stack) {
  if (v === null || v === undefined) return null;
  var t = typeof v;
  if (t === "bigint") return __fuseNum(v);
  if (t === "number" || t === "string" || t === "boolean") return v;
  if (t === "function") return undefined;
  if (depth <= 0) return null;
  stack = stack || [];
  if (stack.indexOf(v) >= 0) return null;
  var next = stack.concat([v]);
  var i, k;
  if (__fuseIsArr(v)) {
    var a = [];
    var n = Math.min(v.length, 2048);
    for (i = 0; i < n; i++) {
      try {
        a.push(deep(v[i], depth - 1, next));
      } catch (e) {
        a.push(null);
      }
    }
    return a;
  }
  var o = {};
  var keys;
  try {
    keys = Object.keys(v);
  } catch (e) {
    return null;
  }
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (__fuseDenied.test(k)) continue;
    var d;
    try {
      d = deep(v[k], depth - 1, next);
    } catch (e) {
      d = { __error: String(e && e.message ? e.message : e) };
    }
    if (d !== undefined) o[k] = d;
  }
  return o;
};

// Read-only React fiber walk that recovers the app's context object (the `ctx`
// bag of MobX stores) from a mounted DOM node. Same algorithm the catalog tool
// uses: examines props, state nodes and hook values; patches nothing.
// Default predicate matches the hangar ctx; pass a predicate for other bags
// (e.g. controllers or the battle_app ctx, which also carries PostbattleStore).
function __fuseFindContext(predicate) {
  var roots = document.querySelectorAll("#root, body > div, [class]");
  var seen = typeof Set !== "undefined" ? new Set() : [];
  var seenHas = function (f) {
    return seen.add ? seen.has(f) : seen.indexOf(f) >= 0;
  };
  var seenAdd = function (f) {
    if (seen.add) seen.add(f);
    else seen.push(f);
  };
  function check(v) {
    return v && typeof v === "object" && (predicate ? predicate(v) : v.AccountStore && v.VehiclesStore) ? v : null;
  }
  for (var i = 0; i < roots.length; i++) {
    var keys = Object.keys(roots[i]);
    var key = null;
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].indexOf("__reactFiber$") === 0) {
        key = keys[j];
        break;
      }
    }
    var f = key && roots[i][key];
    for (var n = 0; f && n < 900 && !seenHas(f); n++, f = f.return) {
      seenAdd(f);
      var candidates = [f.memoizedProps, f.stateNode];
      for (var c = 0; c < candidates.length; c++) {
        var o = candidates[c];
        if (!o || typeof o !== "object") continue;
        if (check(o)) return o;
        var ok = Object.keys(o);
        for (var k = 0; k < ok.length; k++) {
          var d = Object.getOwnPropertyDescriptor(o, ok[k]);
          if (d && "value" in d && check(d.value)) return d.value;
        }
      }
      for (var h = f.memoizedState, q = 0; h && q < 60; h = h.next, q++) {
        var m = h.memoizedState;
        if (check(m)) return m;
        if (m && check(m.current)) return m.current;
        if (m && check(m.ctx)) return m.ctx;
      }
    }
  }
  return null;
}
