/**
 * Radar geometry, blip tracking and the off-view warning rule. No SDK imports, so tests can load it directly.
 *
 * Frames: radar rem have the origin at the radar's top-left corner, centre (circle, circle), x east, y south.
 * World metres have x east, y north. Bearings are degrees clockwise from north.
 */

export interface RawObject {
  trigger: number;
  type: number;
  aff: number;
  platoon: number;
  x: number;
  y: number;
  rot: number;
}

export interface RawBase {
  id: string;
  sign: string;
  status: number;
  progress: number;
  x: number;
  y: number;
  /** The game's label icon path, empty while the letter shows. */
  icon?: string;
  icon_blink?: number;
}

/** Accessors' `radar` read. */
export interface RadarRead {
  visible: number;
  camera: number;
  turret: number;
  pos: [number, number] | null;
  /** Size of the map's old radar image; `pos` counts from its corner. [0, 0] when the map has none. */
  map_size?: [number, number];
  circle: number;
  range: number;
  cone: number;
  breakpoints: [number, number][];
  objects: RawObject[];
  bases: RawBase[];
}

export const AFF_SELF = 1;
export const AFF_ALLY = 2;
export const AFF_ENEMY = 4;
/** Radar object types of the live HUD (battle_hud e5b3e3bb8701db8b.js, 2026-10-16). Types 2-5 fly. */
export const TYPE_VEHICLE = 0;
/** Flair's proxy pet: the HUD draws a role icon that turns with the camera, as for a vehicle. */
export const TYPE_PROXY = 1;
export const TYPE_HELI = 2;
export const TYPE_PLANE = 3;
/** Live drone tracks flew 45 m/s in a straight line for up to 18 s. */
export const TYPE_DRONE = 4;
export const TYPE_MISSILE = 5;

export function isAir(type: number): boolean {
  return type >= TYPE_HELI && type <= TYPE_MISSILE;
}

/**
 * Travel direction of an air object, degrees clockwise from north. The HUD turns its icon by 180 + rotation.
 * Live 2026-10-16: the move between two scans of a drone matched this within 2° on 7 of 8 steps.
 */
export function airHeading(rotation: number): number {
  return wrap180(rotation + 180);
}

/** Half width of the corridor around you that counts as a hit. */
const HIT_RADIUS_M = 30;
/** Heading error a far object may have and still count as on course. */
const COURSE_TOL_DEG = 10;

/** True when an object at `from`, flying `heading`, points at `to`: within 10°, or within 30 m of it. */
export function onCollisionCourse(from: Vec, heading: number, to: Vec): boolean {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist < HIT_RADIUS_M) return true;
  const off = Math.abs(wrap180(bearing(from, to) - heading));
  return off <= Math.max(COURSE_TOL_DEG, (Math.asin(HIT_RADIUS_M / dist) * 180) / Math.PI);
}

/** Live values on 2026-10-14: 100 m at 70 rem, 200 m at 90 rem, 300 m at 105 rem. */
export const DEFAULT_BREAKPOINTS: [number, number][] = [
  [100, 70],
  [200, 90],
  [300, 105],
];
const DEFAULT_CIRCLE = 105;
/** A point this close to the rim is clamped there by the HUD. */
const RIM_EPS = 0.4;

export interface Vec {
  x: number;
  y: number;
}

export function wrap180(deg: number): number {
  const d = (((deg + 180) % 360) + 360) % 360;
  return d - 180;
}

