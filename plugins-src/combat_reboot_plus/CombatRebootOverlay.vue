<script setup lang="ts">
import { computed, ref, watch, onUnmounted, onMounted } from "vue";
import "fuse_ui/ui/tokens.css";

interface CombatRebootData {
  progress: number;
  cooldown: boolean;
  active: boolean;
  trigger: number; 
}

const props = defineProps<{ data: Partial<CombatRebootData> }>();

const SEGMENTS = 5;
const FLASHES = 5;
const FLASH_MS = 300;

const cooldown = computed(() => !!props.data?.cooldown);
const active = computed(() => props.data?.active !== false);
const strobing = ref(false);

const progress = computed(() =>
  strobing.value ? 1 : Math.max(0, Math.min(1, props.data?.progress ?? 0)),
);
const fillColor = computed(() =>
  cooldown.value && !strobing.value ? "var(--error-highlight)" : "var(--light-green)",
);

const cells = computed(() =>
  Array.from({ length: SEGMENTS }, (_, i) => Math.max(0, Math.min(1, progress.value * SEGMENTS - i))),
);

let strobeTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => props.data?.trigger,
  (n, o) => {
    if (n == null || n === o) return;
    strobing.value = false;
    requestAnimationFrame(() => {
      strobing.value = true;
      clearTimeout(strobeTimer);
      strobeTimer = setTimeout(() => (strobing.value = false), FLASHES * FLASH_MS);
    });
  },
);
onUnmounted(() => clearTimeout(strobeTimer));

const CUT = 6;
const containerEl = ref<HTMLElement | null>(null);
const elW = ref(0);
const elH = ref(0);
const svgPoints = computed(() => {
  const w = elW.value;
  const h = elH.value;
  if (!w || !h) return "";
  const cx = (CUT / w) * 100;
  const cy = (CUT / h) * 100;
  return `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`;
});

let ro: ResizeObserver | null = null;
onMounted(() => {
  if (!containerEl.value) return;
  ro = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    elW.value = box ? box.inlineSize : entry.contentRect.width;
    elH.value = box ? box.blockSize : entry.contentRect.height;
  });
  ro.observe(containerEl.value);
});
onUnmounted(() => ro?.disconnect());
</script>

<template>
  <div class="crb-overlay" :class="{ dim: !active }">
    <div ref="containerEl" class="crb-box">
      <div class="crb-cells" :class="{ strobe: strobing }">
        <div v-for="(fill, i) in cells" :key="i" class="crb-cell">
          <div
            class="crb-cell-fill"
            :style="{ transform: `scaleX(${fill})`, background: fillColor }"
          />
        </div>
      </div>
      <svg
        v-if="svgPoints"
        class="crb-stroke"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          :points="svgPoints"
          fill="none"
          stroke="#525252"
          stroke-width="0.4"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.crb-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.25s;
}

.crb-overlay.dim {
  opacity: 0.4;
}

.crb-box {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background-color: var(--black-1-a);
  clip-path: polygon(
    6px 0%,
    100% 0%,
    100% calc(100% - 6px),
    calc(100% - 6px) 100%,
    0% 100%,
    0% 6px
  );
}

.crb-stroke {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 1;
}

.crb-cells {
  display: flex;
  gap: var(--space-1);
}

.crb-cells.strobe {
  animation: crb-strobe 0.12s ease-in-out 5;
}

@keyframes crb-strobe {
  0%   { filter: brightness(1); }
  50%  { filter: brightness(2.4) drop-shadow(0 0 4px var(--light-green)); }
  100% { filter: brightness(1); }
}

.crb-cell {
  position: relative;
  width: 14px;
  height: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
  clip-path: polygon(
    3px 0%,
    100% 0%,
    100% calc(100% - 3px),
    calc(100% - 3px) 100%,
    0% 100%,
    0% 3px
  );
}

.crb-cell-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  transition: transform 0.15s ease, background 0.25s ease;
}
</style>
