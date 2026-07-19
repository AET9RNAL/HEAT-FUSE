import { reactive, ref, watch } from "vue";

export type SnapMode = "smart" | "grid" | "off";

export interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

const GRID_KEY = "fuse.overlay.grid";
const INSPECTOR_KEY = "fuse.overlay.inspector";
const MIN_GRID = 2;
const MAX_GRID = 512;

export const selectedId = ref<string | null>(null);
export const grid = reactive({ visible: false, size: 8, mode: "smart" as SnapMode });
export const activeGuides = ref<Guide[]>([]);

export const lockAspect = ref(false);
export const inspectorPos = ref<{ x: number; y: number } | null>(null);

export function selectOverlay(id: string): void {
  selectedId.value = id;
}

export function clearSelection(): void {
  selectedId.value = null;
}

function loadInspectorPos(): void {
  try {
    const raw = localStorage.getItem(INSPECTOR_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<{ x: number; y: number }>;
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      inspectorPos.value = { x: saved.x as number, y: saved.y as number };
    }
  } catch {
    // Corrupt or unavailable storage - the inspector falls back to its default spot.
  }
}

function loadGrid(): void {
  try {
    const raw = localStorage.getItem(GRID_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<typeof grid>;
    if (typeof saved.visible === "boolean") grid.visible = saved.visible;
    if (typeof saved.size === "number" && Number.isFinite(saved.size)) {
      grid.size = Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(saved.size)));
    }
    if (saved.mode === "smart" || saved.mode === "grid" || saved.mode === "off") {
      grid.mode = saved.mode;
    }
  } catch {
    // Corrupt or unavailable storage - defaults are fine.
  }
}

loadGrid();
loadInspectorPos();

watch(
  grid,
  () => {
    try {
      localStorage.setItem(GRID_KEY, JSON.stringify({ ...grid }));
    } catch {
      // Non-fatal: the grid just won't persist.
    }
  },
  { deep: true },
);

watch(
  inspectorPos,
  (p) => {
    if (!p) return;
    try {
      localStorage.setItem(INSPECTOR_KEY, JSON.stringify(p));
    } catch {
      // Non-fatal: the inspector just won't remember where it was.
    }
  },
  { deep: true },
);
