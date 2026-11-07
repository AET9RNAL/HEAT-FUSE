import { computed, ref } from "vue";

/** A box in stage px. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DisplayArea extends Area {
  primary: boolean;
}

/** Every display's box in the stage window. Empty outside the Electron stage. */
export const displays = ref<DisplayArea[]>([]);

/** The primary display's box. Null outside the Electron stage. */
export const primaryDisplay = computed<DisplayArea | null>(
  () => displays.value.find((d) => d.primary) ?? displays.value[0] ?? null,
);

/**
 * Region of the virtual desktop this client renders, when broadcasting a single
 * display to OBS. Overlay rects are in virtual-desktop coordinates, so the stage
 * shifts by -x/-y to bring the chosen monitor's region into view. Null in the
 * Electron stage window, which already spans the whole virtual desktop.
 */
export const viewport = ref<Area | null>(null);

function pageArea(): Area {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

/** Visible areas in page px: each display, or the whole page. */
export function screenAreas(): Area[] {
  return displays.value.length ? displays.value : [pageArea()];
}

/** Visible areas in overlay coordinates: each display, the OBS viewport, or the whole page. */
export function overlayAreas(): Area[] {
  if (displays.value.length) return displays.value;
  return [viewport.value ?? pageArea()];
}

/** The primary display in page px, or the whole page. */
export function mainScreen(): Area {
  return primaryDisplay.value ?? pageArea();
}

/** The primary display in overlay coordinates, the OBS viewport, or the whole page. */
export function mainOverlayArea(): Area {
  return primaryDisplay.value ?? viewport.value ?? pageArea();
}

function distanceSq(a: Area, x: number, y: number): number {
  const dx = Math.max(a.x - x, 0, x - (a.x + a.w));
  const dy = Math.max(a.y - y, 0, y - (a.y + a.h));
  return dx * dx + dy * dy;
}

function overlap(a: Area, b: Area): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The area that holds a point, else the nearest one. */
export function areaAt(x: number, y: number, areas: Area[] = screenAreas()): Area {
  let best = areas[0];
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

/** The area that holds most of a box, else the one nearest its centre. */
export function areaOf(box: Area, areas: Area[] = screenAreas()): Area {
  let best: Area | null = null;
  let bestO = 0;
  for (const a of areas) {
    const o = overlap(a, box);
    if (o > bestO) {
      best = a;
      bestO = o;
    }
  }
  return best ?? areaAt(box.x + box.w / 2, box.y + box.h / 2, areas);
}

/** Moves a box inside an area. A box larger than the area keeps its top-left corner in. */
export function keepInside(box: Area, a: Area, margin = 0): { x: number; y: number } {
  const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
  return {
    x: clamp(box.x, a.x + margin, a.x + a.w - box.w - margin),
    y: clamp(box.y, a.y + margin, a.y + a.h - box.h - margin),
  };
}

/** Room the stage toolbar takes at the bottom of the primary display. */
const TOOLBAR_ROOM = 96;

/** Max height of a floating panel with its top edge at (x, y): down to the bottom of its display, above the toolbar on the primary one. */
export function panelMaxHeight(x: number, y: number, w: number, margin: number, minH = 160): number {
  const a = areaAt(x + w / 2, y);
  const m = mainScreen();
  const isMain = a.x === m.x && a.y === m.y && a.w === m.w && a.h === m.h;
  return Math.max(minH, a.y + a.h - y - (isMain ? TOOLBAR_ROOM : margin));
}

/** Top-left corner of a w × h box centred in an area. */
export function centerIn(a: Area, w: number, h: number): { x: number; y: number } {
  return { x: Math.round(a.x + (a.w - w) / 2), y: Math.round(a.y + (a.h - h) / 2) };
}
