/*
 * HEAT Stats tags - page-side script for the postmatch page (battle_app).
 *
 * Hovering a player's row on the postmatch scoreboard opens three slots beside
 * their nickname; clicking an empty slot picks one of five groups, clicking a
 * filled one clears it, and a slot can be dragged onto another to reorder. The
 * marks a player carries stay drawn whether or not the row is hovered.
 *
 * Read against the live postmatch page, because this engine is not a browser:
 *   - document.createTreeWalker does not exist. Rows are found with
 *     querySelectorAll instead.
 *   - HTML5 drag and drop does not exist either ('draggable' in body === false),
 *     so reordering runs on pointer events and hit-tests the slot rects itself.
 *   - Element.closest exists here, but the ancestor walk is kept by hand so this
 *     stays safe on the pages where it doesn't.
 *
 * The scoreboard's own structure, as the page builds it:
 *   [class*="PlayersTable_rows"]              the two team columns' row lists
 *     [class*="ListItem_listItem"]            one player's row
 *       [class*="CellWrapper_base__player"]   the nickname cell, marks go here
 *
 * Class names carry a per-build hash (`PlayersTable_rows_d7b`), so every
 * selector matches on the stable prefix only.
 *
 * Identity: the postmatch player records have no usable playerId - the map key
 * is a per-battle slot number. account.profileId is the stable one, with
 * uniqueName (nickname#1234) as the fallback; displayName is what the row shows.
 *
 * The plugin and the page trade through two globals, since the page can only be
 * reached by Runtime.evaluate:
 *   window.__fuseTagsCfg     - written by the plugin: icons, labels, marks
 *   window.__fuseTags.take() - drained by the plugin: the picks since last call
 *
 * Sizes are in rem, a 1080p design pixel here, and inline styles need
 * !important to beat the page's own reset.
 */
