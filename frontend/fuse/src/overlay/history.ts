/**
 * Undo stack for overlay transforms - position, size, rotation and opacity, recoded on commit only
 */
import { computed, ref } from "vue";
import { overlays, sendTransform } from "./overlayClient";
import type { OverlayRect } from "./types";

interface Entry {
  overlayId: string;
  before: OverlayRect;
  after: OverlayRect;
}

const LIMIT = 50;

const past = ref<Entry[]>([]);
const future = ref<Entry[]>([]);

export const canUndo = computed(() => past.value.length > 0);
export const canRedo = computed(() => future.value.length > 0);

function currentRect(overlayId: string): OverlayRect | null {
  const d = overlays.get(overlayId);
  if (!d) return null;
  if (d.rect) return { ...d.rect };
  const { w, h } = d.size;
  return { x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2), w, h };
}

function same(a: OverlayRect, b: OverlayRect): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    (a.rot ?? 0) === (b.rot ?? 0) &&
    (a.opacity ?? 1) === (b.opacity ?? 1)
  );
}

/** Commit a transform and record it as one undo step. */
export function commitTransform(overlayId: string, next: OverlayRect): void {
  const before = currentRect(overlayId);
  sendTransform(overlayId, next);
  if (!before || same(before, next)) return;
  past.value.push({ overlayId, before, after: { ...next } });
  if (past.value.length > LIMIT) past.value.shift();
  future.value = [];
}

export function undo(): void {
  const entry = past.value.pop();
  if (!entry) return;
  future.value.push(entry);
  sendTransform(entry.overlayId, entry.before);
}

export function redo(): void {
  const entry = future.value.pop();
  if (!entry) return;
  past.value.push(entry);
  sendTransform(entry.overlayId, entry.after);
}

export function clearHistory(): void {
  past.value = [];
  future.value = [];
}
