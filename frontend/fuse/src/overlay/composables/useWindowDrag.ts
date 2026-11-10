import { onBeforeUnmount } from "vue";
import { dragging } from "../overlayClient";
import { overlayAreas, stageOffset } from "../screens";
import { snapMove, type Box } from "./useSnapping";
import { areaAtPoint, halfRect, restoreUnderPointer, snapZone, type Rect, type SnapZone } from "../apps/windowGeometry";

/** A small move is a click or a double-click, not a drag. */
const DRAG_START_PX = 4;

export type SnapPreview = { rect: Rect; zone: Exclude<SnapZone, null> } | null;

export interface WindowDragOptions {
  /** The window's rect: the place it restores to while it is maximized. */
  rect(): Rect;
  maximizedRect(): Rect | null;
  peers(): Box[];
  /** The display minus the taskbar strip. */
  workAreaFor(display: Rect): Rect;
  onMove(rect: Rect, preview: SnapPreview): void;
  onEnd(rect: Rect, zone: SnapZone, preview: SnapPreview, fromMaximized: boolean): void;
}

export function useWindowDrag(opts: WindowDragOptions): { start(e: PointerEvent): void } {
  let el: HTMLElement | null = null;
  let startPtr = { x: 0, y: 0 };
  let startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let last: Rect = startRect;
  let peers: Box[] = [];
  let moved = false;
  let fromMax = false;
  let zone: SnapZone = null;
  let preview: SnapPreview = null;

  function toOverlay(e: PointerEvent): { x: number; y: number } {
    const s = stageOffset.value;
    return { x: e.clientX + s.x, y: e.clientY + s.y };
  }

  function move(e: PointerEvent): void {
    if (!moved) {
      if (Math.hypot(e.clientX - startPtr.x, e.clientY - startPtr.y) < DRAG_START_PX) return;
      moved = true;
      const max = opts.maximizedRect();
      if (fromMax && max) {
        const p = toOverlay(e);
        startRect = restoreUnderPointer(startRect, max, p.x, p.y);
        startPtr = { x: e.clientX, y: e.clientY };
      }
    }
    const raw = {
      x: startRect.x + (e.clientX - startPtr.x),
      y: startRect.y + (e.clientY - startPtr.y),
      w: startRect.w,
      h: startRect.h,
    };
    const snapped = snapMove(raw, peers, "smart", 8, e.altKey);
    last = { x: Math.round(snapped.x), y: Math.round(snapped.y), w: raw.w, h: raw.h };

    const p = toOverlay(e);
    const display = areaAtPoint(overlayAreas(), p.x, p.y);
    zone = display ? snapZone(p.x, p.y, display) : null;
    if (display && zone) {
      const work = opts.workAreaFor(display);
      preview = { zone, rect: zone === "maximize" ? work : halfRect(work, zone) };
    } else {
      preview = null;
    }
    opts.onMove(last, preview);
  }

  function stop(): void {
    if (!el) return;
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
    el = null;
    dragging.value = false;
  }

  function end(): void {
    const wasMoved = moved;
    stop();
    if (wasMoved) opts.onEnd(last, zone, preview, fromMax);
  }

  function start(e: PointerEvent): void {
    stop();
    el = e.currentTarget as HTMLElement;
    startPtr = { x: e.clientX, y: e.clientY };
    startRect = { ...opts.rect() };
    last = startRect;
    peers = opts.peers();
    moved = false;
    fromMax = opts.maximizedRect() !== null;
    zone = null;
    preview = null;
    el.setPointerCapture(e.pointerId);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    // The stage keeps the mouse while the pointer is outside the window during the drag.
    dragging.value = true;
  }

  onBeforeUnmount(stop);
  return { start };
}
