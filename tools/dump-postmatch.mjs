/**
 * Standalone postmatch dumper. Attaches to the game's CDP endpoint directly, so
 * it needs no FUSE rebuild/restart and does not disturb a running session.
 *
 *   node tools/dump-postmatch.mjs [outfile]
 *
 * Run it while the postmatch results screen is up. Writes the RAW per-player
 * stats object so we can see whether the build splits deep stats per vehicle.
 */
import fs from "node:fs";
import path from "node:path";

const PORTS = process.env.CDP_PORT ? [Number(process.env.CDP_PORT)] : [17503, 9222];
const OUT = process.argv[2] ?? `postmatch-dump-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
let PORT = PORTS[0];

async function listTargets() {
  let lastErr;
  for (const p of PORTS) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/json`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(`/json returned ${r.status}`);
      PORT = p;
      return r.json();
    } catch (e) { lastErr = e; }
  }
  throw new Error(`CDP not reachable on ${PORTS.join(", ")}: ${lastErr?.message}`);
}

/** Minimal CDP client: one Runtime.evaluate over a raw WebSocket. */
async function evaluate(wsUrl, expression) {
  const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("CDP evaluate timeout")); }, 10000);
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error(`WS error: ${e?.message ?? e}`)); };
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true, awaitPromise: false },
      }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      if (msg.id !== 1) return;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)));
      const r = msg.result?.result;
      if (msg.result?.exceptionDetails) {
        return reject(new Error(msg.result.exceptionDetails.text + " " + (r?.description ?? "")));
      }
      resolve(r?.value);
    };
  });
}

// Pull the whole postbattle tree plus the live model, untouched. Bigints are
// stringified because JSON.stringify throws on them.
const EXPR = `(function () {
  function safe(o, depth) {
    if (depth > 8) return "<maxdepth>";
    if (o === null || o === undefined) return null;
    var t = typeof o;
    if (t === "bigint") return "bigint:" + o.toString();
    if (t === "function") return "<fn>";
    if (t !== "object") return o;
    // Gameface exposes exotic array proxies: Array.isArray() is false and for-in
    // yields prototype methods, so detect array-likes by numeric length instead.
    var isArrayLike = Array.isArray(o) || (typeof o.length === "number" && typeof o.filter === "function");
    if (isArrayLike) {
      var arr = [];
      for (var i = 0; i < o.length; i++) { try { arr.push(safe(o[i], depth + 1)); } catch (e) { arr.push("<err>"); } }
      return arr;
    }
    var out = {};
    for (var k in o) {
      if (typeof o[k] === "function") continue;
      try { out[k] = safe(o[k], depth + 1); } catch (e) { out[k] = "<err:" + e.message + ">"; }
    }
    return out;
  }
  var out = { has_postbattle: typeof postbattleScene !== "undefined" };
  try {
    var pb = (typeof postbattleScene !== "undefined") ? postbattleScene : null;
    out.results = pb && pb.results ? safe(pb.results, 0) : null;
  } catch (e) { out.results_err = e.message; }
  try {
    var tm = (typeof tacticalInfoModel !== "undefined") ? tacticalInfoModel : null;
    out.tactical = tm ? safe({ currentPlayer: tm.currentPlayer, players: tm.players }, 0) : null;
  } catch (e) { out.tactical_err = e.message; }
  // Anything on the page that smells vehicle-related and we might not map yet.
  try {
    out.globals = Object.keys(this).filter(function (k) { return /vehicle|tank|postbattle|tactical|battle/i.test(k); });
  } catch (e) { out.globals_err = e.message; }
  return out;
})()`;

/**
 * --watch: poll the live vehicle + counters during a battle and print every
 * change. Proves whether playerInfoModel.info.vehicleName tracks a mid-battle
 * swap, which is what the recorder keys attribution off.
 */
const WATCH_EXPR = `(function(){
  var o = {};
  try {
    var m = (typeof playerInfoModel !== "undefined") ? playerInfoModel : null;
    var i = m && m.info;
    o.slug   = i && i.vehicleName ? String(i.vehicleName).split(".")[0] : null;
    o.raw    = i ? i.vehicleName : null;
    o.role   = i ? i.role : null;
    o.kills  = m ? m.kill : null;
    o.dmg    = m ? m.damage : null;
    o.pts    = m ? m.currentRolePoints : null;
    o.dead   = m ? (m.isDead ? 1 : 0) : null;
  } catch (e) { o.err = e.message; }
  try {
    var c = (typeof tacticalInfoModel !== "undefined" && tacticalInfoModel.currentPlayer) ? tacticalInfoModel.currentPlayer : null;
    o.vid  = c ? c.vehicleId : null;
    o.disp = c ? c.vehicleName : null;
  } catch (e) { o.err2 = e.message; }
  return o;
})()`;

