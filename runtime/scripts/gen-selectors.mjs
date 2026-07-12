import fs from "node:fs";
import path from "node:path";

const [, , srcPy, outTs] = process.argv;
const text = fs.readFileSync(srcPy, "utf-8");
const lines = text.split(/\r?\n/);

const cls = (name) => `${name}`;
let current = null;
const groups = { HUD: [], HANGAR: [] };

for (const raw of lines) {
  const clsMatch = raw.match(/^class\s+(HUD|HANGAR)\b/);
  if (clsMatch) {
    current = clsMatch[1];
    continue;
  }
  if (!current) continue;
  // NAME = _c("X")  (possibly with concatenation: _c("A") + ' ' + _c("B"))
  const m = raw.match(/^\s{4}([A-Z0-9_]+)\s*=\s*(.+?)(?:\s*#.*)?$/);
  if (!m) continue;
  const [, key, expr] = m;
  const value = evalExpr(expr.trim());
  if (value != null) groups[current].push([key, value]);
}

function evalExpr(expr) {
  // Replace _c("X") with the class-substring selector, then join string parts.
  // Supports:  _c("A")   '#id'   "'lit'"   _c("A") + ' ' + _c("B")
  const parts = expr.split("+").map((p) => p.trim());
  const out = [];
  for (const p of parts) {
    let mm = p.match(/^_c\(\s*(["'])(.*?)\1\s*\)$/);
    if (mm) {
      out.push(`[class*="${mm[2]}"]`);
      continue;
    }
    mm = p.match(/^(["'])(.*)\1$/);
    if (mm) {
      out.push(mm[2]);
      continue;
    }
    return null; // unrecognised
  }
  return out.join("");
}

function emit(name, entries) {
  const body = entries.map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join("\n");
  return `export const ${cls(name)} = {\n${body}\n} as const;\n`;
}

const header = `/**
 * CSS selector constants for battle_hud/markers/hangar DOM — generated from
 * backend/dev/accessors/hud_selectors.py by runtime/scripts/gen-selectors.mjs.
 * Do not edit by hand; regenerate instead.
 */
`;

fs.mkdirSync(path.dirname(outTs), { recursive: true });
fs.writeFileSync(outTs, header + "\n" + emit("HUD", groups.HUD) + "\n" + emit("HANGAR", groups.HANGAR));
console.log(`Wrote ${outTs}: HUD=${groups.HUD.length} HANGAR=${groups.HANGAR.length}`);
