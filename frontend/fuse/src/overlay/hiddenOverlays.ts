/**
 * Overlays the stage window does not show: their saved rect lies fully on
 * displays outside the stage.
 */
import { computed, watch } from "vue";
import { formatCombo, hostHotkeys, overlays } from "./overlayClient";
import { pushNotification, removeNotification } from "./notifications";
import { areaOf, displays, overlayAreas, stageOffset, type Area, type DisplayArea } from "./screens";

export interface HiddenOverlay {
  overlayId: string;
  /** The display that holds it, or the nearest one. */
  display: DisplayArea | null;
}

function overlaps(a: Area, b: Area): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export const hiddenOverlays = computed<HiddenOverlay[]>(() => {
  if (!displays.value.length) return [];
  const shown = overlayAreas();
  const s = stageOffset.value;
  const all = displays.value.map((d) => ({ d, a: { x: d.x + s.x, y: d.y + s.y, w: d.w, h: d.h } }));
  const out: HiddenOverlay[] = [];
  for (const o of overlays.values()) {
    const r = o.rect;
    // No saved rect means the default spot, on the main display.
    if (!r) continue;
    const box = { x: r.x, y: r.y, w: r.w || o.size.w, h: r.h || o.size.h };
    if (shown.some((a) => overlaps(a, box))) continue;
    const holder = areaOf(box, all.map((e) => e.a));
    out.push({ overlayId: o.overlayId, display: all.find((e) => e.a === holder)?.d ?? null });
  }
  return out;
});

const NOTICE_ID = "fuse:hidden-overlays";
const SEEN_KEY = "fuse:hidden-overlays-seen";
const SETTLE_MS = 2000;

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSeen(value: string): void {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch { /* the notice can show again, nothing else breaks */ }
}

/**
 * Tells the user once about each new set of hidden overlays. Overlays and the
 * display layout arrive apart, so the set settles first.
 */
export function initHiddenOverlayNotice(): void {
  let timer = 0;
  watch(
    () => hiddenOverlays.value.map((h) => h.overlayId).sort().join("|"),
    (key) => {
      window.clearTimeout(timer);
      if (!key) {
        removeNotification(NOTICE_ID);
        return;
      }
      timer = window.setTimeout(() => {
        if (key === readSeen()) return;
        writeSeen(key);
        const n = hiddenOverlays.value.length;
        pushNotification({
          id: NOTICE_ID,
          source: "FUSE",
          title: "Overlays outside the stage",
          message: `${n} ${n > 1 ? "overlays are" : "overlay is"} on a display that the stage does not cover. Press ${formatCombo(hostHotkeys.lock)}, then add the display in the toolbar.`,
          type: "warning",
          icon: "monitor",
          duration: 15000,
          createdAt: Date.now(),
        });
      }, SETTLE_MS);
    },
  );
}
