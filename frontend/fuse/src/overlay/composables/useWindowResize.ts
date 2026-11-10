/** Edge and corner resize of an app window, held between its minimum and maximum size. */
import { onBeforeUnmount } from "vue";
import { dragging } from "../overlayClient";
import { resizeRect, type Rect, type ResizeDir, type Size } from "../apps/windowGeometry";

export interface WindowResizeOptions {
  rect(): Rect;
  min(): Size;
  max(): Size | null;
  onMove(rect: Rect): void;
  onEnd(rect: Rect): void;
}

export function useWindowResize(opts: WindowResizeOptions): { start(dir: ResizeDir, e: PointerEvent): void } {
  let el: HTMLElement | null = null;
  let dir: ResizeDir = "se";
  let startPtr = { x: 0, y: 0 };
  let startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let last: Rect | null = null;

  function move(e: PointerEvent): void {
    last = resizeRect(startRect, dir, e.clientX - startPtr.x, e.clientY - startPtr.y, opts.min(), opts.max());
    opts.onMove(last);
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
    const result = last;
    stop();
    if (result) opts.onEnd(result);
  }

  function start(d: ResizeDir, e: PointerEvent): void {
    stop();
    el = e.currentTarget as HTMLElement;
    dir = d;
    startPtr = { x: e.clientX, y: e.clientY };
    startRect = { ...opts.rect() };
    last = null;
    el.setPointerCapture(e.pointerId);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    dragging.value = true;
  }

  onBeforeUnmount(stop);
  return { start };
}
