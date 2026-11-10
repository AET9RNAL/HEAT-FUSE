export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export type Edge = "bottom" | "top" | "left" | "right";
export type SnapZone = "maximize" | "left" | "right" | null;
export type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const TITLE_H = 48;
export const MIN_VISIBLE = 64;
export const TASKBAR_SIZE = 44;
export const TASKBAR_GAP = 8;
export const TASKBAR_STRIP = TASKBAR_SIZE + 2 * TASKBAR_GAP;
export const SNAP_EDGE_PX = 8;
export const CASCADE_PX = 24;

/** The display minus the taskbar strip on one edge. */
export function workArea(display: Rect, edge: Edge, reserve: number): Rect {
  switch (edge) {
    case "top":
      return { x: display.x, y: display.y + reserve, w: display.w, h: display.h - reserve };
    case "left":
      return { x: display.x + reserve, y: display.y, w: display.w - reserve, h: display.h };
    case "right":
      return { x: display.x, y: display.y, w: display.w - reserve, h: display.h };
    default:
      return { x: display.x, y: display.y, w: display.w, h: display.h - reserve };
  }
}

export function halfRect(area: Rect, side: "left" | "right"): Rect {
  const w = Math.floor(area.w / 2);
  return { x: side === "left" ? area.x : area.x + area.w - w, y: area.y, w, h: area.h };
}

export function snapZone(px: number, py: number, display: Rect, edgePx = SNAP_EDGE_PX): SnapZone {
  if (px < display.x || px > display.x + display.w || py < display.y || py > display.y + display.h) return null;
  if (py - display.y <= edgePx) return "maximize";
  if (px - display.x <= edgePx) return "left";
  if (display.x + display.w - px <= edgePx) return "right";
  return null;
}

export function clampSize(size: Size, min: Size, max: Size | null): Size {
  const w = Math.max(min.w, max ? Math.min(max.w, size.w) : size.w);
  const h = Math.max(min.h, max ? Math.min(max.h, size.h) : size.h);
  return { w: Math.round(w), h: Math.round(h) };
}

export function resizeRect(start: Rect, dir: ResizeDir, dx: number, dy: number, min: Size, max: Size | null): Rect {
  const west = dir.includes("w");
  const east = dir.includes("e");
  const north = dir.includes("n");
  const south = dir.includes("s");
  const want: Size = {
    w: start.w + (east ? dx : 0) - (west ? dx : 0),
    h: start.h + (south ? dy : 0) - (north ? dy : 0),
  };
  const size = clampSize(want, min, max);
  return {
    x: Math.round(west ? start.x + start.w - size.w : start.x),
    y: Math.round(north ? start.y + start.h - size.h : start.y),
    w: size.w,
    h: size.h,
  };
}

function overlapLength(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function distanceSq(a: Rect, x: number, y: number): number {
  const dx = Math.max(a.x - x, 0, x - (a.x + a.w));
  const dy = Math.max(a.y - y, 0, y - (a.y + a.h));
  return dx * dx + dy * dy;
}

/** The area that holds a point, else the nearest one. */
export function areaAtPoint(areas: Rect[], x: number, y: number): Rect | null {
  let best: Rect | null = null;
  let bestD = Infinity;
  for (const a of areas) {
    const d = distanceSq(a, x, y);
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/** The area under the centre of a box. */
export function areaOfRect(areas: Rect[], r: Rect): Rect | null {
  return areaAtPoint(areas, r.x + r.w / 2, r.y + r.h / 2);
}

/**
 * Moves a window so the user can grab its title bar: the top of the window is on a
 * display, and MIN_VISIBLE px of the title bar overlap that display.
 */
export function keepReachable(r: Rect, areas: Rect[]): Rect {
  for (const a of areas) {
    const topInside = r.y >= a.y && r.y + TITLE_H <= a.y + a.h;
    if (topInside && overlapLength(r.x, r.x + r.w, a.x, a.x + a.w) >= Math.min(MIN_VISIBLE, r.w)) return r;
  }
  const a = areaAtPoint(areas, r.x + r.w / 2, r.y);
  if (!a) return r;
  const minX = a.x - r.w + Math.min(MIN_VISIBLE, r.w);
  const maxX = a.x + a.w - Math.min(MIN_VISIBLE, r.w);
  return {
    x: Math.round(Math.min(Math.max(r.x, minX), maxX)),
    y: Math.round(Math.min(Math.max(r.y, a.y), a.y + a.h - TITLE_H)),
    w: r.w,
    h: r.h,
  };
}

/** A new window: centred in the area, moved down and right by `index` cascade steps, and fitted to the area. */
export function placeNew(area: Rect, size: Size, index: number): Rect {
  const w = Math.min(size.w, area.w);
  const h = Math.min(size.h, area.h);
  const step = CASCADE_PX * (index % 8);
  return {
    x: Math.round(area.x + (area.w - w) / 2 + step),
    y: Math.round(area.y + (area.h - h) / 2 + step),
    w,
    h,
  };
}

export function restoreUnderPointer(restore: Size, maximized: Rect, px: number, py: number): Rect {
  const share = maximized.w > 0 ? (px - maximized.x) / maximized.w : 0.5;
  return {
    x: Math.round(px - restore.w * Math.min(1, Math.max(0, share))),
    y: Math.round(py - TITLE_H / 2),
    w: restore.w,
    h: restore.h,
  };
}