(function () {
  var CFG = window.__fuseTagsCfg || {};
  var TAG = "__fuseTags";
  if (window[TAG] && window[TAG].dispose) window[TAG].dispose();

  var GROUPS = CFG.groups || []; // [{id, label, svg}]
  var SLOTS = CFG.slots || 3;
  /** A nameplate shows the first two marks only; the boards show every one. */
  var MARKER_SLOTS = 2;
  var STYLE_ID = "__fuse_tags__";
  // The cell carries the player; a slot carries its owner under a different
  // name, so a repaint never mistakes a slot for a row and nests marks in it.
  var PID_ATTR = "data-fuse-pid";
  var OWNER_ATTR = "data-fuse-owner";
  var MARKS = "fuse-tag-marks";
  var SLOT = "fuse-tag-slot";
  var FRAME = "fuse-tag-frame";
  var GLYPH = "fuse-tag-glyph";
  var PICKER = "fuse-tag-picker";
  var OPT = "fuse-tag-opt";

  /** An empty slot: the frame alone, so the row still shows where a mark goes. */
  var EMPTY_STROKE = "rgba(248,247,246,0.25)";

  /** The brand's chamfer: top-left and bottom-right corners cut, not rounded. */
  var CUT = 6;
  function frame(stroke) {
    return (
      '<svg class="' + FRAME + '" viewBox="0 0 24 24" preserveAspectRatio="none">' +
      '<path d="M' + CUT + ' 0 H24 V' + (24 - CUT) + ' L' + (24 - CUT) + ' 24 H0 V' + CUT + ' Z"' +
      ' fill="none" stroke="' + stroke + '" stroke-width="1.5" /></svg>'
    );
  }

  /**
   * The nickname cell, which is the same component on all three boards: the
   * in-battle scoreboard (ScoreTable_rows), the postmatch one (PlayersTable_rows),
   * and the hangar's copy of it. Binding to the cell rather than to a row means
   * the container it sits in does not matter.
   */
  var NAME_SEL = '[class*="CellWrapper_base__player"]';
  var ROW_SEL = "ListItem_listItem";

  /**
   * The nameplates over the tanks, on their own page. The marks go above the
   * nickname, at the top of the plate; the nickname itself is what identifies
   * the player, since that page carries no roster at all.
   */
  var MARKER_SEL = '[class*="VehicleMarker_base"]';
  var MARKER_NAME_SEL = '[class*="VehicleMarker_userName"]';
  /** The plate's column: nickname, then the class icon and vehicle beneath it. */
  var MARKER_HOST_SEL = '[class*="VehicleMarker_topSlot"]';

  /** pid -> [groupId], replaced wholesale whenever the plugin pushes. */
  var marks = {};
  /** pid -> the nickname the mark was filed under (`name#1234`). */
  var nameOf = {};
  /** The head of that nickname -> pid, which is how a live row finds its marks. */
  var byBase = {};
  var pending = [];
  var drag = null;
  var lastDrawn = 0;
  var lastError = "";
  /** Whether this board takes edits; settled once per paint, read on click. */
  var canEdit = false;
  /** The store lookup walks React fibers, so it is found once and kept. */
  var ctxCache = null;

  /**
   * The plugin's marks, and the nickname each was filed under.
   *
   * In battle the game reports profileId 0 for everyone - it only fills the
   * real one in on the postmatch results - so a live row cannot be joined by
   * id. It is joined by the nickname instead, which is why every mark carries
   * the one it was made under: `AET3RNAL#72876`, whose head is what the row
   * shows. Tagging still happens where the ids are real, so a nickname only
   * ever has to find a mark that already exists.
   */
  function seed(list) {
    marks = {};
    byBase = {};
    for (var i = 0; i < (list || []).length; i++) {
      var e = list[i];
      if (!e || !e.pid) continue;
      var pid = String(e.pid);
      marks[pid] = (e.tags || []).slice();
      var named = String(e.name || "").trim();
      if (named) {
        nameOf[pid] = named;
        byBase[named.split("#")[0]] = pid;
      }
    }
  }
  seed(CFG.marks);

  function groupOf(id) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i];
    return null;
  }

  // ── Who is on the scoreboard ────────────────────────────────────────
  /**
   * The results tree. In battle it is a page global; back in the hangar the
   * same screen is drawn from a MobX store reached through the React fiber,
   * which is why this script has to run on both pages.
   */
  function results() {
    try {
      if (typeof postbattleScene !== "undefined" && postbattleScene && postbattleScene.results) {
        return postbattleScene.results;
      }
    } catch (e) { /* not the battle page */ }
    var ctx = findCtx();
    return ctx && ctx.PostbattleStore ? ctx.PostbattleStore.results : null;
  }

  /** Climbs a React fiber until the object holding the app's stores turns up. */
  function findCtx() {
    if (ctxCache && ctxCache.PostbattleStore) return ctxCache;
    var test = function (o) { return o && typeof o === "object" && !!o.PostbattleStore; };
    var scan = function (o) {
      if (!o || typeof o !== "object") return null;
      try { if (test(o)) return o; } catch (e) {}
      var keys = Object.keys(o);
      for (var i = 0; i < keys.length; i++) {
        try { var v = o[keys[i]]; if (v && typeof v === "object" && test(v)) return v; } catch (e2) {}
      }
      return null;
    };
    var roots = [
      document.querySelector('[class*="PostMatchOverview"]'),
      document.querySelector('[class*="PlayersTable"]'),
      document.body,
    ];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      if (!root) continue;
      var key = null;
      var keys = Object.keys(root);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf("__reactFiber$") === 0 || keys[k].indexOf("__reactContainer$") === 0) { key = keys[k]; break; }
      }
      if (!key) continue;
      var f = root[key], hops = 0;
      while (f && hops < 400) {
        var hit = scan(f.memoizedProps) || scan(f.stateNode);
        var h = f.memoizedState, i = 0;
        while (h && i < 80 && !hit) { hit = scan(h.memoizedState); h = h.next; i++; }
        if (hit) { ctxCache = hit; return hit; }
        f = f.return;
        hops++;
      }
    }
    return null;
  }

  /**
   * displayName -> {pid, label}. The nickname on the row is the join key.
   *
   * Bots are left out: the game gives every one of them profileId 0, so they
   * would all share a record and a mark on one would land on all of them.
   */
  function identities() {
    var byName = {};
    var add = function (account, fallbackName, isBot) {
      var ac = account || {};
      var shown = String(ac.displayName || fallbackName || "").trim();
      var pid = ac.profileId != null ? String(ac.profileId) : "";
      if (!pid || pid === "0" || isBot) return;
      if (shown) byName[shown] = { pid: pid, label: String(ac.uniqueName || shown) };
    };
    try {
      var res = results();
      var teams = (res && res.common && res.common.teams) || [];
      for (var t = 0; t < teams.length; t++) {
        var players = (teams[t] && teams[t].players) || {};
        for (var key in players) {
          var pi = (players[key] || {}).playerInfo || {};
          add(pi.account, null, false);
        }
      }
    } catch (e) { /* results not up yet */ }
    // In battle there are no results and no ids, so a row is matched to a mark
    // already made: the nickname it was filed under, minus the discriminator.
    try {
      var tps = (tacticalInfoModel && tacticalInfoModel.players) || [];
      for (var i = 0; i < tps.length; i++) {
        var tp = tps[i] || {};
        var ac = tp.account || {};
        var shown = String(ac.displayName || tp.userName || "").trim();
        if (!shown || tp.isBot || byName[shown]) continue;
        var known = byBase[String(ac.uniqueName || shown).split("#")[0]] || byBase[shown];
        if (known) byName[shown] = { pid: known, label: String(ac.uniqueName || shown) };
      }
    } catch (e2) { /* not in a battle */ }
    return byName;
  }

  /**
   * Marks are editable where tagging belongs - the postmatch board, in the game
   * or back in the hangar. Mid-battle the scoreboard only shows them: a stray
   * click on a live board should not rewrite a record.
   */
  function editable() {
    try {
      var res = results();
      var teams = (res && res.common && res.common.teams) || [];
      for (var t = 0; t < teams.length; t++) {
        for (var key in (teams[t] && teams[t].players) || {}) return true;
      }
    } catch (e) { /* no results: in battle */ }
    return false;
  }

  function textOf(el) {
    return String((el && el.textContent) || "").trim();
  }

  // ── Drawing ─────────────────────────────────────────────────────────
  // display:flex, never inline-flex: inline-flex lays out as a block here, which
  // stacked every slot down the page and pushed them out of the row.
  var css =
    "." + MARKS + " { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important;" +
    " align-items: center !important; gap: 4rem !important; margin-left: 8rem !important;" +
    " flex: 0 0 auto !important; width: auto !important; height: 24rem !important; }\n" +
    // No border: the frame is an SVG so it can carry the brand's chamfer.
    // corner-shape and clip-path are not available here, and border-radius
    // would round the corners rather than cut them.
    "." + SLOT + " { position: relative !important; flex: 0 0 auto !important;" +
    " width: 24rem !important; height: 24rem !important; display: flex !important;" +
    " align-items: center !important; justify-content: center !important; cursor: pointer !important; }\n" +
    "." + SLOT + ".dragging { opacity: 0.35 !important; }\n" +
    // A nameplate's marks: a row of glyphs above the nickname, no frame and no
    // slot chrome - nothing there is editable, so nothing needs a target. The
    // nickname's slot is the anchor, so they hang off its top edge.
    "." + MARKS + '[data-fuse-host="marker"] { position: absolute !important; left: 50% !important;' +
    " bottom: 100% !important; transform: translateX(-50%) !important; height: auto !important;" +
    // The slot's anchor line sits inside the nickname's own line box, so the
    // gap has to clear the text as well as separate from it.
    " gap: 4rem !important; margin: 0 0 16rem 0 !important; justify-content: center !important; }\n" +
    "." + MARKS + '[data-fuse-host="marker"] .' + SLOT +
    " { width: 26rem !important; height: 26rem !important; cursor: default !important; }\n" +
    "." + MARKS + '[data-fuse-host="marker"] .' + GLYPH +
    " svg { width: 26rem !important; height: 26rem !important; }\n" +
    // An empty slot is an invitation, not information: it is drawn only under
    // the pointer, and only the next one - never the whole rack of three.
    "." + SLOT + ".empty { display: none !important; }\n" +
    "." + MARKS + ".live ." + SLOT + ".empty.next { display: flex !important; }\n" +
    "." + FRAME + " { position: absolute !important; left: 0 !important; top: 0 !important;" +
    " width: 100% !important; height: 100% !important; }\n" +
    "." + GLYPH + " { position: relative !important; display: flex !important; }\n" +
    "." + GLYPH + " svg { width: 15rem !important; height: 15rem !important; display: block !important; }\n" +
    "." + PICKER + " { position: fixed !important; z-index: 9999 !important; display: flex !important;" +
    " flex-direction: row !important; flex-wrap: nowrap !important; width: auto !important;" +
    " gap: 4rem !important; padding: 6rem !important; background: rgba(10,10,10,0.96) !important;" +
    " border: 1rem solid rgba(248,247,246,0.25) !important; }\n" +
    "." + OPT + " { position: relative !important; flex: 0 0 auto !important; width: 28rem !important;" +
    " height: 28rem !important; display: flex !important; align-items: center !important;" +
    " justify-content: center !important; cursor: pointer !important; }\n" +
    "." + OPT + ":hover { background: rgba(248,247,246,0.12) !important; }\n" +
    "." + OPT + " ." + GLYPH + " svg { width: 18rem !important; height: 18rem !important; }\n";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function paintRow(host, pid) {
    var mine = marks[pid] || [];
    var box = null;
    for (var c = 0; c < host.children.length; c++) {
      if (String(host.children[c].className || "").indexOf(MARKS) >= 0) { box = host.children[c]; break; }
    }
    var onMarker = String(host.className || "").indexOf("VehicleMarker_topSlot") >= 0;
    if (!box) {
      box = document.createElement("div");
      box.className = MARKS + " idle";
      // An attribute, not a class: hover rewrites the class list.
      if (onMarker) box.setAttribute("data-fuse-host", "marker");
      // A nameplate reads downwards - marks, nickname, vehicle - so they go
      // above everything rather than beside the class icon.
      if (onMarker) host.insertBefore(box, host.firstChild);
      else host.appendChild(box);
    }
    var count = onMarker ? Math.min(SLOTS, MARKER_SLOTS) : SLOTS;
    for (var i = 0; i < count; i++) {
      var slot = box.children[i];
      if (!slot) {
        slot = document.createElement("div");
        slot.setAttribute("data-fuse-slot", String(i));
        slot.setAttribute(OWNER_ATTR, pid);
        box.appendChild(slot);
      }
      var id = mine[i] || "";
      // Only the first empty slot is offered, and only while hovered: the row
      // shows the marks a player has, plus room for one more. A board that
      // can't be edited offers none.
      var cls = SLOT + (id ? " filled" : canEdit && i === mine.length ? " empty next" : " empty");
      if (slot.className !== cls) slot.className = cls;
      if (slot.getAttribute("data-fuse-id") === id) continue;
      var group = groupOf(id);
      slot.setAttribute("data-fuse-id", id);
      slot.title = group ? group.label : "";
      // A nameplate carries the glyph alone, in its solid cut: it is read at a
      // glance over the world, where a frame competes with the game's own
      // chrome and outline art reads as a smudge.
      slot.innerHTML = onMarker
        ? group
          ? '<span class="' + GLYPH + '">' + (group.solid || group.svg) + "</span>"
          : ""
        : frame(group ? group.color : EMPTY_STROKE) +
          (group ? '<span class="' + GLYPH + '">' + group.svg + "</span>" : "");
    }
  }

  /** A nameplate that no longer shows a tagged player: no binding, and no marks left behind. */
  function unbindPlate(plate) {
    plate.removeAttribute(PID_ATTR);
    plate.removeAttribute("data-fuse-name");
    for (var c = plate.children.length - 1; c >= 0; c--) {
      var child = plate.children[c];
      if (String(child.className || "").indexOf(MARKS) >= 0) plate.removeChild(child);
    }
  }

  function paint() {
    canEdit = editable();
    var byName = identities();
    var drawn = 0;

    // Boards: the nickname cell is both the label and the host.
    var cells = document.querySelectorAll(NAME_SEL);
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var pid = cell.getAttribute(PID_ATTR);
      if (!pid) {
        // Read before the marks are added: afterwards the cell's text is theirs too.
        var found = byName[textOf(cell)];
        if (!found) continue;
        pid = found.pid;
        // The discriminated name, not the one on the row: it is what a live
        // board or a marker has to match against later.
        nameOf[pid] = found.label;
        cell.setAttribute(PID_ATTR, pid);
      }
      paintRow(cell, pid);
      drawn++;
    }

    // Markers: the nickname and the host are different elements, and there is
    // no roster on this page at all - only the marks the plugin pushed, which
    // is enough, because a marker never needs to mint an identity.
    var markers = document.querySelectorAll(MARKER_SEL);
    for (var m = 0; m < markers.length; m++) {
      var marker = markers[m];
      // The nickname lives in its own absolutely positioned slot, nested in the
      // plate's row; that slot is the anchor the name is drawn from, so it is
      // what the marks hang above. The outer row would put them beside the
      // class icon instead.
      var nameEl = marker.querySelector(MARKER_NAME_SEL);
      var plate = ancestor(nameEl, "VehicleMarker_topSlot") || marker.querySelector(MARKER_HOST_SEL);
      if (!plate) continue;
      var shown = textOf(nameEl);
      var mpid = plate.getAttribute(PID_ATTR);
      // Markers are recycled onto other players, so a binding is only as good
      // as the nickname it was made from. A changed or empty name drops the
      // binding and the marks drawn for it, or they stay on the next player.
      if (mpid && shown !== plate.getAttribute("data-fuse-name")) {
        unbindPlate(plate);
        mpid = null;
      }
      if (!mpid) {
        var hit = shown ? byName[shown] : null;
        mpid = hit ? hit.pid : shown ? byBase[shown.split("#")[0]] : null;
        if (!mpid) {
          unbindPlate(plate);
          continue;
        }
        plate.setAttribute(PID_ATTR, mpid);
        plate.setAttribute("data-fuse-name", shown);
      }
      paintRow(plate, mpid);
      drawn++;
    }
    return drawn;
  }

  // ── Picking ─────────────────────────────────────────────────────────
  function closePicker() {
    var open = document.querySelectorAll("." + PICKER);
    for (var i = 0; i < open.length; i++) open[i].parentElement.removeChild(open[i]);
  }

  function record(pid, tags) {
    var clean = [];
    for (var i = 0; i < tags.length; i++) {
      if (tags[i] && clean.indexOf(tags[i]) < 0) clean.push(tags[i]);
    }
    clean = clean.slice(0, SLOTS);
    marks[pid] = clean;
    pending.push({ pid: pid, tags: clean.slice(), name: nameOf[pid] || null, at: Date.now() });
    var cell = document.querySelector("[" + PID_ATTR + '="' + pid + '"]');
    if (cell) paintRow(cell, pid);
  }

  function openPicker(slot) {
    closePicker();
    var pid = slot.getAttribute(OWNER_ATTR);
    var box = document.createElement("div");
    box.className = PICKER;
    box.setAttribute(OWNER_ATTR, pid);
    box.setAttribute("data-fuse-slot", slot.getAttribute("data-fuse-slot"));
    for (var i = 0; i < GROUPS.length; i++) {
      var opt = document.createElement("div");
      opt.className = OPT;
      opt.setAttribute("data-fuse-pick", GROUPS[i].id);
      opt.title = GROUPS[i].label || GROUPS[i].id;
      opt.innerHTML = frame(GROUPS[i].color) + '<span class="' + GLYPH + '">' + (GROUPS[i].svg || "") + "</span>";
      box.appendChild(opt);
    }
    document.body.appendChild(box);
    var r = slot.getBoundingClientRect();
    var w = box.getBoundingClientRect().width || 160;
    var left = Math.max(4, Math.min(r.left, (window.innerWidth || 1920) - w - 4));
    box.style.setProperty("left", left + "px", "important");
    box.style.setProperty("top", r.bottom + 4 + "px", "important");
  }

  /** Cohtml has closest(), but the climb is spelled out so this runs anywhere. */
  function ancestor(el, cls) {
    while (el && el !== document) {
      if (String(el.className || "").indexOf(cls) >= 0) return el;
      el = el.parentElement;
    }
    return null;
  }

  function onClick(e) {
    var opt = ancestor(e.target, OPT);
    if (opt) {
      var box = ancestor(opt, PICKER);
      var pid = box.getAttribute(OWNER_ATTR);
      var index = Number(box.getAttribute("data-fuse-slot"));
      var next = (marks[pid] || []).slice();
      var picked = opt.getAttribute("data-fuse-pick");
      // One group per player: picking one they already carry moves it here.
      next = next.filter(function (id) { return id !== picked; });
      next.splice(Math.min(index, next.length), 0, picked);
      record(pid, next);
      closePicker();
      e.stopPropagation();
      return;
    }

    var slot = ancestor(e.target, SLOT);
    if (slot && canEdit) {
      var sPid = slot.getAttribute(OWNER_ATTR);
      var sIndex = Number(slot.getAttribute("data-fuse-slot"));
      var list = (marks[sPid] || []).slice();
      if (list[sIndex]) {
        list.splice(sIndex, 1);
        record(sPid, list);
      } else {
        openPicker(slot);
      }
      e.stopPropagation();
      return;
    }

    closePicker();
  }

  function onOver(e) {
    var cell = ancestor(e.target, "CellWrapper_base__player");
    var row = ancestor(e.target, "ListItem_listItem");
    var boxes = document.querySelectorAll("." + MARKS);
    for (var i = 0; i < boxes.length; i++) {
      var live = (row && row.contains(boxes[i])) || (cell && cell.contains(boxes[i]));
      boxes[i].className = MARKS + (live ? " live" : " idle");
    }
  }

  // ── Reordering ──────────────────────────────────────────────────────
  // No HTML5 drag here, so a press-and-move on a filled slot carries it and the
  // drop target is whichever of that row's slots the pointer is over.
  function onDown(e) {
    if (!canEdit) return;
    var slot = ancestor(e.target, SLOT);
    if (!slot) return;
    var pid = slot.getAttribute(OWNER_ATTR);
    var index = Number(slot.getAttribute("data-fuse-slot"));
    if (!(marks[pid] || [])[index]) return;
    drag = { pid: pid, index: index, el: slot, moved: false };
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.className += " dragging";
    }
    e.preventDefault();
  }

  function onUp(e) {
    var held = drag;
    drag = null;
    if (!held) return;
    held.el.className = String(held.el.className).replace(" dragging", "");
    if (!held.moved) return; // a plain click; onClick handles it

    var box = held.el.parentElement;
    var to = -1;
    for (var i = 0; i < box.children.length; i++) {
      var r = box.children[i].getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) to = i;
    }
    if (to < 0 || to === held.index) return;
    var list = (marks[held.pid] || []).slice();
    if (held.index >= list.length) return;
    var moved = list.splice(held.index, 1)[0];
    list.splice(Math.min(to, list.length), 0, moved);
    record(held.pid, list);
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("mouseover", onOver, true);
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerup", onUp, true);

  function tick() {
    try {
      installStyle();
      lastDrawn = paint();
      lastError = "";
    } catch (err) {
      lastError = String(err && err.message ? err.message : err);
    }
  }
  var timer = window.setInterval(tick, 700);
  tick();

  window[TAG] = {
    sig: String(CFG.sig || ""),
    /** The plugin's picture of who is tagged, pushed after every write it makes. */
    set: function (list) {
      seed(list);
      var cells = document.querySelectorAll("[" + PID_ATTR + "]");
      for (var i = 0; i < cells.length; i++) paintRow(cells[i], cells[i].getAttribute(PID_ATTR));
      return true;
    },
    /** Picks since the last call; the plugin stores them and pushes the result back. */
    take: function () {
      var out = pending;
      pending = [];
      return out;
    },
    /** What the script can see, for when a row can't be found. */
    report: function () {
      var byName = identities();
      var names = Object.keys(byName);
      return {
        players: names.length,
        cells: document.querySelectorAll(NAME_SEL).length,
        editable: canEdit,
        bound: document.querySelectorAll("[" + PID_ATTR + "]").length,
        drawn: lastDrawn,
        error: lastError,
        sample: names.slice(0, 3).map(function (n) { return { name: n, pid: byName[n].pid }; }),
      };
    },
    dispose: function () {
      window.clearInterval(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      closePicker();
      var boxes = document.querySelectorAll("." + MARKS);
      for (var i = 0; i < boxes.length; i++) boxes[i].parentElement.removeChild(boxes[i]);
      var cells = document.querySelectorAll("[" + PID_ATTR + "]");
      for (var j = 0; j < cells.length; j++) cells[j].removeAttribute(PID_ATTR);
      var s = document.getElementById(STYLE_ID);
      if (s) s.parentElement.removeChild(s);
      window[TAG] = null;
    },
  };
  return "installed:" + lastDrawn + (lastError ? " error:" + lastError : "");
})();
