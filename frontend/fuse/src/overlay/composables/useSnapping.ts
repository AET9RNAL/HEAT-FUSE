import { overlays } from "../overlayClient";
import type { Guide, SnapMode } from "../stageState";
import type { OverlayRect } from "../types";

/** Axis-aligned bounds of a snap target, in stage px. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Candidate {
  at: number;
  box: Box;
}

const THRESHOLD = 6;

function boxOf(rect: OverlayRect): Box {
  const rot = rect.rot ?? 0;
  if (rot === 0) {
    return { left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h };
  }
  // Rotation is about the center, so the AABB grows symmetrically around it.
  const rad = (rot * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = rect.w * cos + rect.h * sin;
  const h = rect.w * sin + rect.h * cos;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
}

/**
 * Snap targets for a gesture. Call once at gesture start - peers cannot move
 * mid-gesture, and recomputing per pointermove would be wasteful.
 */
export function peerBoxes(movingId: string): Box[] {
  const boxes: Box[] = [];
  for (const d of overlays.values()) {
    if (d.overlayId === movingId || !d.visible || !d.rect) continue;
    boxes.push(boxOf(d.rect));
  }
  return boxes;
}

function viewportBox(): Box {
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
}

function candidates(peers: Box[], axis: "x" | "y"): Candidate[] {
  const out: Candidate[] = [];
  const push = (box: Box): void => {
    if (axis === "x") {
      out.push({ at: box.left, box }, { at: (box.left + box.right) / 2, box }, { at: box.right, box });
    } else {
      out.push({ at: box.top, box }, { at: (box.top + box.bottom) / 2, box }, { at: box.bottom, box });
    }
  };
  for (const p of peers) push(p);
  push(viewportBox());
  return out;
}

/** Snap one axis of a moving span. `edges` are the moving object's own lines. */
function resolveAxis(
  edges: number[],
  moving: Box,
  peers: Box[],
  axis: "x" | "y",
): { delta: number; guide: Guide | null } {
  let best: { delta: number; cand: Candidate } | null = null;
  for (const cand of candidates(peers, axis)) {
    for (const edge of edges) {
      const delta = cand.at - edge;
      if (Math.abs(delta) > THRESHOLD) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, cand };
    }
  }
  if (!best) return { delta: 0, guide: null };

  // Span the guide across both objects so it visually connects them.
  const b = best.cand.box;
  const from = axis === "x" ? Math.min(moving.top, b.top) : Math.min(moving.left, b.left);
  const to = axis === "x" ? Math.max(moving.bottom, b.bottom) : Math.max(moving.right, b.right);
  return { delta: best.delta, guide: { axis, at: best.cand.at, from, to } };
}

function snapToGrid(value: number, size: number): number {
  return size > 0 ? Math.round(value / size) * size : value;
}

/**
 * Snap a moving rect's origin. Returns the corrected origin plus the guides to
 * draw. `bypass` (Alt held) short-circuits to the raw position.
 */
export function snapMove(
  rect: OverlayRect,
  peers: Box[],
  mode: SnapMode,
  gridSize: number,
  bypass: boolean,
): { x: number; y: number; guides: Guide[] } {
  if (bypass || mode === "off") return { x: rect.x, y: rect.y, guides: [] };
  if (mode === "grid") {
    return { x: snapToGrid(rect.x, gridSize), y: snapToGrid(rect.y, gridSize), guides: [] };
  }

  const moving = boxOf(rect);
  const x = resolveAxis([moving.left, (moving.left + moving.right) / 2, moving.right], moving, peers, "x");
  const y = resolveAxis([moving.top, (moving.top + moving.bottom) / 2, moving.bottom], moving, peers, "y");

  const guides: Guide[] = [];
  if (x.guide) guides.push(x.guide);
  if (y.guide) guides.push(y.guide);
  return { x: rect.x + x.delta, y: rect.y + y.delta, guides };
}

/**
 * Snap a single moving edge (resize). `moving` is the rect's current bounds,
 * used only to size the emitted guide.
 */
export function snapEdge(
  value: number,
  axis: "x" | "y",
  moving: Box,
  peers: Box[],
  mode: SnapMode,
  gridSize: number,
  bypass: boolean,
): { value: number; guide: Guide | null } {
  if (bypass || mode === "off") return { value, guide: null };
  if (mode === "grid") return { value: snapToGrid(value, gridSize), guide: null };
  const { delta, guide } = resolveAxis([value], moving, peers, axis);
  return { value: value + delta, guide };
}
