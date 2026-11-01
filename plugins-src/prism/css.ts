import { GAME, PAGES, SECTIONS, type Page, type PrismEl, type Shade, type State, type Team } from "./catalog.js";
import { tintFilter } from "./tint.js";

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ConfigGet = (key: string) => unknown;

export const ALL_ITEMS: PrismEl[] = SECTIONS.flatMap((s) => s.items);
export const TEAMS: Team[] = ["ally", "enemy", "squad", "you", "contested"];

export const K_TINT = (k: string) => `${k}_tint`;
export const K_STATE = (it: PrismEl, s: State) => (s.id === "color" ? `${it.key}_color` : `${it.key}_${s.id}`);
export const K_SCALE = (k: string) => `${k}_scale`;
export const K_ROT = (k: string) => `${k}_rot`;
export const K_PICK = (sec: string) => `pick_${sec}`;
export const K_TEAM_TINT = (t: Team) => `${t}_tint`;
export const K_TEAM_COLOR = (t: Team) => `${t}_color`;

export const hex8 = (hex: string) => (hex.length === 7 ? `${hex}FF` : hex).toUpperCase();

/** "#RRGGBB" / "#RRGGBBAA" -> channels, or null. */
export function parseHex(hex: unknown): Rgba | null {
  if (typeof hex !== "string") return null;
  let s = hex.trim().replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((ch) => ch + ch).join("");
  if (s.length === 6) s += "ff";
  if (s.length !== 8 || /[^0-9a-fA-F]/.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
    a: parseInt(s.slice(6, 8), 16) / 255,
  };
}

const same = (x: Rgba, y: Rgba) => x.r === y.r && x.g === y.g && x.b === y.b && Math.abs(x.a - y.a) < 0.01;
const rgba = (c: Rgba, alpha = 1) => `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a * alpha).toFixed(3)})`;

/** The game's dark shades sit near 52% of the base; its light shades about 45% of the way to white. */
export function shade(c: Rgba, s: Shade | undefined): Rgba {
  if (s === "dark") return { r: Math.round(c.r * 0.52), g: Math.round(c.g * 0.52), b: Math.round(c.b * 0.52), a: c.a };
  if (s === "light") {
    const mix = (v: number) => Math.round(v + (255 - v) * 0.45);
    return { r: mix(c.r), g: mix(c.g), b: mix(c.b), a: c.a };
  }
  return c;
}

/** Fill a target's declaration template and mark every declaration important. */
export function resolveDecl(decl: string, c: Rgba): string {
  const out = decl
    .replace(/\{c@([0-9.]+)\}/g, (_m, a: string) => rgba(c, Number(a)))
    .replace(/\{c:(dark|light)\}/g, (_m, s: Shade) => rgba(shade(c, s)))
    .replace(/\{tint\}/g, () => tintFilter(c.r, c.g, c.b, c.a))
    .replace(/\{c\}/g, () => rgba(c));
  return out
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => `${d} !important`)
    .join("; ");
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function teamColor(get: ConfigGet, tm: Team): Rgba | null {
  if (!Boolean(get(K_TEAM_TINT(tm)))) return null;
  return parseHex(get(K_TEAM_COLOR(tm)));
}

/** The element's own colour, else its team colour, else null (the game's). */
function effective(get: ConfigGet, it: PrismEl, s: State, elOn: boolean): Rgba | null {
  if (elOn) {
    const own = parseHex(get(K_STATE(it, s)));
    const def = parseHex(s.def);
    if (own && def && !same(own, def)) return own;
  }
  if (s.team) {
    const team = teamColor(get, s.team);
    if (team) return shade(team, s.shade);
  }
  return null;
}

/** Every page's rules for the current config. */
export function buildCss(get: ConfigGet): Record<Page, string[]> {
  const css = Object.fromEntries(PAGES.map((p) => [p, [] as string[]])) as Record<Page, string[]>;

  for (const it of ALL_ITEMS) {
    const elOn = Boolean(get(K_TINT(it.key)));
    const eff = it.states.map((s) => effective(get, it, s, elOn));
    // States are ordered generic first, so an active state's rule can also hit the states after it.
    // Those later states are written too, with their own colour, to win back their elements.
    const first = eff.findIndex(Boolean);
    if (first >= 0) {
      it.states.forEach((s, i) => {
        if (i < first) return;
        const col = eff[i] ?? parseHex(s.def);
        if (!col) return;
        for (const tg of s.targets) {
          // A derived shade only approximates the game's own, so an unchanged state leaves it alone.
          if (!eff[i] && /\{c:(dark|light)\}/.test(tg.decl)) continue;
          css[tg.page].push(`${tg.sel} { ${resolveDecl(tg.decl, col)}; }`);
        }
      });
    }

    if (it.xform) {
      const scale = num(get(K_SCALE(it.key)), 1.0);
      const rot = num(get(K_ROT(it.key)), 0.0);
      if (Math.abs(scale - 1.0) > 1e-4 || Math.abs(rot) > 1e-4) {
        const xf = `scale(${scale}) rotate(${rot}deg)`;
        for (const x of it.xform) {
          const full = x.keep ? `${x.keep} ${xf}` : xf;
          css[x.page].push(`${x.sel} { transform: ${full} !important; transform-origin: center !important; }`);
        }
      }
    }
  }
  return css;
}

/** Defaults for every element key: off, the game's colours, no transform. */
export function elementDefaults(): Record<string, boolean | string | number> {
  const out: Record<string, boolean | string | number> = {};
  for (const it of ALL_ITEMS) {
    out[K_TINT(it.key)] = false;
    for (const s of it.states) out[K_STATE(it, s)] = hex8(s.def);
    if (it.xform) {
      out[K_SCALE(it.key)] = 1.0;
      out[K_ROT(it.key)] = 0.0;
    }
  }
  return out;
}

export function teamDefaults(): Record<string, boolean | string> {
  const out: Record<string, boolean | string> = {};
  for (const tm of TEAMS) {
    out[K_TEAM_TINT(tm)] = false;
    out[K_TEAM_COLOR(tm)] = hex8(GAME[tm].base);
  }
  return out;
}
