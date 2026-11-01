/*
 * HEAT Stats HS Block - page-side script for the hangar page (meta).
 *
 * PLAY in a matchmaking mode is held while a blocked player is online and not in a match.
 * Presence comes from the game's player search, a store shared with the friend and squad search panels.
 * The queue's methods are non-configurable MobX getters, so the hold is a capture-phase click listener.
 * A gamepad press skips the DOM and is not held.
 *
 *   window.__fuseBlockCfg      - written by the plugin: labels, logo, players
 *   window.__fuseBlock.take()  - drained by the plugin: events since last call
 */
(function () {
  var CFG = window.__fuseBlockCfg || {};
  var TAG = "__fuseBlock";
  if (window[TAG] && window[TAG].dispose) window[TAG].dispose();

  var L = CFG.labels || {};
  var LOGO = CFG.logo || "";

  var BUTTON_SEL = '[data-test-id="BaseCampDefaultPlayButton"]';
  var SEARCH_UI_SEL = '[class*="PlayerSearchForm_base"], [class*="MemberSearch_base"]';
  var STYLE_ID = "__fuse_block__";
  var ROOT_ATTR = "data-fuse-block";
  var PANEL = "fuse-block";

  var CHECK_EVERY_MS = 5000;
  /** Faster while a held queue waits to resume. */
  var ARMED_EVERY_MS = 8000;
  /** Older presence is checked again before a click is judged. */
  var FRESH_MS = 30000;
  var SEARCH_TIMEOUT_MS = 4000;
  var SLIDE_MS = 240;
  var CUT_REM = 10;
  var BAR_REM = 2;
  var FILL = "rgba(10,11,10,0.94)";

  var RED = "#FF6D46";
  var RED_DARK = "#99371C";
  var RED_LIGHT = "#FFBCAA";
  var ACCENT = "#8FFFB8";
  var GREY_600 = "#525252";
  var GREY_200 = "#B3B3B3";
  var GREY_50 = "#F2F2F2";
  var INK = "#0A0B0A";

  var players = [];
  var resume = false;
  /** pid -> {online, inArena, at} or {missing: true, at} */
  var seen = {};
  var held = false;
  var checking = false;
  var running = false;
  var waiters = [];
  var lastCycle = 0;
  var pending = [];
  var lastError = "";
  var panel = null;
  var hideTimer = 0;
  var ctxCache = null;
  var ctlCache = null;

  // ── The app's stores ────────────────────────────────────────────────
  /** Climbs React fibers until an object passes `test`. Read only. */
  function findBag(test) {
    var roots = document.querySelectorAll("#root, body > div, [class]");
    var visited = new Set();
    function check(v) {
      try { return v && typeof v === "object" && test(v) ? v : null; } catch (e) { return null; }
    }
    for (var i = 0; i < roots.length; i++) {
      var keys = Object.keys(roots[i]);
      var key = null;
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].indexOf("__reactFiber$") === 0) { key = keys[j]; break; }
      }
      for (var f = key && roots[i][key], n = 0; f && n < 900 && !visited.has(f); n++, f = f.return) {
        visited.add(f);
        var cands = [f.memoizedProps, f.stateNode];
        for (var c = 0; c < cands.length; c++) {
          var o = cands[c];
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
          var hit = check(m) || (m && (check(m.current) || check(m.ctx)));
          if (hit) return hit;
        }
      }
    }
    return null;
  }

  /** A failed walk waits 3 s before the next one: it reads every node on the page. */
  var lastFind = 0;
  function bags() {
    if ((ctxCache && ctlCache) || Date.now() - lastFind < 3000) return;
    lastFind = Date.now();
    if (!ctxCache) ctxCache = findBag(function (v) { return v.AccountSearchStore && v.UserStore && v.PlayModesStore; });
    if (!ctlCache) ctlCache = findBag(function (v) { return v.PlayModeController && v.AccountSearchController; });
  }

  function stores() {
    bags();
    return ctxCache;
  }

  function controllers() {
    bags();
    return ctlCache;
  }

  function queueActive() {
    var c = controllers();
    return !!(c && c.PlayModeController.isMatchmakerQueueActive);
  }

  function inArena() {
    var s = stores();
    return !!(s && s.UserStore.inArena);
  }

  /** Only a matchmaking queue can put you with a stranger. The firing range, practice and custom games pass. */
  function guarding() {
    if (!players.length) return false;
    var s = stores();
    var c = controllers();
    if (!s || !c) return false;
    var pmc = c.PlayModeController;
    if (s.UserStore.inArena || pmc.isMatchmakerQueueActive || pmc.isPlatoonMember) return false;
    var mode = s.PlayModesStore.playModeMap.getUnsafe(s.UserStore.playMode);
    return !!(mode && mode.isMatchmakerMode);
  }

  // ── Presence ────────────────────────────────────────────────────────
  function baseName(name) {
    return String(name || "").split("#")[0].trim();
  }

  function searchUiOpen() {
    return !!document.querySelector(SEARCH_UI_SEL);
  }

  /** The accounts the game finds for `name`, or null when the search fails. */
  function search(name, done) {
    var s = stores();
    var store = s && s.AccountSearchStore;
    if (!store) return done(null);
    var started = Date.now();
    var sent = false;
    store.performSearchQuery("");
    (function poll() {
      var v;
      try { v = store.searchData.value; } catch (e) { return done(null); }
      if (!sent) {
        if (v.sentQuery === "" || Date.now() - started > 500) {
          sent = true;
          store.performSearchQuery(name);
        }
      } else if (v.status === 2 && v.sentQuery === name) {
        return done(Array.from(v.accounts || []));
      }
      if (Date.now() - started > SEARCH_TIMEOUT_MS) return done(null);
      setTimeout(poll, 50);
    })();
  }

  /** The search is fuzzy, so the hit must carry the tagged profile id or the full nickname. */
  function pick(accounts, p) {
    for (var i = 0; i < accounts.length; i++) if (String(accounts[i].profileId) === p.pid) return accounts[i];
    for (var j = 0; j < accounts.length; j++) if (p.name && accounts[j].uniqueName === p.name) return accounts[j];
    return null;
  }

  /** Searches every blocked player in turn. `done` runs when the round ends. */
  function cycle(done) {
    if (done) waiters.push(done);
    if (running) return;
    var finish = function () {
      running = false;
      lastCycle = Date.now();
      var s = stores();
      // Leaves the shared store idle, unless a game panel took it over meanwhile.
      if (s && !searchUiOpen()) s.AccountSearchStore.performSearchQuery("");
      afterCycle();
      var list = waiters;
      waiters = [];
      for (var w = 0; w < list.length; w++) list[w]();
    };
    if (!players.length || !stores() || searchUiOpen()) return finish();
    running = true;
    var list = players.slice();
    var i = 0;
    (function next() {
      if (i >= list.length || searchUiOpen()) return finish();
      var p = list[i++];
      var name = baseName(p.name);
      if (!name) return next();
      search(name, function (accounts) {
        if (accounts) {
          var a = pick(accounts, p);
          seen[p.pid] = a
            ? { online: !!a.meta.online, inArena: !!a.meta.inArena, at: Date.now() }
            : { missing: true, at: Date.now() };
        }
        setTimeout(next, 250);
      });
    })();
  }

  /** Blocked players who are online and not in a match: they can be in your queue. */
  function risky() {
    var out = [];
    for (var i = 0; i < players.length; i++) {
      var st = seen[players[i].pid];
      if (st && !st.missing && st.online && !st.inArena) out.push(players[i]);
    }
    return out;
  }

  /** A player without a nickname cannot be searched and does not hold a check. */
  function fresh() {
    var now = Date.now();
    for (var i = 0; i < players.length; i++) {
      if (!baseName(players[i].name)) continue;
      var st = seen[players[i].pid];
      if (!st || now - st.at > FRESH_MS) return false;
    }
    return true;
  }

  function afterCycle() {
    if (!held) return;
    if (!guarding()) return release();
    if (risky().length) return render();
    var auto = resume;
    release();
    if (auto) {
      pending.push({ kind: "resumed", at: Date.now() });
      press();
    }
  }

  /** Starts the queue the way PLAY does. goBattle() cancels a running queue, so it is checked first. */
  function press() {
    var c = controllers();
    if (!c || inArena() || queueActive()) return;
    var b = button();
    if (b && disabled(b)) return;
    c.PlayModeController.goBattle();
  }

  // ── The button and the panel ────────────────────────────────────────
  function button() {
    return document.querySelector(BUTTON_SEL);
  }

  function disabled(b) {
    return String(b.className || "").indexOf("StyledButton_base__disabled") >= 0;
  }

  var FONT = '"Normalidad Compact", "Noto Sans", sans-serif';
  var FONT_WIDE = '"Normalidad Extended", "Noto Sans", sans-serif';
  var PB = "html[" + ROOT_ATTR + "] " + BUTTON_SEL;
  var css =
    // The button: its fill is a masked span the game colours inline, so it takes !important.
    PB + ' [class*="PlayButtonTemplate_mask_"] { background-color: ' + RED + " !important; }\n" +
    PB + ':hover [class*="PlayButtonTemplate_mask_"] { background-color: ' + RED_LIGHT + " !important; }\n" +
    PB + ' [class*="PlayButtonTemplate_icon_"] { background-color: ' + RED_DARK + " !important; }\n" +
    // The panel: a clip box under the button, and a sheet that slides out of it.
    "." + PANEL + " { position: fixed !important; z-index: 9999 !important; overflow: hidden !important;" +
    " pointer-events: auto !important; }\n" +
    "." + PANEL + "-sheet { position: relative !important; display: flex !important; flex-direction: column !important;" +
    " padding: " + (8 + BAR_REM) + "rem 12rem 9rem 12rem !important; transform: translateY(-100%) !important;" +
    " transition: transform " + SLIDE_MS + "ms cubic-bezier(0.22, 1, 0.36, 1) !important; }\n" +
    "." + PANEL + ".open ." + PANEL + "-sheet { transform: translateY(0) !important; }\n" +
    // Positioned, so the rows paint over the fill, which is positioned too and comes first.
    "." + PANEL + "-sheet > * { position: relative !important; }\n" +
    // No corner-shape or clip-path here: the fill is an SVG path drawn at the sheet's measured size.
    "." + PANEL + "-sheet > ." + PANEL + "-fill { position: absolute !important; left: 0 !important; top: 0 !important; }\n" +
    "." + PANEL + "-head { display: flex !important; flex-direction: row !important; align-items: center !important;" +
    " height: 12rem !important; }\n" +
    "." + PANEL + "-logo { display: flex !important; width: 20rem !important; height: 10rem !important;" +
    " margin-right: 6rem !important; }\n" +
    "." + PANEL + "-logo svg { width: 20rem !important; height: 10rem !important; }\n" +
    // The title fills the row: this engine ignores `margin-left: auto`, so it pushes the readout right.
    "." + PANEL + "-title { flex: 1 1 auto !important; font-family: " + FONT_WIDE + " !important; font-size: 10rem !important;" +
    " letter-spacing: 0.14em !important; color: " + RED + " !important; line-height: 12rem !important; }\n" +
    // The readout: who holds the queue, and where they are.
    "." + PANEL + "-who { flex: 0 0 auto !important; margin-left: 12rem !important; display: flex !important;" +
    " flex-direction: row !important; align-items: center !important; max-width: 200rem !important; }\n" +
    "." + PANEL + "-name { font-family: " + FONT + " !important; font-size: 10rem !important;" +
    " color: " + GREY_50 + " !important; white-space: nowrap !important; overflow: hidden !important;" +
    " text-overflow: ellipsis !important; max-width: 100rem !important; line-height: 12rem !important; }\n" +
    "." + PANEL + "-state { margin-left: 6rem !important; padding: 0 4rem !important; font-family: " + FONT_WIDE +
    " !important; font-size: 8rem !important; letter-spacing: 0.1em !important; line-height: 12rem !important;" +
    " color: " + INK + " !important; background-color: " + RED_LIGHT + " !important; white-space: nowrap !important; }\n" +
    "." + PANEL + "-msg { margin-top: 6rem !important; font-family: " + FONT + " !important; font-size: 12rem !important;" +
    " line-height: 15rem !important; color: " + GREY_50 + " !important; }\n" +
    // The toggle: the FUSE inspector's check box, a 16rem box with two corners cut.
    "." + PANEL + "-toggle { margin-top: 8rem !important; display: flex !important; flex-direction: row !important;" +
    " align-items: center !important; cursor: pointer !important; }\n" +
    "." + PANEL + "-box { position: relative !important; flex: 0 0 auto !important; width: 16rem !important;" +
    " height: 16rem !important; margin-right: 8rem !important; }\n" +
    "." + PANEL + "-box svg { position: absolute !important; left: 0 !important; top: 0 !important;" +
    " width: 16rem !important; height: 16rem !important; }\n" +
    "." + PANEL + "-box .on { opacity: 0 !important; transition: opacity 120ms ease-out !important; }\n" +
    "." + PANEL + "-check { position: absolute !important; left: 2rem !important; top: 4rem !important;" +
    " width: 12rem !important; height: 8rem !important; display: flex !important; opacity: 0 !important;" +
    " transform: scale(0.5) !important; transition: opacity 160ms ease-out, transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1) !important; }\n" +
    "." + PANEL + "-check svg { width: 12rem !important; height: 8rem !important; }\n" +
    "." + PANEL + "-toggle[data-on] .on { opacity: 1 !important; }\n" +
    "." + PANEL + "-toggle[data-on] ." + PANEL + "-check { opacity: 1 !important; transform: scale(1) !important; }\n" +
    "." + PANEL + "-label { font-family: " + FONT + " !important; font-size: 12rem !important; line-height: 16rem !important;" +
    " color: " + GREY_200 + " !important; }\n" +
    "." + PANEL + "-toggle:hover ." + PANEL + "-label { color: " + GREY_50 + " !important; }\n" +
    "." + PANEL + "-toggle:hover .off path { stroke: " + GREY_200 + " !important; }\n" +
    "." + PANEL + "-hint { margin-top: 4rem !important; font-family: " + FONT + " !important; font-size: 10rem !important;" +
    " line-height: 12rem !important; color: " + GREY_200 + " !important; }\n";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  /** The check box frame with its top-left and bottom-right corners cut, as `corner-shape: bevel` draws it. */
  function boxFrame(cls, fill, stroke) {
    return (
      '<svg class="' + cls + '" viewBox="0 0 16 16"><path d="M5 0.5 H15.5 V11 L11 15.5 H0.5 V5 Z" fill="' + fill +
      '" stroke="' + stroke + '" stroke-width="1" /></svg>'
    );
  }

  var CHECK_PATH =
    "M18.4194 0.291349L9.4699 9.24083L5.58062 5.35156C5.19585 4.96678 4.56747 4.96678 4.1827 5.35156L4 5.53426" +
    "L8.58685 10.1211L8.76955 10.3038C9.15433 10.6886 9.7827 10.6886 10.1675 10.3038L20 0.47128L19.8173 0.288581" +
    "C19.4325 -0.0961938 18.8042 -0.0961938 18.4194 0.288581V0.291349Z";

  function build() {
    var el = document.createElement("div");
    el.className = PANEL;
    el.innerHTML =
      '<div class="' + PANEL + '-sheet">' +
      '<span class="' + PANEL + '-fill"></span>' +
      '<div class="' + PANEL + '-head">' +
      '<span class="' + PANEL + '-logo">' + LOGO + "</span>" +
      '<span class="' + PANEL + '-title"></span>' +
      '<span class="' + PANEL + '-who"><span class="' + PANEL + '-name"></span><span class="' + PANEL + '-state"></span></span>' +
      "</div>" +
      '<div class="' + PANEL + '-msg"></div>' +
      '<div class="' + PANEL + '-toggle">' +
      '<span class="' + PANEL + '-box">' +
      boxFrame("off", "rgba(0,0,0,0.6)", GREY_600) +
      boxFrame("on", ACCENT, ACCENT) +
      '<span class="' + PANEL + '-check"><svg viewBox="4 0 16 11"><path d="' + CHECK_PATH + '" fill="' + INK + '" /></svg></span>' +
      "</span>" +
      '<span class="' + PANEL + '-label"></span>' +
      "</div>" +
      '<div class="' + PANEL + '-hint"></div>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function part(name) {
    return panel ? panel.querySelector("." + PANEL + "-" + name) : null;
  }

  function setText(name, text) {
    var el = part(name);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function fill(template, params) {
    return String(template || "").replace(/\{(\w+)\}/g, function (m, k) { return params[k] !== undefined ? String(params[k]) : m; });
  }

  function render() {
    if (!panel) return;
    var risk = risky();
    setText("title", L.title || "HS BLOCK");
    setText("name", risk.length === 1 ? baseName(risk[0].name) : fill(L.players, { count: risk.length }));
    setText("state", L.inHangar || "");
    setText("msg", L.stopped || "");
    setText("label", L.resume || "");
    setText("hint", resume ? L.waiting || "" : L.override || "");
    var toggle = part("toggle");
    if (toggle) {
      if (resume) toggle.setAttribute("data-on", "1");
      else toggle.removeAttribute("data-on");
    }
    place();
    // New text can change the height, and this engine lays it out a frame later.
    window.requestAnimationFrame(shape);
    window.setTimeout(shape, 60);
  }

  function remPx() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || (window.innerWidth || 1920) / 1920;
  }

  /** Redraws the fill at the sheet's size. False while the sheet has no layout yet. */
  function shape() {
    var sheet = part("sheet");
    var host = part("fill");
    if (!sheet || !host) return false;
    var r = sheet.getBoundingClientRect();
    var w = Math.ceil(r.width);
    var h = Math.ceil(r.height);
    if (!w || !h) return false;
    var key = w + "x" + h;
    if (host.getAttribute("data-size") === key) return true;
    var rem = remPx();
    var c = Math.round(CUT_REM * rem);
    var bar = Math.max(1, Math.round(BAR_REM * rem));
    host.setAttribute("data-size", key);
    host.style.setProperty("width", w + "px", "important");
    host.style.setProperty("height", h + "px", "important");
    host.innerHTML =
      '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' +
      '<path d="M0 0 H' + w + " V" + (h - c) + " L" + (w - c) + " " + h + ' H0 Z" fill="' + FILL + '" />' +
      '<rect x="0" y="0" width="' + w + '" height="' + bar + '" fill="' + RED + '" /></svg>';
    return true;
  }

  /** Pins the panel to the button's bottom edge, at the button's width. */
  function place() {
    var b = button();
    if (!panel || !b) return;
    var r = b.getBoundingClientRect();
    panel.style.setProperty("left", r.left + "px", "important");
    panel.style.setProperty("top", r.bottom + "px", "important");
    panel.style.setProperty("width", r.width + "px", "important");
  }

  function hold() {
    window.clearTimeout(hideTimer);
    held = true;
    document.documentElement.setAttribute(ROOT_ATTR, "1");
    if (!panel) panel = build();
    render();
    var names = [];
    var risk = risky();
    for (var i = 0; i < risk.length; i++) names.push(baseName(risk[i].name));
    pending.push({ kind: "held", names: names, at: Date.now() });
    openWhenShaped(0);
  }

  /** The sheet slides only once its fill exists, or it slides in without a background. */
  function openWhenShaped(tries) {
    if (!panel || !held) return;
    if (shape() || tries > 30) {
      panel.className = PANEL + " open";
      return;
    }
    window.requestAnimationFrame(function () { openWhenShaped(tries + 1); });
  }

  function release() {
    held = false;
    document.documentElement.removeAttribute(ROOT_ATTR);
    if (!panel) return;
    var el = panel;
    panel = null;
    el.className = PANEL;
    hideTimer = window.setTimeout(function () {
      if (el.parentElement) el.parentElement.removeChild(el);
    }, SLIDE_MS + 20);
  }

  // ── Input ───────────────────────────────────────────────────────────
  function inside(el, root) {
    return !!(el && root && (el === root || root.contains(el)));
  }

  function swallow(e) {
    e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }

  function onClick(e) {
    if (panel && inside(e.target, part("toggle"))) {
      resume = !resume;
      pending.push({ kind: "resume", on: resume, at: Date.now() });
      render();
      // A wait to resume checks sooner than an idle page.
      if (resume) lastCycle = Math.min(lastCycle, Date.now() - ARMED_EVERY_MS);
      swallow(e);
      return;
    }
    if (panel && inside(e.target, panel)) {
      swallow(e);
      return;
    }

    var b = button();
    if (!inside(e.target, b) || disabled(b) || !guarding()) return;
    // The second press queues anyway, this one time.
    if (held) {
      pending.push({ kind: "override", at: Date.now() });
      release();
      return;
    }
    if (checking) return swallow(e);
    if (fresh()) {
      if (risky().length) {
        swallow(e);
        hold();
      }
      return;
    }
    // Stale or missing presence: the click waits for one round of searches, then queues or holds.
    swallow(e);
    checking = true;
    cycle(function () {
      checking = false;
      if (!guarding()) return;
      if (risky().length) hold();
      else press();
    });
  }

  document.addEventListener("click", onClick, true);

  function tick() {
    try {
      installStyle();
      var idle = !inArena() && !queueActive();
      var every = held && resume ? ARMED_EVERY_MS : CHECK_EVERY_MS;
      if (players.length && idle && Date.now() - lastCycle > every) cycle();
      if (held) {
        // An armed hold survives leaving the base camp: the queue can start from any hangar screen.
        if (!guarding() || (!button() && !resume)) release();
        else {
          place();
          shape();
        }
      }
      lastError = "";
    } catch (err) {
      lastError = String(err && err.message ? err.message : err);
    }
  }

  function seed(list, on) {
    var next = [];
    var keep = {};
    for (var i = 0; i < (list || []).length; i++) {
      var p = list[i];
      if (!p || !p.pid) continue;
      next.push({ pid: String(p.pid), name: p.name ? String(p.name) : "" });
      keep[String(p.pid)] = true;
    }
    for (var pid in seen) if (!keep[pid]) delete seen[pid];
    var changed = next.length !== players.length;
    for (var j = 0; !changed && j < next.length; j++) changed = next[j].pid !== players[j].pid;
    players = next;
    resume = !!on;
    if (changed) lastCycle = 0;
    if (!players.length && held) release();
    else if (held) render();
  }
  seed(CFG.players, CFG.resume);

  var timer = window.setInterval(tick, 700);
  tick();

  window[TAG] = {
    sig: String(CFG.sig || ""),
    /** The blocked players and the resume pick, pushed after every change. */
    set: function (list, on) {
      seed(list, on);
      return true;
    },
    /** Events since the last call: held, override, resumed, resume. */
    take: function () {
      var out = pending;
      pending = [];
      return out;
    },
    report: function () {
      var now = Date.now();
      var out = [];
      for (var i = 0; i < players.length; i++) {
        var st = seen[players[i].pid] || null;
        out.push({ name: players[i].name, pid: players[i].pid, seen: st, ageMs: st ? now - st.at : null });
      }
      return {
        players: out,
        guarding: guarding(),
        held: held,
        resume: resume,
        fresh: fresh(),
        lastCycleMs: lastCycle ? now - lastCycle : null,
        error: lastError,
      };
    },
    dispose: function () {
      window.clearInterval(timer);
      window.clearTimeout(hideTimer);
      document.removeEventListener("click", onClick, true);
      document.documentElement.removeAttribute(ROOT_ATTR);
      var left = document.querySelectorAll("." + PANEL);
      for (var i = 0; i < left.length; i++) left[i].parentElement.removeChild(left[i]);
      var s = document.getElementById(STYLE_ID);
      if (s) s.parentElement.removeChild(s);
      window[TAG] = null;
    },
  };
  return "installed:" + players.length + (lastError ? " error:" + lastError : "");
})();