/** Bearing from `from` to `to`, degrees clockwise from north. */
export function bearing(from: Vec, to: Vec): number {
  return (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
}

function points(r: RadarRead): [number, number][] {
  return r.breakpoints && r.breakpoints.length ? r.breakpoints : DEFAULT_BREAKPOINTS;
}

function centre(r: RadarRead): number {
  return r.circle > 0 ? r.circle : DEFAULT_CIRCLE;
}

/** The player's world position. Sunstroke (2026-10-15): pos (560, 722) with map_size 1200 is world (-40, 122). */
export function worldPos(r: RadarRead): Vec | null {
  if (!r.pos) return null;
  const [sx, sy] = r.map_size ?? [0, 0];
  return { x: r.pos[0] - sx / 2, y: r.pos[1] - sy / 2 };
}

/** Radar rem from the centre to metres, through the breakpoints. Past the last ring it returns the last distance. */
export function remToMetres(rem: number, bp: [number, number][]): number {
  let m0 = 0;
  let r0 = 0;
  for (const [m1, r1] of bp) {
    if (rem <= r1) return r1 === r0 ? m1 : m0 + ((rem - r0) * (m1 - m0)) / (r1 - r0);
    m0 = m1;
    r0 = r1;
  }
  return m0;
}

/** World offset of a radar point from the player, and whether the HUD clamped it to the rim. */
export function radarOffset(r: RadarRead, x: number, y: number): { dx: number; dy: number; rim: boolean } {
  const c = centre(r);
  const ex = x - c;
  const ey = y - c;
  const rem = Math.hypot(ex, ey);
  if (rem === 0) return { dx: 0, dy: 0, rim: false };
  const k = remToMetres(rem, points(r)) / rem;
  return { dx: ex * k, dy: -ey * k, rim: rem >= c - RIM_EPS };
}

export interface Blip {
  /** Same for every poll of one radar sample. */
  key: string;
  x: number;
  y: number;
  /** Metres from the player when the scan placed it. */
  dist: number;
  type: number;
  aff: number;
  platoon: number;
  rot: number;
  /** When the radar scan that placed this blip arrived. */
  seenMs: number;
}

export interface Contact {
  id: number;
  x: number;
  y: number;
  type: number;
  rot: number;
  lastMs: number;
  /** The plugin already warned about this contact. */
  warned: boolean;
}

/** How far an enemy can move between two 2 s scans and still be the same contact. */
const CONTACT_MATCH_M = 70;
/** The same for an air object: live drones moved 90 m per scan. */
const AIR_MATCH_M = 250;
/** A contact missing from this many scans is lost; seeing it again warns again. */
const CONTACT_LOST_MS = 5000;

/**
 * Turns per-poll radar reads into world-fixed blips.
 *
 * The HUD moves `x`/`y` only when its 2 s scan fires, while the player keeps moving. So a sample becomes a world
 * position once, with the player position of the poll where it first appears, and keeps it until the next scan.
 */
export class BlipTracker {
  private samples = new Map<string, Blip>();
  private contacts: Contact[] = [];
  private nextContact = 1;

  reset(): void {
    this.samples.clear();
    this.contacts = [];
  }

  /** Returns every live blip, the enemy contacts that are new on this poll, and every enemy contact a new sample moved. */
  update(r: RadarRead, now: number): { blips: Blip[]; fresh: Contact[]; scanned: Contact[] } {
    const pos = worldPos(r);
    const next = new Map<string, Blip>();
    const fresh: Contact[] = [];
    const scanned: Contact[] = [];
    if (pos) {
      for (const o of r.objects) {
        if (o.aff === AFF_SELF) continue;
        const key = `${o.aff}|${o.type}|${o.trigger}|${o.x.toFixed(2)}|${o.y.toFixed(2)}`;
        let b = this.samples.get(key);
        if (!b) {
          const off = radarOffset(r, o.x, o.y);
          b = {
            key,
            x: pos.x + off.dx,
            y: pos.y + off.dy,
            dist: Math.hypot(off.dx, off.dy),
            type: o.type,
            aff: o.aff,
            platoon: o.platoon,
            rot: o.rot,
            seenMs: now,
          };
          if (o.aff === AFF_ENEMY) {
            const { contact, isNew } = this.match(b, now);
            scanned.push(contact);
            if (isNew) fresh.push(contact);
          }
        }
        next.set(key, b);
      }
    }
    this.samples = next;
    this.contacts = this.contacts.filter((c) => now - c.lastMs < CONTACT_LOST_MS);
    return { blips: [...next.values()], fresh, scanned };
  }

  /** Moves the nearest known contact to the sample, or makes a new one. */
  private match(b: Blip, now: number): { contact: Contact; isNew: boolean } {
    let best: Contact | null = null;
    let bestD = isAir(b.type) ? AIR_MATCH_M : CONTACT_MATCH_M;
    for (const c of this.contacts) {
      if (c.type !== b.type || c.lastMs === now) continue;
      const d = Math.hypot(c.x - b.x, c.y - b.y);
      if (d < bestD && now - c.lastMs < CONTACT_LOST_MS) {
        best = c;
        bestD = d;
      }
    }
    if (best) {
      best.x = b.x;
      best.y = b.y;
      best.rot = b.rot;
      best.lastMs = now;
      return { contact: best, isNew: false };
    }
    const c: Contact = { id: this.nextContact++, x: b.x, y: b.y, type: b.type, rot: b.rot, lastMs: now, warned: false };
    this.contacts.push(c);
    return { contact: c, isNew: true };
  }
}

export type WarnSide = "left" | "right" | "rear";

/**
 * Off-view rule: an enemy inside the front cone around the camera is visible anyway, so it stays silent.
 * Returns the side to warn on, or null.
 */
export function warnSide(rel: number, safeConeDeg: number): WarnSide | null {
  const half = Math.max(0, Math.min(360, safeConeDeg)) / 2;
  const a = Math.abs(wrap180(rel));
  if (a <= half) return null;
  if (a >= 135) return "rear";
  return wrap180(rel) > 0 ? "right" : "left";
}

/** Distance rule of the warning: within the range, or beyond it when inverted. */
export function inWarnRange(dist: number, range: number, invert: boolean): boolean {
  return invert ? dist > range : dist <= range;
}

export interface BaseState {
  sign: string;
  status: number;
  progress: number;
  /** World position, when known. */
  x: number | null;
  y: number | null;
  /** Bearing from the player, always known. */
  bearing: number;
  icon: string;
  iconBlink: boolean;
}

/** Capture points: exact inside the radar range, learned positions or bearings outside it. */
export function readBases(r: RadarRead, learned: Map<string, Vec>): { bases: BaseState[]; learnedNow: [string, Vec][] } {
  const out: BaseState[] = [];
  const learnedNow: [string, Vec][] = [];
  const pos = worldPos(r);
  if (!pos) return { bases: out, learnedNow };
  for (const b of r.bases) {
    const off = radarOffset(r, b.x, b.y);
    const brg = (Math.atan2(off.dx, off.dy) * 180) / Math.PI;
    let at: Vec | null = null;
    if (!off.rim) {
      at = { x: pos.x + off.dx, y: pos.y + off.dy };
      learnedNow.push([b.sign, at]);
    } else {
      at = learned.get(b.sign) ?? null;
    }
    out.push({
      sign: b.sign,
      status: b.status,
      progress: b.progress,
      x: at ? at.x : null,
      y: at ? at.y : null,
      bearing: brg,
      icon: b.icon ?? "",
      iconBlink: Boolean(b.icon_blink),
    });
  }
  return { bases: out, learnedNow };
}