async function watch() {
  console.log("watching for vehicle swaps - Ctrl+C to stop\n");
  let last = null;
  for (;;) {
    let targets = [];
    try { targets = await listTargets(); } catch { process.stdout.write("."); await new Promise(r => setTimeout(r, 2000)); continue; }
    const t = targets.find((x) => /battle_hud/i.test(x.url ?? "")) ?? targets.find((x) => /battle_app/i.test(x.url ?? ""));
    if (!t?.webSocketDebuggerUrl) { process.stdout.write("."); await new Promise((r) => setTimeout(r, 2000)); continue; }
    try {
      const v = await evaluate(t.webSocketDebuggerUrl, WATCH_EXPR);
      const key = `${v?.slug}|${v?.vid}`;
      if (v && key !== last) {
        const when = new Date().toLocaleTimeString();
        console.log(
          last === null
            ? `${when}  START   slug=${v.slug} vid=${v.vid} disp=${JSON.stringify(v.disp)} raw=${JSON.stringify(v.raw)}`
            : `${when}  SWAP -> slug=${v.slug} vid=${v.vid} disp=${JSON.stringify(v.disp)}  (at K${v.kills} dmg${v.dmg} pts${v.pts})`,
        );
        last = key;
      }
    } catch { /* page swapping during respawn - keep polling */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const main = async () => {
  if (process.argv.includes("--watch")) return watch();
  const targets = await listTargets();
  const named = targets.map((t) => `${t.title || "?"} :: ${t.url || "?"}`);
  console.log(`CDP targets on ${PORT}:\n  ` + named.join("\n  ") + "\n");

  // battle_app hosts postbattleScene; fall back to scanning every page.
  const ordered = [
    ...targets.filter((t) => /battle_app/i.test(t.url ?? "")),
    ...targets.filter((t) => !/battle_app/i.test(t.url ?? "")),
  ].filter((t) => t.webSocketDebuggerUrl);

  const dumps = [];
  for (const t of ordered) {
    try {
      const v = await evaluate(t.webSocketDebuggerUrl, EXPR);
      if (!v) continue;
      dumps.push({ target: { title: t.title, url: t.url }, data: v });
      console.log(`${v.has_postbattle ? "HIT " : "    "} ${t.url}  (postbattle=${v.has_postbattle}, results=${v.results ? "yes" : "no"})`);
    } catch (e) {
      console.log(`     ${t.url}  -> ${e.message}`);
    }
  }

  const hit = dumps.find((d) => d.data.has_postbattle && d.data.results);
  const outPath = path.resolve(OUT);
  fs.writeFileSync(outPath, JSON.stringify(dumps, null, 2));
  console.log(`\nwrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);

  if (!hit) {
    console.log("\nNo postbattleScene.results found - is the results screen currently open?");
    return;
  }
  // Point straight at the player's own stats object.
  const res = hit.data.results;
  const meId = res.battlePlayerId;
  console.log(`\nbattlePlayerId = ${JSON.stringify(meId)}`);
  const teams = Array.isArray(res?.common?.teams) ? res.common.teams : [];
  console.log(`battleId = ${JSON.stringify(res.battleId ?? res?.common?.battleId)}`);
  for (const team of teams) {
    for (const [pid, rec] of Object.entries(team.players ?? {})) {
      if (String(pid) !== String(meId)) continue;
      const stats = rec.stats ?? {};
      console.log(`\nYOUR stats object - ${Object.keys(stats).length} keys:`);
      console.log(Object.keys(stats).sort().join(", "));
      const nested = Object.entries(stats).filter(([, v]) => v && typeof v === "object");
      console.log(`\nnested/array values (per-vehicle breakdown would live here): ${nested.length ? "" : "NONE"}`);
      for (const [k, v] of nested) console.log(`  ${k} = ${JSON.stringify(v).slice(0, 400)}`);
      console.log(`\nplayerInfo: ${JSON.stringify(rec.playerInfo ?? null).slice(0, 600)}`);
    }
  }
};

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
